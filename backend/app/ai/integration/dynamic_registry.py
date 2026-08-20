import datetime
from typing import List, Dict, Any, Tuple
from zoneinfo import ZoneInfo
from app.database.firestore import firestore_client
from app.ai.tools.tool_registry import (
    get_schemas_for_integrations,
    get_ready_tool_keys,
)
from app.utils.logger import log_info, log_error


class DynamicToolRegistry:
    @classmethod
    async def get_available_tools_prompt(
        cls,
        workspace_id: str,
        agent_id: str,
        agent_tools: List[Any]
    ) -> Tuple[str, List[str]]:
        """
        Lightweight compilation of tool instructions and schemas for the agent.

        This is a pure Firestore read path: it NEVER calls the integration
        providers, never validates tokens against Google, and never attempts a
        token refresh. Only integrations that are connected AND assigned to this
        agent contribute tools. Actual token validation happens at execution.

        Returns:
            (prompt_instructions, ready_integration_ids)
        """
        connected_ids = cls._get_connected_ids(workspace_id)
        assigned_ids = cls._get_assigned_ids(agent_id)
        ready_ids = [iid for iid in connected_ids if iid in assigned_ids]

        # Get workspace timezone or fallback
        tz_str = "Asia/Kolkata"
        try:
            ws_doc = firestore_client.collection("workspaces").document(workspace_id).get()
            if ws_doc.exists:
                ws_data = ws_doc.to_dict() or {}
                tz_str = ws_data.get("timezone") or "Asia/Kolkata"
        except Exception:
            pass

        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
            tz_str = "Asia/Kolkata"

        now_dt = datetime.datetime.now(tz)
        formatted_now = now_dt.strftime("%A, %B %d, %Y %I:%M %p")

        prompt_instructions = (
            f"\n\n[TIME & LOCATION CONTEXT]\n"
            f"Current Timestamp: {formatted_now}\n"
            f"Workspace Timezone: {tz_str}\n"
            f"(Use this current timestamp and timezone when resolving relative dates like 'today', 'tomorrow', 'next week', or specific meeting times).\n\n"
        )

        if not ready_ids:
            return prompt_instructions, []

        prompt_instructions += (
            "[TOOL USAGE RULES]\n"
            "You have access to the connected integration tools listed below. "
            "If the customer query requires checking, creating, updating, or deleting calendar events, sending emails, or searching files, "
            "you MUST invoke the matching tool. Do not decline if the action is within the available tools.\n"
            "Use the function-calling interface to emit tool calls. "
            "Never claim an action was completed before the system returns a verified TOOL_RESULT.\n\n"
            "Available tools based on connected integrations:\n"
        )

        for t in ready_ids:
            desc = cls._get_tool_description(t)
            if desc:
                prompt_instructions += desc

        return prompt_instructions, ready_ids

    @classmethod
    def get_tool_schemas(cls, ready_ids: List[str]) -> List[Dict[str, Any]]:
        """Returns compact function-declaration schemas from the deterministic registry."""
        if not ready_ids:
            return []
        return get_schemas_for_integrations(ready_ids)

    @classmethod
    def get_ready_tool_keys(cls, ready_ids: List[str]) -> List[str]:
        return get_ready_tool_keys(ready_ids)

    @staticmethod
    def _get_connected_ids(workspace_id: str) -> List[str]:
        try:
            coll = firestore_client.collection("integrations")
            docs = coll.stream()
            return [
                (data.get("id") or "")
                for doc in docs
                for data in [doc.to_dict() or {}]
                if data.get("workspace_id") == workspace_id and data.get("connected")
            ]
        except Exception as e:
            log_error("Failed to query integrations list for dynamic registry", exc=e)
            return []

    @staticmethod
    def _get_assigned_ids(agent_id: str) -> List[str]:
        """Resolve which integrations are assigned to this agent via its tools list."""
        try:
            agent_ref = firestore_client.collection("agents").document(agent_id)
            agent_snap = agent_ref.get()
            agent_data = None
            if agent_snap.exists:
                agent_data = agent_snap.to_dict() or {}
            else:
                docs = firestore_client.collection("agents").stream()
                for d in docs:
                    ddata = d.to_dict() or {}
                    if ddata.get("id") == agent_id or d.id == agent_id:
                        agent_data = ddata
                        break
            if not agent_data:
                return []
            agent_tools = agent_data.get("tools") or []
        except Exception as e:
            log_error(f"Failed to load agent tools for dynamic registry: {agent_id}", exc=e)
            return []

        if not agent_tools:
            return []

        # Integration-name fuzzy matching: e.g. "Google Calendar" -> int_gcal
        id_to_name = {
            "int_gcal": ["google calendar", "calendar", "gcal", "google_calendar"],
            "int_gmail": ["gmail", "email"],
            "int_gdrive": ["google drive", "googledrive", "drive", "google_drive"],
            "int_gmeet": ["google meet", "googlemeet", "meet", "google_meet"],
            "int_slack": ["slack"],
            "int_whatsapp": ["whatsapp", "whatsapp business"],
            "int_hubspot": ["hubspot", "crm"],
            "int_razorpay": ["razorpay"],
            "int_shopify": ["shopify", "store"],
            "int_google_maps": ["google maps", "maps", "google_maps"],
            "int_elevenlabs": ["elevenlabs"],
            "int_fcm": ["firebase", "fcm"],
            "int_rest_api": ["rest api", "restapi", "rest_api", "custom api"],
        }

        assigned = set()
        for t in agent_tools:
            tool_identifier = ""
            if isinstance(t, str):
                tool_identifier = t
            elif isinstance(t, dict):
                tool_identifier = t.get("id") or t.get("name") or ""
            tl = str(tool_identifier).lower().strip()

            for iid, names in id_to_name.items():
                if iid in assigned:
                    continue
                if iid.lower() in tl or tl in iid.lower():
                    assigned.add(iid)
                    continue
                for name in names:
                    if name in tl or tl in name:
                        assigned.add(iid)
                        break
        return list(assigned)

    @staticmethod
    def _get_tool_description(integration_id: str) -> str:
        descriptions = {
            "int_gcal": (
                "- google_calendar.create_event(summary, start_time, end_time=None, description='', timezone='Asia/Kolkata', calendar_id='primary') -> schedules a verified meeting on Google Calendar\n"
                "- google_calendar.list_events(time_min=None, time_max=None, calendar_id='primary') -> lists scheduled calendar events\n"
                "- google_calendar.update_event(event_id, summary=None, start_time=None, end_time=None) -> updates an existing event\n"
                "- google_calendar.delete_event(event_id=None, summary=None) -> cancels/deletes an event"
            ),
            "int_gmail": (
                "- gmail.send_email(to, subject, body) -> sends an email\n"
                "- gmail.search_emails(query, max_results=5) -> searches emails\n"
                "- gmail.read_email(message_id) -> reads a full email message"
            ),
            "int_whatsapp": "- whatsapp.send_message(phone, text) -> sends WhatsApp message",
            "int_gdrive": (
                "- google_drive.list_files(query=None) -> lists files in Drive\n"
                "- google_drive.search_files(query) -> searches documents in Drive"
            ),
            "int_slack": "- slack.send_message(channel, text) -> posts message to Slack channel",
            "int_hubspot": (
                "- hubspot.get_contact(email) -> retrieves CRM contact\n"
                "- hubspot.create_contact(email, firstname=None, lastname=None) -> creates lead"
            ),
            "int_razorpay": "- razorpay.get_payment(payment_id) -> retrieves transaction info\n- razorpay.create_refund(payment_id, amount=None) -> processes a refund",
            "int_shopify": "- shopify.get_order(order_id) -> retrieves order details\n- shopify.list_products() -> lists products catalog",
            "int_gmeet": "- google_meet.create_meeting(summary, start_time) -> returns a video meeting link",
            "int_google_maps": "- google_maps.search_places(query) -> searches places/locations",
            "int_elevenlabs": "- elevenlabs.text_to_speech(text, voice_id=None) -> generates audio clip",
            "int_rest_api": "- rest_api.request(method, path, params=None, body=None) -> calls custom endpoint",
        }
        return descriptions.get(integration_id, "")