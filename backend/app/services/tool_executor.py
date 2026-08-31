import json
import re
import time
import uuid
from typing import Dict, Any, Optional, List

from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from app.ai.tools.models import ToolCall, ToolExecutionRecord
from app.ai.tools import tool_registry


class ToolExecutor:
    """Verified tool execution layer.

    Every execution produces a ``ToolExecutionRecord`` with an explicit state:

      - PENDING   created before execution starts
      - EXECUTING the integration provider has been invoked
      - SUCCEEDED provider returned a verifiable success signal (+ resource ID
                  for create/send style actions)
      - FAILED    provider returned an error, preflight failed, tool not found,
                  or the response could not be verified

    Success is never fabricated: a plain-text or empty provider response is a
    FAILED record with ``error_code=UNVERIFIED_RESPONSE``.
    """

    TOOL_DISPATCHER = {
        "GoogleCalendar.createEvent": ("int_gcal", "create_event"),
        "GoogleCalendar.create_event": ("int_gcal", "create_event"),
        "calendar_create_event": ("int_gcal", "create_event"),
        "GoogleCalendar.listEvents": ("int_gcal", "list_events"),
        "GoogleCalendar.list_events": ("int_gcal", "list_events"),
        "calendar_list_events": ("int_gcal", "list_events"),
        "GoogleCalendar.updateEvent": ("int_gcal", "update_event"),
        "GoogleCalendar.update_event": ("int_gcal", "update_event"),
        "calendar_update_event": ("int_gcal", "update_event"),
        "GoogleCalendar.deleteEvent": ("int_gcal", "delete_event"),
        "GoogleCalendar.delete_event": ("int_gcal", "delete_event"),
        "calendar_delete_event": ("int_gcal", "delete_event"),

        # Gmail
        "Gmail.sendEmail": ("int_gmail", "send_email"),
        "Gmail.send_email": ("int_gmail", "send_email"),
        "gmail_send_email": ("int_gmail", "send_email"),
        "Gmail.searchEmails": ("int_gmail", "search_emails"),
        "Gmail.search_emails": ("int_gmail", "search_emails"),
        "gmail_search_emails": ("int_gmail", "search_emails"),
        "Gmail.readEmail": ("int_gmail", "read_email"),
        "Gmail.read_email": ("int_gmail", "read_email"),
        "gmail_read_email": ("int_gmail", "read_email"),

        # Google Drive
        "GoogleDrive.searchFiles": ("int_gdrive", "search_files"),
        "GoogleDrive.search_files": ("int_gdrive", "search_files"),
        "gdrive_search_files": ("int_gdrive", "search_files"),
        "GoogleDrive.listFiles": ("int_gdrive", "list_files"),
        "GoogleDrive.list_files": ("int_gdrive", "list_files"),
        "gdrive_list_files": ("int_gdrive", "list_files"),

        # Slack
        "Slack.sendMessage": ("int_slack", "send_message"),
        "Slack.send_message": ("int_slack", "send_message"),
        "slack_send_message": ("int_slack", "send_message"),
    }

    # Recent tool_call_id dedupe keyed by conversation: {(conversation_id, tool_call_id): ts}
    _recent_calls: Dict[tuple, float] = {}
    _DEDUPE_WINDOW_SECONDS = 600

    @classmethod
    def _is_duplicate(cls, tool_call_id: str, conversation_id: str = "") -> bool:
        if not tool_call_id:
            return False
        key = (conversation_id or "", tool_call_id)
        now = time.time()
        # Prune stale entries
        cls._recent_calls = {
            k: v for k, v in cls._recent_calls.items()
            if now - v < cls._DEDUPE_WINDOW_SECONDS
        }
        if key in cls._recent_calls:
            return True
        cls._recent_calls[key] = now
        return False

    @classmethod
    async def execute_tool_call(
        cls,
        workspace_id: str,
        agent_id: str,
        tool_call: ToolCall,
        conversation_id: str = "",
        user_id: str = "",
        mode: str = "live",
    ) -> ToolExecutionRecord:
        """Executes a single structured ToolCall and returns an auditable record.

        ``mode``:
          - ``"live"``      real execution against the connected integration.
          - ``"simulation"`` resolves the tool, runs the real preflight checks
                            (assignment + connection + OAuth resolution) but
                            short-circuits the external API call. The returned
                            record is marked ``simulated=True`` and never claims
                            a real external action happened.
        """
        started = time.time()
        record = ToolExecutionRecord(
            id=f"tre_{uuid.uuid4().hex[:10]}",
            tool_call_id=tool_call.id,
            workspace_id=workspace_id,
            agent_id=agent_id,
            conversation_id=conversation_id,
            tool=tool_call.name,
            action=tool_call.action or "execute",
            integration_id=tool_call.integration_id,
            status="PENDING",
            started_at=started,
        )

        # 1. Duplicate protection (scoped per conversation)
        if cls._is_duplicate(tool_call.id, conversation_id):
            return cls._finalize(record, "FAILED", "DUPLICATE_TOOL_CALL",
                                 "This tool call was already executed in this conversation.", started)

        # 2. Resolve tool via deterministic registry
        resolved = tool_registry.resolve(
            tool_call.name,
            method=tool_call.action,
            raw_name=tool_call.raw_name,
        )
        if not resolved:
            return cls._finalize(record, "FAILED", "TOOL_NOT_FOUND",
                                 f"Tool '{tool_call.name}' is not registered. Only registered tools may execute.", started)

        integration_id = resolved["integration_id"]
        action = resolved["action"]
        record.integration_id = integration_id
        record.action = action

        # Handle platform tools execution directly here
        if integration_id == "platform":
            if mode == "simulation":
                return cls._finalize_simulated(record, action, tool_call.args, started)
            
            record.status = "EXECUTING"
            try:
                from app.ai.tools.platform_tools import PlatformToolExecutor
                result = await PlatformToolExecutor.execute(workspace_id, action, tool_call.args)
                if isinstance(result, dict):
                    return cls._record_from_dict(record, result, started)
                return cls._finalize(record, "FAILED", "UNVERIFIED_RESPONSE",
                                     "Platform execution returned an unverifiable response type.", started)
            except Exception as e:
                log_error(f"Platform tool execution error for {tool_call.name}.{action}", exc=e)
                return cls._finalize(record, "FAILED", "EXECUTION_ERROR", str(e), started)

        # 3. Lightweight connection / assignment check (no network)
        from app.ai.integration.preflight import IntegrationPreflight
        preflight = await IntegrationPreflight.check(workspace_id, agent_id, integration_id, lightweight=True)
        if preflight.status != "READY":
            return cls._finalize(record, "FAILED", preflight.status,
                                 preflight.message, started)

        # 3b. Simulation mode: no external API call is made. The record is
        #     clearly marked simulated so the UI can never mistake it for a
        #     real external action.
        if mode == "simulation":
            return cls._finalize_simulated(record, action, tool_call.args, started)

        # 4. Execute the provider capability
        record.status = "EXECUTING"
        try:
            from app.services.integration_service import IntegrationService
            provider = IntegrationService._get_provider(integration_id)
            result = await provider.execute(workspace_id, action, tool_call.args)

            if isinstance(result, dict):
                return cls._record_from_dict(record, result, started)
            if isinstance(result, str):
                return cls._record_from_string(record, result, started)
            return cls._finalize(record, "FAILED", "UNVERIFIED_RESPONSE",
                                 "Integration returned an unverifiable response type.", started)
        except Exception as e:
            log_error(f"Tool execution error for {tool_call.name}.{action}", exc=e)
            return cls._finalize(record, "FAILED", "EXECUTION_ERROR", str(e), started)

    @classmethod
    def _finalize_simulated(cls, record: ToolExecutionRecord, action: str, args: dict, started: float) -> ToolExecutionRecord:
        """Builds a clearly-labelled simulated record. No external API is called."""
        record.status = "SUCCEEDED"
        record.external_resource_id = f"sim_{uuid.uuid4().hex[:10]}"
        record.message = (
            f"[Simulated] {action} resolved — no external API was called and no real "
            f"{record.tool} action occurred."
        )
        record.data = {
            "simulated": True,
            "action": action,
            "args": args or {},
        }
        record.simulated = True
        record.completed_at = time.time()
        record.duration_ms = int((record.completed_at - started) * 1000)
        try:
            firestore_client.collection("tool_executions").document(record.id).set(
                record.to_dict()
            )
        except Exception as e:
            log_error("Failed to persist simulated tool execution record", exc=e)
        return record

    @classmethod
    def _record_from_dict(cls, record: ToolExecutionRecord, result: Dict[str, Any], started: float) -> ToolExecutionRecord:
        if result.get("success") is True:
            data = result.get("data") or {}
            external_id = (
                data.get("event_id") or data.get("message_id") or data.get("id")
                or data.get("external_resource_id") or result.get("external_resource_id")
                or result.get("event_id")
            )
            record.data = data
            record.external_resource_id = external_id
            record.message = result.get("message") or "Action completed and verified."
            return cls._finalize(record, "SUCCEEDED", None, record.message, started)

        return cls._finalize(
            record,
            "FAILED",
            result.get("error_code") or "PROVIDER_ERROR",
            result.get("message") or "Integration returned an error.",
            started,
            data=result,
        )

    @classmethod
    def _record_from_string(cls, record: ToolExecutionRecord, text: str, started: float) -> ToolExecutionRecord:
        text_stripped = (text or "").strip()
        if not text_stripped or text_stripped.lower().startswith("error:"):
            code = "PROVIDER_ERROR" if text_stripped else "UNVERIFIED_RESPONSE"
            return cls._finalize(record, "FAILED", code, text_stripped or "Empty response.", started)

        # Verified success requires either an embedded resource ID or an
        # explicit read/search acknowledgement from a real API call.
        resource_id = cls._extract_resource_id(text_stripped)
        is_success_marker = "successfully" in text_stripped.lower()
        is_read_result = any(kw in text_stripped.lower() for kw in ["found", "no emails", "no events", "details"])

        if (is_success_marker and resource_id) or is_read_result:
            record.external_resource_id = resource_id
            record.message = text_stripped
            record.data = {"message": text_stripped}
            return cls._finalize(record, "SUCCEEDED", None, text_stripped, started)

        return cls._finalize(record, "FAILED", "UNVERIFIED_RESPONSE",
                             text_stripped[:160], started)

    @staticmethod
    def _extract_resource_id(text: str) -> Optional[str]:
        patterns = [
            r"Message ID:\s*(\S+)",
            r"Draft ID:\s*(\S+)",
            r"event_id:\s*(\S+)",
            r"message_id:\s*(\S+)",
            r"ID:\s*([a-zA-Z0-9_\-]{4,})",
            r"id:\s*([a-zA-Z0-9_\-]{4,})",
        ]
        for pat in patterns:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1)
        return None

    @classmethod
    def _finalize(
        cls,
        record: ToolExecutionRecord,
        status: str,
        error_code: Optional[str],
        message: str,
        started: float,
        data: Optional[Dict[str, Any]] = None,
    ) -> ToolExecutionRecord:
        record.status = status
        record.error_code = error_code
        record.message = message
        if data:
            record.data = data
        record.completed_at = time.time()
        record.duration_ms = int((record.completed_at - started) * 1000)
        try:
            firestore_client.collection("tool_executions").document(record.id).set(
                record.to_dict()
            )
        except Exception as e:
            log_error("Failed to persist tool execution record", exc=e)
        return record

    @classmethod
    async def execute(cls, workspace_id: str, tool_name: str, method_name: str, args: dict, agent_id: str = "unknown", mode: str = "live") -> dict:
        """Backward-compatible wrapper that returns a plain dict result."""
        tool_call = ToolCall(
            id=f"call_legacy_{uuid.uuid4().hex[:6]}",
            name=tool_name,
            action=method_name or "execute",
            args=args or {},
            raw_name=tool_name,
        )
        record = await cls.execute_tool_call(
            workspace_id=workspace_id,
            agent_id=agent_id,
            tool_call=tool_call,
            mode=mode,
        )
        return record.to_user_payload()