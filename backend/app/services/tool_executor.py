from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
import httpx
import json
import uuid

class ToolExecutor:
    @classmethod
    async def execute(cls, workspace_id: str, tool_name: str, method_name: str, args: dict, agent_id: str = "unknown") -> dict:
        """Parses and executes the tool call, checking connections and returning responses."""
        if "." in tool_name:
            parts = tool_name.split(".")
            tool_name = parts[0]
            if not method_name or method_name == "default" or method_name == "execute":
                method_name = parts[1]
            
        log_info(f"ToolExecutor executing: {tool_name}.{method_name} with args: {args} for workspace {workspace_id}")
        
        tool_name_lower = tool_name.lower()
        
        # Map tool name string to integration ID
        tool_to_id = {
            "googlecalendar": "int_gcal",
            "calendar": "int_gcal",
            "gcal": "int_gcal",
            "event": "int_gcal",
            "gmail": "int_gmail",
            "email": "int_gmail",
            "whatsapp": "int_whatsapp",
            "googledrive": "int_gdrive",
            "drive": "int_gdrive",
            "file": "int_gdrive",
            "hubspot": "int_hubspot",
            "crm": "int_hubspot",
            "deal": "int_hubspot",
            "contact": "int_hubspot",
            "razorpay": "int_razorpay",
            "payment": "int_razorpay",
            "shopify": "int_shopify",
            "store": "int_shopify",
            "order": "int_shopify",
            "product": "int_shopify",
            "googlemeet": "int_gmeet",
            "meet": "int_gmeet",
            "slack": "int_slack",
            "channel": "int_slack",
            "googlemaps": "int_google_maps",
            "maps": "int_google_maps",
            "route": "int_google_maps",
            "place": "int_google_maps",
            "elevenlabs": "int_elevenlabs",
            "speech": "int_elevenlabs",
            "firebase": "int_fcm",
            "fcm": "int_fcm",
            "customapi": "int_rest_api",
            "restapi": "int_rest_api"
        }
        
        integration_id = None
        search_target = f"{tool_name_lower} {method_name.lower()}"
        for key, val in tool_to_id.items():
            if key in search_target:
                integration_id = val
                break
                
        if integration_id:
            # 1. Run Preflight Validation Check
            from app.ai.integration.preflight import IntegrationPreflight
            from app.ai.integration.normalizer import ToolResultNormalizer
            
            preflight = await IntegrationPreflight.check(workspace_id, agent_id, integration_id)
            if preflight.status != "READY":
                return ToolResultNormalizer.normalize_error(
                    tool_name, method_name, preflight.status, preflight.message
                )
                
            # 2. Execute provider capability
            from app.services.integration_service import IntegrationService
            provider = IntegrationService._get_provider(integration_id)
            res = await provider.execute(workspace_id, method_name, args)
            
            if isinstance(res, dict):
                return res
            return ToolResultNormalizer.normalize_response(tool_name, method_name, res)
            
        from app.ai.integration.normalizer import ToolResultNormalizer
        return ToolResultNormalizer.normalize_error(
            tool_name, method_name, "CONFIGURATION_ERROR", f"Tool '{tool_name}' not supported or integration unavailable."
        )
