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

        if not ready_tools:
            return "", []

        # Build prompt instructions
        prompt_instructions = (
            "\n\n[CRITICAL INSTRUCTION]\n"
            "You have access to the following connected integration tools. "
            "If the customer query requires information or actions from these tools, you MUST immediately respond with a TOOL_CALL block. "
            "Do NOT politely decline. You must use these tools to perform actions.\n\n"
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
