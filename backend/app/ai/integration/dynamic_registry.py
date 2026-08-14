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
            "int_gcal": "- GoogleCalendar.list_events(calendar_id: str = 'primary') -> returns schedule list\n- GoogleCalendar.create_event(calendar_id: str = 'primary', summary: str, start_time: str, end_time: str) -> schedules a slot",
            "int_gmail": "- Gmail.send_email(to: str, subject: str, body: str) -> sends email notification",
            "int_whatsapp": "- WhatsApp.send_message(phone: str, text: str) -> sends WhatsApp message",
            "int_gdrive": "- GoogleDrive.list_files() -> lists knowledge documents",
            "int_razorpay": "- Razorpay.get_payment(payment_id: str) -> retrieves transaction info\n- Razorpay.create_refund(payment_id: str, amount: float = None) -> processes a refund",
            "int_shopify": "- Shopify.get_order(order_id: str) -> retrieves order details and shipping status\n- Shopify.list_products() -> lists products catalog and stock",
            "int_gmeet": "- GoogleMeet.create_meeting(summary: str, start_time: str) -> returns a video meeting link",
            "int_rest_api": "- CustomAPI.request(method: str, path: str, params: dict = None, body: dict = None) -> calls custom endpoint"
        }
        return descriptions.get(integration_id, "")
