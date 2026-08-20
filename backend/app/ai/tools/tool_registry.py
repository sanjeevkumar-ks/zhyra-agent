"""
Deterministic Tool Registry
===========================

The registry is the single source of truth for the mapping:

    tool name → integration → executor action

The LLM is never allowed to invoke arbitrary Python. Every emitted tool name is
resolved here. If a name is not registered, the call is refused with
``TOOL_NOT_FOUND``.

Tool keys use the canonical form ``<provider>.<action>`` (e.g.
``google_calendar.create_event``). Historical aliases used by older prompts
(``GoogleCalendar.create_event``, ``calendar_create_event``, ...) are mapped to
the same canonical target so previously trained agents keep working.
"""

from typing import Any, Dict, List, Optional, Tuple

from app.utils.logger import log_info

# ---------------------------------------------------------------------------
# Canonical tool definitions
# ---------------------------------------------------------------------------

# name -> (integration_id, action, compact schema)
TOOL_DEFINITIONS: Dict[str, Dict[str, Any]] = {
    # Google Calendar
    "google_calendar.list_events": {
        "integration_id": "int_gcal",
        "action": "list_events",
        "schema": {
            "name": "calendar_list_events",
            "description": "Lists upcoming events and meetings from Google Calendar.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "calendar_id": {"type": "STRING", "description": "Calendar ID (default: primary)"},
                    "time_min": {"type": "STRING", "description": "Filter events starting after this datetime"},
                    "time_max": {"type": "STRING", "description": "Filter events starting before this datetime"},
                },
                "required": [],
            },
        },
    },
    "google_calendar.create_event": {
        "integration_id": "int_gcal",
        "action": "create_event",
        "schema": {
            "name": "calendar_create_event",
            "description": "Schedules a new meeting or event on Google Calendar.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "calendar_id": {"type": "STRING", "description": "Calendar ID (default: primary)"},
                    "summary": {"type": "STRING", "description": "Title or summary of the meeting/event"},
                    "start_time": {"type": "STRING", "description": "Start datetime ISO 8601 (e.g. 2026-08-21T12:00:00+05:30) or 'tomorrow 12 PM'"},
                    "end_time": {"type": "STRING", "description": "End datetime ISO 8601"},
                    "description": {"type": "STRING", "description": "Optional description of the event"},
                    "attendees": {"type": "ARRAY", "description": "Optional list of attendee email addresses", "items": {"type": "STRING"}},
                    "timezone": {"type": "STRING", "description": "Timezone for the event (e.g. Asia/Kolkata)"},
                },
                "required": ["summary"],
            },
        },
    },
    "google_calendar.update_event": {
        "integration_id": "int_gcal",
        "action": "update_event",
        "schema": {
            "name": "calendar_update_event",
            "description": "Updates an existing meeting or event on Google Calendar.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "calendar_id": {"type": "STRING", "description": "Calendar ID (default: primary)"},
                    "event_id": {"type": "STRING", "description": "ID of the event to update"},
                    "summary": {"type": "STRING", "description": "Updated event summary"},
                    "start_time": {"type": "STRING", "description": "Updated start time"},
                    "end_time": {"type": "STRING", "description": "Updated end time"},
                },
                "required": [],
            },
        },
    },
    "google_calendar.delete_event": {
        "integration_id": "int_gcal",
        "action": "delete_event",
        "schema": {
            "name": "calendar_delete_event",
            "description": "Deletes or cancels an event on Google Calendar.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "calendar_id": {"type": "STRING", "description": "Calendar ID (default: primary)"},
                    "event_id": {"type": "STRING", "description": "ID of the event to delete"},
                    "summary": {"type": "STRING", "description": "Summary or title of event to delete if ID is unknown"},
                },
                "required": [],
            },
        },
    },

    # Gmail
    "gmail.send_email": {
        "integration_id": "int_gmail",
        "action": "send_email",
        "schema": {
            "name": "gmail_send_email",
            "description": "Sends an email via Gmail.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "to": {"type": "STRING", "description": "Recipient email address"},
                    "subject": {"type": "STRING", "description": "Subject of the email"},
                    "body": {"type": "STRING", "description": "Body content of the email"},
                },
                "required": ["to", "subject", "body"],
            },
        },
    },
    "gmail.search_emails": {
        "integration_id": "int_gmail",
        "action": "search_emails",
        "schema": {
            "name": "gmail_search_emails",
            "description": "Searches email messages in Gmail.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "query": {"type": "STRING", "description": "Search query"},
                },
                "required": ["query"],
            },
        },
    },
    "gmail.read_email": {
        "integration_id": "int_gmail",
        "action": "read_email",
        "schema": {
            "name": "gmail_read_email",
            "description": "Reads a full Gmail message.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "message_id": {"type": "STRING", "description": "Message ID to read"},
                },
                "required": ["message_id"],
            },
        },
    },

    # Google Drive
    "google_drive.list_files": {
        "integration_id": "int_gdrive",
        "action": "list_files",
        "schema": {
            "name": "gdrive_list_files",
            "description": "Lists files in Google Drive.",
            "parameters": {"type": "OBJECT", "properties": {}, "required": []},
        },
    },
    "google_drive.search_files": {
        "integration_id": "int_gdrive",
        "action": "search_files",
        "schema": {
            "name": "gdrive_search_files",
            "description": "Searches documents in Google Drive.",
            "parameters": {
                "type": "OBJECT",
                "properties": {"query": {"type": "STRING", "description": "Search query"}},
                "required": ["query"],
            },
        },
    },

    # Slack
    "slack.send_message": {
        "integration_id": "int_slack",
        "action": "send_message",
        "schema": {
            "name": "slack_send_message",
            "description": "Posts a message to a Slack channel.",
            "parameters": {
                "type": "OBJECT",
                "properties": {
                    "channel": {"type": "STRING", "description": "Channel name or ID"},
                    "text": {"type": "STRING", "description": "Message text"},
                },
                "required": ["channel", "text"],
            },
        },
    },
}

