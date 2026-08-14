from typing import List, Dict, Any, Tuple
import re
import json
from app.ai.context.models import ContextConfig
from app.ai.context.budget import ContextBudgetManager
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

class ToolContextBuilder:
    # Tool categorizations
    INTENT_MAPPING: Dict[str, List[str]] = {
        "calendar": ["int_gcal", "int_gmeet"],
        "gmail": ["int_gmail"],
        "communication": ["int_whatsapp", "int_slack"],
        "knowledge": ["int_gdrive"],
        "payments": ["int_razorpay"],
        "commerce": ["int_shopify"],
        "api": ["int_rest_api"]
    }

    # Keyword patterns for intent routing
    KEYWORD_PATTERNS: Dict[str, List[str]] = {
        "calendar": ["meet", "calendar", "schedule", "slot", "appointment", "gcal", "booking", "event"],
        "gmail": ["email", "gmail", "mail", "send email", "inbox"],
        "communication": ["whatsapp", "message", "slack", "text", "notify"],
        "knowledge": ["file", "drive", "gdrive", "doc", "knowledge", "reference"],
        "payments": ["pay", "payment", "refund", "charge", "razorpay", "transaction", "billing"],
        "commerce": ["order", "shopify", "product", "stock", "inventory", "catalog", "buy", "price"],
        "api": ["api", "webhook", "request", "custom api"]
    }

    @classmethod
    async def build(
        cls,
        workspace_id: str,
        agent_tools: List[str],
        query: str,
        config: ContextConfig,
        budget_limit: int
    ) -> Tuple[str, int, List[str]]:
        """
        Dynamically filters available workspace integration tools based on query intent
        and formats their descriptions to fit within the tool budget.
        """
        all_connected = await cls._fetch_connected_integrations(workspace_id)
        if not all_connected:
            return "", 0, []

        # Find matching tool groups based on keywords in query
        matched_groups = []
        query_lower = query.lower()
        for group, keywords in cls.KEYWORD_PATTERNS.items():
            if any(k in query_lower for k in keywords):
                matched_groups.append(group)

        # Map groups to integration IDs
        routed_integration_ids = []
        for g in matched_groups:
            routed_integration_ids.extend(cls.INTENT_MAPPING.get(g, []))

        # Filter connections by matched routing.
        # If no group matched, expose all connections as fallback to ensure functionality.
        if routed_integration_ids:
            active_tools = [t for t in all_connected if t in routed_integration_ids]
        else:
            active_tools = all_connected

        # If agent has a restricted tools list, apply intersection
        if agent_tools:
            # Normalize names
            norm_agent_tools = [t.lower().replace(" ", "").replace("_", "").replace("-", "").replace("int", "") for t in agent_tools]
            filtered_active = []
            for t in active_tools:
                norm_t = t.lower().replace(" ", "").replace("_", "").replace("-", "").replace("int", "")
                if any(nat in norm_t or norm_t in nat for nat in norm_agent_tools):
                    filtered_active.append(t)
            active_tools = filtered_active

        if not active_tools:
            return "", 0, []

        # Compile descriptions up to budget limit
        tool_prompt = (
            "\n\n[CRITICAL INSTRUCTION]\n"
            "You have access to the following connected integration tools. "
            "If the customer query requires information or actions from these tools, you MUST immediately respond with a TOOL_CALL block. "
            "Format:\n"
            "TOOL_CALL:{\"tool\": \"<ToolName>\", \"method\": \"<MethodName>\", \"args\": {<arguments>}}\n"
            "Available tools based on connected integrations:\n"
        )

        tool_lines = []
        for t in active_tools:
            desc = cls._get_tool_description(t)
            if desc:
                tool_lines.append(desc)

        joined_lines = "\n".join(tool_lines)
        full_tool_prompt = tool_prompt + joined_lines
        tokens = ContextBudgetManager.estimate_tokens(full_tool_prompt)

        # Enforce budget
        max_tokens = min(config.max_tool_tokens, budget_limit)
        if tokens > max_tokens:
            # Drop descriptions one by one until we fit
            while tool_lines and tokens > max_tokens:
                tool_lines.pop()
                joined_lines = "\n".join(tool_lines)
                full_tool_prompt = tool_prompt + joined_lines
                tokens = ContextBudgetManager.estimate_tokens(full_tool_prompt)

        return full_tool_prompt, tokens, active_tools

    @staticmethod
    async def _fetch_connected_integrations(workspace_id: str) -> List[str]:
        try:
            coll = firestore_client.collection("integrations")
            docs = coll.stream()
            connected = []
            for doc in docs:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id and data.get("connected"):
                    connected.append(data.get("id"))
            return connected
        except Exception as e:
            log_error("Failed to query connected integrations for tool router", exc=e)
            return []

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

class ToolResultCompressor:
    @staticmethod
    def compress_result(tool_name: str, method_name: str, raw_result: Any) -> str:
        """
        Normalizes and condenses large third-party JSON API responses to 
        prevent filling context window with structural boilerplate.
        """
        if not raw_result:
            return "No result returned."

        # Parse string to JSON if possible
        data = raw_result
        if isinstance(raw_result, str):
            try:
                data = json.loads(raw_result)
            except Exception:
                pass

        if not isinstance(data, (dict, list)):
            return str(raw_result)

        # Normalize based on tool type
        tool_lower = tool_name.lower()
        method_lower = method_name.lower()

        try:
            # 1. Google Calendar lists
            if "calendar" in tool_lower and "list" in method_lower:
                events = []
                items = data.get("items", data) if isinstance(data, dict) else data
                if isinstance(items, list):
                    for item in items[:5]:  # Limit to top 5
                        summary = item.get("summary", "No Title")
                        start = item.get("start", {}).get("dateTime", item.get("start", {}).get("date", ""))
                        events.append(f"'{summary}' starting {start}")
                    return "Upcoming events:\n" + "\n".join([f"- {e}" for e in events]) if events else "No upcoming events found."

            # 2. Shopify products or lists
            if "shopify" in tool_lower and "product" in method_lower:
                products = []
                items = data.get("products", data) if isinstance(data, dict) else data
                if isinstance(items, list):
                    for item in items[:5]:
                        title = item.get("title", "")
                        price = item.get("variants", [{}])[0].get("price", "N/A")
                        qty = item.get("variants", [{}])[0].get("inventory_quantity", "unknown")
                        products.append(f"{title} (Price: ${price}, Inventory: {qty})")
                    return "Product Catalog:\n" + "\n".join([f"- {p}" for p in products]) if products else "No products found."

            # 3. Generic JSON pruning
            # If the dict is too deep or contains long text/metadata, only keep structural status/keys
            if isinstance(data, dict):
                # Filter out heavy/boilerplate fields
                pruned = {}
                keys_to_exclude = ["metadata", "etag", "kind", "selfLink", "htmlLink", "signature", "headers"]
                for k, v in data.items():
                    if k not in keys_to_exclude and len(str(v)) < 500:
                        pruned[k] = v
                return json.dumps(pruned, indent=2)
                
        except Exception as e:
            log_error("Failed to compress tool result", exc=e)

        return str(raw_result)
