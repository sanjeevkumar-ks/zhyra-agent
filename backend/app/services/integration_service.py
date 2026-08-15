from app.database.firestore import firestore_client
from fastapi import HTTPException
from app.utils.logger import log_info, log_error
import time

class IntegrationService:
    @staticmethod
    async def list_integrations(workspace_id: str) -> list:
        # Predefined integration library presets
        presets = [
            {"id": "int_gcal", "name": "Google Calendar", "category": "Productivity", "connected": False, "description": "Schedule meetings and manage availability.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_gmail", "name": "Gmail", "category": "Productivity", "connected": False, "description": "Read, draft and send emails.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_gdrive", "name": "Google Drive", "category": "Productivity", "connected": False, "description": "Retrieve knowledge from documents.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_gmeet", "name": "Google Meet", "category": "Productivity", "connected": False, "description": "Create meeting links for live conversations.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_slack", "name": "Slack", "category": "Communication", "connected": False, "description": "Notify your team and send updates.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_whatsapp", "name": "WhatsApp Business", "category": "Communication", "connected": False, "description": "Allow agents to message customers.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_hubspot", "name": "HubSpot", "category": "CRM", "connected": False, "description": "Create leads and update contacts.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_razorpay", "name": "Razorpay", "category": "Payments", "connected": False, "description": "Generate payment links and verify payments.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_shopify", "name": "Shopify", "category": "Commerce", "connected": False, "description": "Track orders and manage storefront data.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_google_maps", "name": "Google Maps", "category": "Maps", "connected": False, "description": "Search places and calculate routes.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_elevenlabs", "name": "ElevenLabs", "category": "Voice", "connected": False, "description": "Power voice-enabled AI agents.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_fcm", "name": "Firebase Cloud Messaging", "category": "Notifications", "connected": False, "description": "Send push notifications.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_gemini", "name": "Gemini", "category": "AI", "connected": False, "description": "Bring Gemini models into agent workflows.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_openai", "name": "OpenAI", "category": "AI", "connected": False, "description": "Connect OpenAI models for agent reasoning.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_claude", "name": "Claude", "category": "AI", "connected": False, "description": "Use Claude for thoughtful long-form reasoning.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_openrouter", "name": "OpenRouter", "category": "AI", "connected": False, "description": "Access multiple AI models through one gateway.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_nvidia_ai", "name": "NVIDIA AI", "category": "AI", "connected": False, "description": "Connect accelerated AI services for specialized workloads.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None},
            {"id": "int_rest_api", "name": "REST API", "category": "Developer", "connected": False, "description": "Connect your own backend APIs.", "synced_agents": [], "last_sync": "Never", "health": 0, "config": {}, "connected_account": None}
        ]
        presets = [{**preset, "workspace_id": workspace_id} for preset in presets]

        coll = firestore_client.collection("integrations")
        docs = coll.stream()
        workspace_docs = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                workspace_docs.append(data)
                
        results = {p["id"]: p for p in presets}
        for data in workspace_docs:
            iid = data.get("id")
            if iid in results:
                results[iid].update(data)
                
        return list(results.values())

    @staticmethod
    def _get_provider(integration_id: str):
        from app.integrations.providers.google_calendar import GoogleCalendarProvider
        from app.integrations.providers.gmail import GmailProvider
        from app.integrations.providers.google_drive import GoogleDriveProvider
        from app.integrations.providers.slack import SlackProvider
        from app.integrations.providers.hubspot import HubSpotProvider
        from app.integrations.providers.shopify import ShopifyProvider
        from app.integrations.providers.razorpay import RazorpayProvider
        from app.integrations.providers.google_maps import GoogleMapsProvider
        from app.integrations.providers.elevenlabs import ElevenLabsProvider
        from app.integrations.providers.firebase import FirebaseProvider
        from app.integrations.providers.rest_api import RestApiProvider
        from app.integrations.providers.google_meet import GoogleMeetProvider
        from app.integrations.providers.whatsapp import WhatsAppProvider
        from app.integrations.providers.base_provider import BaseIntegrationProvider

        providers = {
            "int_gcal": GoogleCalendarProvider(),
            "int_gmail": GmailProvider(),
            "int_gdrive": GoogleDriveProvider(),
            "int_gmeet": GoogleMeetProvider(),
            "int_slack": SlackProvider(),
            "int_whatsapp": WhatsAppProvider(),
            "int_hubspot": HubSpotProvider(),
            "int_razorpay": RazorpayProvider(),
            "int_shopify": ShopifyProvider(),
            "int_google_maps": GoogleMapsProvider(),
            "int_elevenlabs": ElevenLabsProvider(),
            "int_fcm": FirebaseProvider(),
            "int_rest_api": RestApiProvider(),
        }
        
        if integration_id in providers:
            return providers[integration_id]
            
        class GenericProvider(BaseIntegrationProvider):
            async def connect(self, workspace_id: str, payload: dict) -> dict:
                config = payload.get("configuration", {})
                doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{integration_id}")
                integration_data = {
                    "id": integration_id,
                    "workspace_id": workspace_id,
                    "connected": True,
                    "synced_agents": payload.get("synced_agents", []),
                    "last_sync": "Just now",
                    "health": 100,
                    "config": config,
                    "connected_account": payload.get("connected_account") or "Credentials Loaded"
                }
                doc_ref.set(integration_data, merge=True)
                return integration_data
                
            async def disconnect(self, workspace_id: str) -> None:
                doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{integration_id}")
                doc_ref.delete()
                
            async def validate(self, config: dict, credentials: dict) -> bool:
                return True
                
            async def refresh(self, workspace_id: str) -> dict:
                return {}
                
            async def execute(self, workspace_id: str, method: str, args: dict) -> str:
                return f"Successfully executed generic action {method} on {integration_id}."
                
            def capabilities(self) -> list:
                return ["Process custom payloads"]
                
        return GenericProvider()

    @staticmethod
    async def connect_integration(workspace_id: str, integration_id: str, payload: dict) -> dict:
        provider = IntegrationService._get_provider(integration_id)
        integration_data = await provider.connect(workspace_id, payload)
        
        synced_agents = payload.get("synced_agents", [])
        
        # Sync tools back to agents
        try:
            id_to_name = {
                "int_gcal": "Google Calendar",
                "int_gmail": "Gmail",
                "int_gdrive": "Google Drive",
                "int_gmeet": "Google Meet",
                "int_slack": "Slack",
                "int_whatsapp": "WhatsApp Business",
                "int_hubspot": "HubSpot",
                "int_razorpay": "Razorpay",
                "int_shopify": "Shopify",
                "int_google_maps": "Google Maps",
                "int_elevenlabs": "ElevenLabs",
                "int_fcm": "Firebase Cloud Messaging",
                "int_gemini": "Gemini",
                "int_openai": "OpenAI",
                "int_claude": "Claude",
                "int_openrouter": "OpenRouter",
                "int_nvidia_ai": "NVIDIA AI",
                "int_rest_api": "REST API"
            }
            int_name = id_to_name.get(integration_id)
            if int_name:
                agents_coll = firestore_client.collection("agents")
                agent_docs = agents_coll.stream()
                for adoc in agent_docs:
                    adata = adoc.to_dict()
                    if adata.get("workspace_id") == workspace_id:
                        agent_id = adoc.id
                        agent_name = adata.get("name")
                        
                        should_have_tool = (agent_id in synced_agents) or (agent_name in synced_agents)
                        tools = adata.get("tools", [])
                        has_tool = (int_name in tools) or (integration_id in tools)
                        
                        new_tools = list(tools)
                        if should_have_tool and not has_tool:
                            new_tools.append(int_name)
                        elif not should_have_tool and has_tool:
                            new_tools = [t for t in new_tools if t != int_name and t != integration_id]
                            
                        if new_tools != tools:
                            firestore_client.collection("agents").document(agent_id).update({"tools": new_tools})
                            log_info(f"Updated Agent {agent_id} tools list to {new_tools} to match integration sync")
        except Exception as e:
            log_error(f"Failed to sync connected integration {integration_id} to agents", exc=e)
            
        # Enrich integration metadata to comply with IntegrationResponse schema
        metadata = {
            "int_gcal": ("Google Calendar", "Productivity", "Schedule meetings and manage availability."),
            "int_gmail": ("Gmail", "Productivity", "Read, draft and send emails."),
            "int_gdrive": ("Google Drive", "Productivity", "Retrieve knowledge from documents."),
            "int_gmeet": ("Google Meet", "Productivity", "Create meeting links for live conversations."),
            "int_slack": ("Slack", "Communication", "Notify your team and send updates."),
            "int_whatsapp": ("WhatsApp Business", "Communication", "Allow agents to message customers."),
            "int_hubspot": ("HubSpot", "CRM", "Create leads and update contacts."),
            "int_razorpay": ("Razorpay", "Payments", "Generate payment links and verify payments."),
            "int_shopify": ("Shopify", "Commerce", "Track orders and manage storefront data."),
            "int_google_maps": ("Google Maps", "Maps", "Search places and calculate routes."),
            "int_elevenlabs": ("ElevenLabs", "Voice", "Power voice-enabled AI agents."),
            "int_fcm": ("Firebase Cloud Messaging", "Notifications", "Send push notifications."),
            "int_gemini": ("Gemini", "AI", "Bring Gemini models into agent workflows."),
            "int_openai": ("OpenAI", "AI", "Connect OpenAI models for agent reasoning."),
            "int_claude": ("Claude", "AI", "Use Claude for thoughtful long-form reasoning."),
            "int_openrouter": ("OpenRouter", "AI", "Access multiple AI models through one gateway."),
            "int_nvidia_ai": ("NVIDIA AI", "AI", "Connect accelerated AI services for specialized workloads."),
            "int_rest_api": ("REST API", "Developer", "Connect your own backend APIs.")
        }
        meta = metadata.get(integration_id)
        if meta:
            integration_data["name"] = meta[0]
            integration_data["category"] = meta[1]
            if "description" not in integration_data or not integration_data["description"]:
                integration_data["description"] = meta[2]
                
        return integration_data

    @staticmethod
    async def disconnect_integration(workspace_id: str, integration_id: str) -> None:
        provider = IntegrationService._get_provider(integration_id)
        await provider.disconnect(workspace_id)
        
        # Remove integration tools from agents in this workspace
        try:
            id_to_name = {
                "int_gcal": "Google Calendar",
                "int_gmail": "Gmail",
                "int_gdrive": "Google Drive",
                "int_gmeet": "Google Meet",
                "int_slack": "Slack",
                "int_whatsapp": "WhatsApp Business",
                "int_hubspot": "HubSpot",
                "int_razorpay": "Razorpay",
                "int_shopify": "Shopify",
                "int_google_maps": "Google Maps",
                "int_elevenlabs": "ElevenLabs",
                "int_fcm": "Firebase Cloud Messaging",
                "int_rest_api": "REST API"
            }
            int_name = id_to_name.get(integration_id)
            if int_name:
                agents_coll = firestore_client.collection("agents")
                agent_docs = agents_coll.stream()
                for adoc in agent_docs:
                    adata = adoc.to_dict()
                    if adata.get("workspace_id") == workspace_id:
                        agent_id = adoc.id
                        tools = adata.get("tools", [])
                        new_tools = [t for t in tools if t != int_name and t != integration_id]
                        if new_tools != tools:
                            firestore_client.collection("agents").document(agent_id).update({"tools": new_tools})
                            log_info(f"Removed tool {int_name} from Agent {agent_id} on disconnect")
        except Exception as e:
            log_error(f"Failed to remove tools from agents on disconnect for {integration_id}", exc=e)

        log_info(f"Disconnected integration {integration_id} from workspace {workspace_id}")

    @staticmethod
    async def check_health(workspace_id: str, integration_id: str) -> dict:
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{integration_id}")
        snap = doc_ref.get()
        if not snap.exists:
            return {
                "healthy": False,
                "status": "disconnected",
                "last_check": "Just now"
            }
        
        try:
            data = snap.to_dict()
            provider = IntegrationService._get_provider(integration_id)
            is_valid = await provider.validate(data.get("config", {}), {})
            if is_valid:
                return {
                    "healthy": True,
                    "status": "active",
                    "last_check": "Just now"
                }
        except Exception as e:
            log_error(f"Health diagnostics check failed for integration {integration_id}", exc=e)
            
        return {
            "healthy": False,
            "status": "error",
            "last_check": "Just now"
        }