# ---------------------------------------------------------------------------
# Alias mapping (legacy / alternate spellings)
# ---------------------------------------------------------------------------

def _build_alias_map() -> Dict[str, str]:
    aliases: Dict[str, str] = {}
    for canonical, cfg in TOOL_DEFINITIONS.items():
        integration_id = cfg["integration_id"]
        action = cfg["action"]
        provider_short = integration_id.replace("int_", "")

        # canonical: google_calendar.create_event
        aliases[canonical] = canonical
        # GoogleCalendar.create_event / createEvent
        aliases[f"GoogleCalendar.{action}"] = canonical
        aliases[f"GoogleCalendar.{action.title().replace('_', '')}"] = canonical
        # calendar_create_event
        aliases[f"calendar_{action}"] = canonical
        aliases[f"gcal_{action}"] = canonical
        # gmail.send_email / Gmail.sendEmail / gmail_send_email
        aliases[f"{provider_short}.{action}"] = canonical
        aliases[f"{provider_short}.{action.title().replace('_', '')}"] = canonical
        aliases[f"{provider_short}_{action}"] = canonical
        # gdrive -> drive shortcut
        if provider_short == "gdrive":
            aliases[f"drive.{action}"] = canonical
            aliases[f"drive_{action}"] = canonical
    # Historical GoogleMeet / others registered as simple passthroughs
    aliases["GoogleMeet.create_meeting"] = "google_meet.create_meeting"
    aliases["meet_create_meeting"] = "google_meet.create_meeting"
    return aliases


ALIASES: Dict[str, str] = _build_alias_map()


def _normalize_key(key: str) -> str:
    return (key or "").strip()


def resolve(tool_name: str, method: str = "", raw_name: str = "") -> Optional[Dict[str, Any]]:
    """Resolve a tool name (and optional method) to a registered tool definition.

    Returns ``None`` when the tool is not registered.
    """
    candidates = []
    if raw_name:
        candidates.append(_normalize_key(raw_name))
    if tool_name:
        candidates.append(_normalize_key(tool_name))
    if method:
        candidates.append(_normalize_key(f"{tool_name}.{method}"))
        candidates.append(_normalize_key(f"{tool_name}_{method}"))

    for cand in candidates:
        if not cand:
            continue
        if cand in ALIASES:
            canonical = ALIASES[cand]
            if canonical in TOOL_DEFINITIONS:
                return dict(TOOL_DEFINITIONS[canonical], canonical=canonical)
        if cand in TOOL_DEFINITIONS:
            return dict(TOOL_DEFINITIONS[cand], canonical=cand)

    # Fallback: normalize separators/dashes
    for cand in candidates:
        norm = cand.replace("-", "_").replace(" ", "_")
        for key, canonical in ALIASES.items():
            if key.lower().replace("-", "_").replace(" ", "_") == norm.lower():
                if canonical in TOOL_DEFINITIONS:
                    return dict(TOOL_DEFINITIONS[canonical], canonical=canonical)
    return None


def get_schema_for_tool(tool_name: str) -> Optional[Dict[str, Any]]:
    resolved = resolve(tool_name)
    return resolved.get("schema") if resolved else None


def get_schemas_for_integrations(integration_ids: List[str]) -> List[Dict[str, Any]]:
    """Compact JSON schemas for the tools that belong to the given integrations."""
    schemas: List[Dict[str, Any]] = []
    for canonical, cfg in TOOL_DEFINITIONS.items():
        if cfg["integration_id"] in integration_ids and cfg.get("schema"):
            schemas.append(cfg["schema"])
    return schemas


def get_integration_for_tool(tool_name: str) -> Optional[str]:
    resolved = resolve(tool_name)
    return resolved.get("integration_id") if resolved else None


def get_action_for_tool(tool_name: str) -> Optional[str]:
    resolved = resolve(tool_name)
    return resolved.get("action") if resolved else None


def get_canonical_name(tool_name: str) -> str:
    resolved = resolve(tool_name)
    return resolved.get("canonical", "") if resolved else ""


def get_ready_tool_keys(integration_ids: List[str]) -> List[str]:
    """Canonical tool keys for the given connected/assigned integration IDs."""
    return [canonical for canonical, cfg in TOOL_DEFINITIONS.items() if cfg["integration_id"] in integration_ids]


class ToolRegistry:
    """Backward-compatible facade used by the agent graph.

    Kept to avoid breaking existing callers. Real execution is delegated to
    :class:`app.services.tool_executor.ToolExecutor`.
    """

    @staticmethod
    async def execute_tool(workspace_id: str, tool_name: str, method_name: str, args: dict) -> dict:
        from app.services.tool_executor import ToolExecutor
        from app.utils.logger import log_error
        try:
            return await ToolExecutor.execute(workspace_id, tool_name, method_name, args)
        except Exception as e:
            log_error(f"ToolRegistry failed to execute tool {tool_name}.{method_name}", exc=e)
            return {"success": False, "error_code": "EXECUTION_ERROR", "message": str(e)}