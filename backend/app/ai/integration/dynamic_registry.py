from typing import List, Dict, Any
from app.database.firestore import firestore_client
from app.ai.integration.preflight import IntegrationPreflight
from app.utils.logger import log_info, log_error

class DynamicToolRegistry:
    @classmethod
    async def get_available_tools_prompt(
        cls,
        workspace_id: str,
        agent_id: str,
        agent_tools: List[str]
    ) -> tuple[str, List[str]]:
        """
        Dynamically compiles system instructions and API capability definitions
        only for integration tools that are connected, permitted, and preflight READY.
        """
        connected_ids = []
        try:
            coll = firestore_client.collection("integrations")
            docs = coll.stream()
            for doc in docs:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id and data.get("connected"):
                    connected_ids.append(data.get("id"))
        except Exception as e:
            log_error("Failed to query integrations list for dynamic registry", exc=e)

        ready_tools = []
        for iid in connected_ids:
            # Check permissions and preflight
            preflight = await IntegrationPreflight.check(workspace_id, agent_id, iid)
            if preflight.status == "READY":
                ready_tools.append(iid)

        safe_tool_names = []
        for t in ready_tools:
            if t == "int_gcal":
                safe_tool_names.extend(["calendar_create_event", "calendar_list_events", "calendar_update_event", "calendar_delete_event"])
            elif t == "int_gmail":
                safe_tool_names.extend(["gmail_send_email", "gmail_search_emails", "gmail_read_email", "gmail_create_draft"])
            elif t == "int_gdrive":
                safe_tool_names.extend(["gdrive_list_files", "gdrive_search_files", "gdrive_get_file"])
            elif t == "int_slack":
                safe_tool_names.extend(["slack_send_message", "slack_list_channels"])
            elif t == "int_hubspot":
                safe_tool_names.extend(["hubspot_get_contact", "hubspot_create_contact", "hubspot_list_deals"])
            elif t == "int_shopify":
                safe_tool_names.extend(["shopify_get_order", "shopify_list_products"])
            elif t == "int_gmeet":
                safe_tool_names.append("gmeet_create_meeting")
            elif t == "int_whatsapp":
                safe_tool_names.append("whatsapp_send_message")
            elif t == "int_razorpay":
                safe_tool_names.extend(["razorpay_get_payment", "razorpay_create_refund"])

        log_info(f"[DynamicToolRegistry] workspace_id={workspace_id} ready_integrations={ready_tools} safe_available_tool_names={safe_tool_names}")

        # Build prompt instructions
        prompt_instructions = (
            "\n\n[CRITICAL INSTRUCTION]\n"
            "You have access to the following connected integration tools. "
            "If the user query requests checking, creating, updating, or deleting calendar events, sending emails, or searching files, you MUST respond by calling the corresponding tool function (or outputting TOOL_CALL). "
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
        """Returns JSON schema function declarations for binding to LLM requests."""
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
                            "start_time": {"type": "STRING", "description": "Start datetime in ISO 8601 string format (e.g. 2026-08-16T15:00:00Z or tomorrow 3 PM)"},
                            "end_time": {"type": "STRING", "description": "End datetime ISO string format"},
                            "description": {"type": "STRING", "description": "Optional description of the event"}
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
                            "time_min": {"type": "STRING", "description": "Filter events starting after this ISO datetime"},
                            "time_max": {"type": "STRING", "description": "Filter events starting before this ISO datetime"}
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
                            "start_time": {"type": "STRING", "description": "Updated start time ISO string"},
                            "end_time": {"type": "STRING", "description": "Updated end time ISO string"}
                        },
                        "required": ["event_id"]
                    }
                },
                {
                    "name": "calendar_delete_event",
                    "description": "Deletes or cancels an event on Google Calendar.",
                    "parameters": {
                        "type": "OBJECT",
                        "properties": {
                            "event_id": {"type": "STRING", "description": "ID of the event to delete"}
                        },
                        "required": ["event_id"]
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

        if "int_gdrive" in ready_tools:
            schemas.append({
                "name": "gdrive_search_files",
                "description": "Searches files in Google Drive.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "query": {"type": "STRING", "description": "Search query or file name"}
                    },
                    "required": ["query"]
                }
            })

        if "int_slack" in ready_tools:
            schemas.append({
                "name": "slack_send_message",
                "description": "Posts a message to a Slack channel.",
                "parameters": {
                    "type": "OBJECT",
                    "properties": {
                        "channel": {"type": "STRING", "description": "Slack channel name or ID"},
                        "text": {"type": "STRING", "description": "Message text"}
                    },
                    "required": ["channel", "text"]
                }
            })

        return schemas

    @staticmethod
    def _get_tool_description(integration_id: str) -> str:
        descriptions = {
            "int_gcal": (
                "- GoogleCalendar.list_events(calendar_id: str = 'primary', time_min: str = None, time_max: str = None) -> lists scheduled calendar events\n"
                "- GoogleCalendar.create_event(summary: str, start_time: str, end_time: str = None, description: str = '', timezone: str = 'UTC', calendar_id: str = 'primary') -> schedules a meeting/event\n"
                "- GoogleCalendar.update_event(event_id: str, summary: str = None, start_time: str = None, end_time: str = None, calendar_id: str = 'primary') -> updates existing event\n"
                "- GoogleCalendar.delete_event(event_id: str, calendar_id: str = 'primary') -> cancels/deletes event"
            ),
            "int_gmail": (
                "- Gmail.send_email(to: str, subject: str, body: str) -> sends an email\n"
                "- Gmail.search_emails(query: str, max_results: int = 5) -> searches emails by query/sender/subject\n"
                "- Gmail.read_email(message_id: str) -> reads full email message\n"
                "- Gmail.create_draft(to: str, subject: str, body: str) -> creates a draft email"
            ),
            "int_whatsapp": "- WhatsApp.send_message(phone: str, text: str) -> sends WhatsApp message",
            "int_gdrive": (
                "- GoogleDrive.list_files(query: str = None) -> lists files in Drive\n"
                "- GoogleDrive.search_files(query: str) -> searches documents in Drive\n"
                "- GoogleDrive.get_file(file_id: str) -> reads document details"
            ),
            "int_slack": (
                "- Slack.send_message(channel: str, text: str) -> posts message to Slack channel\n"
                "- Slack.list_channels() -> lists available Slack channels"
            ),
            "int_hubspot": (
                "- HubSpot.get_contact(email: str) -> retrieves CRM contact\n"
                "- HubSpot.create_contact(email: str, firstname: str = None, lastname: str = None) -> creates new lead/contact\n"
                "- HubSpot.list_deals() -> lists sales pipeline deals"
            ),
            "int_razorpay": "- Razorpay.get_payment(payment_id: str) -> retrieves transaction info\n- Razorpay.create_refund(payment_id: str, amount: float = None) -> processes a refund",
            "int_shopify": "- Shopify.get_order(order_id: str) -> retrieves order details and shipping status\n- Shopify.list_products() -> lists products catalog and stock",
            "int_gmeet": "- GoogleMeet.create_meeting(summary: str, start_time: str) -> returns a video meeting link",
            "int_google_maps": "- GoogleMaps.search_places(query: str) -> searches places/locations\n- GoogleMaps.calculate_route(origin: str, destination: str) -> calculates travel routes",
            "int_elevenlabs": "- ElevenLabs.text_to_speech(text: str, voice_id: str = None) -> generates audio clip",
            "int_rest_api": "- CustomAPI.request(method: str, path: str, params: dict = None, body: dict = None) -> calls custom endpoint"
        }
        return descriptions.get(integration_id, "")
