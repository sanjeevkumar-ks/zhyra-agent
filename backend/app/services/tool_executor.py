from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
import httpx
import json
import uuid

class ToolExecutor:
    TOOL_DISPATCHER = {
        # Google Calendar
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

        # HubSpot
        "HubSpot.getContact": ("int_hubspot", "get_contact"),
        "HubSpot.createContact": ("int_hubspot", "create_contact"),
        "HubSpot.listDeals": ("int_hubspot", "list_deals"),

        # Shopify
        "Shopify.getOrder": ("int_shopify", "get_order"),
        "Shopify.listProducts": ("int_shopify", "list_products"),
    }

    @classmethod
    async def execute(cls, workspace_id: str, tool_name: str, method_name: str, args: dict, agent_id: str = "unknown") -> dict:
        """Parses and executes the tool call using TOOL_DISPATCHER, checking connections and returning normalized responses."""
        log_info(f"[AGENT] Tool call received")
        log_info(f"[AGENT] Tool: {tool_name}.{method_name}")
        log_info(f"[AGENT] Resolving tool")

        tool_key = f"{tool_name}.{method_name}" if method_name else tool_name
        target = cls.TOOL_DISPATCHER.get(tool_key)

        if not target and "." in tool_name:
            parts = tool_name.split(".", 1)
            tool_key = f"{parts[0]}.{parts[1]}"
            target = cls.TOOL_DISPATCHER.get(tool_key)

        if not target and method_name:
            # Fallback lookup by method_name or tool_name
            for k, val in cls.TOOL_DISPATCHER.items():
                if k.lower() == tool_key.lower() or k.endswith(f".{method_name}"):
                    target = val
                    break

        if target:
            integration_id, resolved_method = target
            log_info(f"[AGENT] Tool resolved: {integration_id}.{resolved_method}")
        else:
            # Fallback dynamic mapping
            tool_name_lower = tool_name.lower()
            integration_id = "int_gcal" if ("calendar" in tool_name_lower or "event" in tool_name_lower) else tool_name
            resolved_method = method_name or "execute"
            log_info(f"[AGENT] Tool resolved (dynamic fallback): {integration_id}.{resolved_method}")

        log_info(f"[AGENT] Executing tool")

        # 1. Run Preflight Validation Check
        from app.ai.integration.preflight import IntegrationPreflight
        from app.ai.integration.normalizer import ToolResultNormalizer
        
        preflight = await IntegrationPreflight.check(workspace_id, agent_id, integration_id)
        if preflight.status != "READY":
            log_info(f"[INTEGRATION] Preflight check status: {preflight.status} message={preflight.message}")
            return ToolResultNormalizer.normalize_error(
                tool_name, resolved_method, preflight.status, preflight.message
            )
            
        # 2. Execute provider capability
        from app.services.integration_service import IntegrationService
        provider = IntegrationService._get_provider(integration_id)
        res = await provider.execute(workspace_id, resolved_method, args)
        
        log_info(f"[AGENT] Tool result returned")

        if isinstance(res, dict):
            return res
        return ToolResultNormalizer.normalize_response(tool_name, resolved_method, res)
