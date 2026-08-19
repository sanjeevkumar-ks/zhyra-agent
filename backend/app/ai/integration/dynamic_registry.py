import datetime
from typing import List, Dict, Any, Tuple
from zoneinfo import ZoneInfo
from app.database.firestore import firestore_client
from app.ai.integration.preflight import IntegrationPreflight
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
        Dynamically compiles system instructions and API capability definitions
        only for integration tools that are connected, permitted, and preflight READY.
        Includes workspace current date, time, and timezone context for relative date resolution.
        """
        connected_ids = []
        try:
            coll = firestore_client.collection("integrations")
            docs = coll.stream()
            for doc in docs:
                data = doc.to_dict() or {}
                if data.get("workspace_id") == workspace_id and data.get("connected"):
                    connected_ids.append(data.get("id"))
        except Exception as e:
            log_error("Failed to query integrations list for dynamic registry", exc=e)

        ready_tools = []
        for iid in connected_ids:
            if not iid:
                continue
            preflight = await IntegrationPreflight.check(workspace_id, agent_id, iid)
            if preflight.status == "READY":
                ready_tools.append(iid)

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

        if not ready_tools:
            return prompt_instructions, []

        prompt_instructions += (
            "[CRITICAL INTEGRATION INSTRUCTION]\n"
            "You have access to the following connected integration tools. "
            "If the customer query requires checking, creating, updating, or deleting calendar events, sending emails, or searching files, you MUST respond by outputting a TOOL_CALL block.\n"
            "Do NOT politely decline or say you cannot access tools directly. You MUST perform the requested action using available tools.\n\n"
            "Format:\n"
            "TOOL_CALL:{\"tool\": \"<ToolName>\", \"method\": \"<MethodName>\", \"args\": {<arguments>}}\n"
            "Available tools based on connected integrations:\n"
        )

        tool_lines = []
        for t in ready_tools:
            desc = cls._get_tool_description(t)
            if desc:
                tool_lines.append(desc)

        joined_lines = "\n".join(tool_lines)
        return prompt_instructions + joined_lines, ready_tools

    @classmethod
    def get_tool_schemas(cls, ready_tools: List[str]) -> List[Dict[str, Any]]:
        """Returns JSON schema function declarations for LLM tool calling."""
        schemas = []
        if "int_gcal" in ready_tools:
            schemas.extend([
                {
                    "name": "calendar_create_event",
                    "description": "Schedules a new meeting or event on Google Calendar.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "summary": {"type": "STRING", "description": "Title or summary of the meeting/event"},
                            "start_time": {"type": "STRING", "description": "Start datetime in ISO 8601 format (e.g. 2026-08-20T12:00:00+05:30) or clear time text"},
                            "end_time": {"type": "STRING", "description": "End datetime in ISO 8601 format"},
                            "description": {"type": "STRING", "description": "Optional description of the event"},
                            "timezone": {"type": "STRING", "description": "Timezone for the event"}
                        },
                        "required": ["summary"]
                    }
                },
                {
                    "name": "calendar_list_events",
                    "description": "Lists upcoming events and meetings from Google Calendar.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "time_min": {"type": "STRING", "description": "Filter events starting after this datetime"},
                            "time_max": {"type": "STRING", "description": "Filter events starting before this datetime"}
                        }
                    }
                },
                {
                    "name": "calendar_update_event",
                    "description": "Updates an existing meeting or event on Google Calendar.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "event_id": {"type": "STRING", "description": "ID of the event to update"},
                            "summary": {"type": "STRING", "description": "Updated event summary"},
                            "start_time": {"type": "STRING", "description": "Updated start time"},
                            "end_time": {"type": "STRING", "description": "Updated end time"}
                        }
                    }
                },
                {
                    "name": "calendar_delete_event",
                    "description": "Deletes or cancels an event on Google Calendar.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "event_id": {"type": "STRING", "description": "ID of the event to delete"},
                            "summary": {"type": "STRING", "description": "Summary or title of event to delete if ID is unknown"}
                        }
                    }
                }
            ])

        if "int_gmail" in ready_tools:
            schemas.extend([
                {
                    "name": "gmail_send_email",
                    "description": "Sends an email notification via Gmail.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "to": {"type": "STRING", "description": "Recipient email address"},
                            "subject": {"type": "STRING", "description": "Subject of the email"},
                            "body": {"type": "STRING", "description": "Body content of the email"}
                        },
                        "required": ["to", "subject", "body"]
                    }
                },
                {
                    "name": "gmail_search_emails",
                    "description": "Searches email messages in Gmail.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "query": {"type": "STRING", "description": "Search query"}
                        },
                        "required": ["query"]
                    }
                }
            ])

        return schemas

    @staticmethod
    def _get_tool_description(integration_id: str) -> str:
        descriptions = {
            "int_gcal": (
                "- GoogleCalendar.list_events(calendar_id: str = 'primary', time_min: str = None, time_max: str = None) -> lists scheduled calendar events\n"
                "- GoogleCalendar.create_event(summary: str, start_time: str, end_time: str = None, description: str = '', timezone: str = None) -> schedules a meeting/event\n"
                "- GoogleCalendar.update_event(event_id: str = None, summary: str = None, start_time: str = None, end_time: str = None) -> updates existing event\n"
                "- GoogleCalendar.delete_event(event_id: str = None, summary: str = None) -> cancels/deletes event"
            ),
            "int_gmail": (
                "- Gmail.send_email(to: str, subject: str, body: str) -> sends an email\n"
                "- Gmail.search_emails(query: str, max_results: int = 5) -> searches emails\n"
                "- Gmail.read_email(message_id: str) -> reads full email message"
            ),
            "int_whatsapp": "- WhatsApp.send_message(phone: str, text: str) -> sends WhatsApp message",
            "int_gdrive": (
                "- GoogleDrive.list_files(query: str = None) -> lists files in Drive\n"
                "- GoogleDrive.search_files(query: str) -> searches documents in Drive"
            ),
            "int_slack": (
                "- Slack.send_message(channel: str, text: str) -> posts message to Slack channel\n"
                "- Slack.list_channels() -> lists available Slack channels"
            ),
            "int_hubspot": (
                "- HubSpot.get_contact(email: str) -> retrieves CRM contact\n"
                "- HubSpot.create_contact(email: str, firstname: str = None, lastname: str = None) -> creates lead"
            ),
            "int_razorpay": "- Razorpay.get_payment(payment_id: str) -> retrieves transaction info\n- Razorpay.create_refund(payment_id: str, amount: float = None) -> processes a refund",
            "int_shopify": "- Shopify.get_order(order_id: str) -> retrieves order details\n- Shopify.list_products() -> lists products catalog",
            "int_gmeet": "- GoogleMeet.create_meeting(summary: str, start_time: str) -> returns a video meeting link",
            "int_google_maps": "- GoogleMaps.search_places(query: str) -> searches places/locations",
            "int_elevenlabs": "- ElevenLabs.text_to_speech(text: str, voice_id: str = None) -> generates audio clip",
            "int_rest_api": "- CustomAPI.request(method: str, path: str, params: dict = None, body: dict = None) -> calls custom endpoint"
        }
        return descriptions.get(integration_id, "")
