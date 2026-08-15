from app.database.firestore import firestore_client
from fastapi import HTTPException
from app.utils.logger import log_info, log_error
import uuid

class AgentService:
    @staticmethod
    async def list_agents(workspace_id: str) -> list:
        coll = firestore_client.collection("agents")
        docs = coll.stream()
        results = []

        convo_counts = {}
        try:
            convos = firestore_client.collection("conversations").stream()
            for doc in convos:
                cdata = doc.to_dict()
                if cdata.get("workspace_id") == workspace_id:
                    aid = cdata.get("agent_id")
                    if aid:
                        convo_counts[aid] = convo_counts.get(aid, 0) + 1
        except Exception:
            pass

        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                aid = data.get("id")
                baseline = 0
                if "nova" in aid.lower():
                    baseline = 0
                elif "orion" in aid.lower():
                    baseline = 0
                elif "sage" in aid.lower():
                    baseline = 0
                data["conversations_today"] = baseline + convo_counts.get(aid, 0)
                results.append(data)
        return results

    @staticmethod
    async def get_agent(workspace_id: str, agent_id: str) -> dict:
        doc_ref = firestore_client.collection("agents").document(agent_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found.")
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to agent resource.")
        
        # Calculate convo count for this single agent
        count = 0
        try:
            convos = firestore_client.collection("conversations").stream()
            for doc in convos:
                cdata = doc.to_dict()
                if cdata.get("workspace_id") == workspace_id and cdata.get("agent_id") == agent_id:
                    count += 1
        except Exception:
            pass

        baseline = 0
        if "nova" in agent_id.lower():
            baseline = 0
        elif "orion" in agent_id.lower():
            baseline = 0
        elif "sage" in agent_id.lower():
            baseline = 0
        data["conversations_today"] = baseline + count
        return data

    @staticmethod
    def _sync_agent_tools_to_integrations(workspace_id: str, agent_id: str, agent_name: str, updated_tools: list):
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
            
            integrations_coll = firestore_client.collection("integrations")
            docs = integrations_coll.stream()
            for doc in docs:
                idata = doc.to_dict()
                if idata.get("workspace_id") == workspace_id:
                    int_id = idata.get("id")
                    int_name = id_to_name.get(int_id, idata.get("name", ""))
                    
                    is_assigned = (int_name in updated_tools) or (int_id in updated_tools)
                    synced_agents = idata.get("synced_agents", [])
                    has_agent = (agent_id in synced_agents) or (agent_name in synced_agents)
                    
                    new_synced = list(synced_agents)
                    if is_assigned and not has_agent:
                        new_synced.append(agent_id)
                    elif not is_assigned and has_agent:
                        new_synced = [a for a in new_synced if a != agent_id and a != agent_name]
                        
                    if new_synced != synced_agents:
                        firestore_client.collection("integrations").document(doc.id).update({"synced_agents": new_synced})
                        log_info(f"Synced integration {int_id} synced_agents to {new_synced}")
        except Exception as e:
            log_error(f"Error syncing agent tools for agent {agent_id}", exc=e)

    @staticmethod
    async def create_agent(workspace_id: str, agent_data: dict) -> dict:
        agent_id = f"agt_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("agents").document(agent_id)
        
        # Merge ID and workspace
        full_data = {
            **agent_data,
            "id": agent_id,
            "workspace_id": workspace_id,
            "conversations_today": 0,
            "resolution_rate": 100,
            "health": 100,
            "recent_improvement": "Newly initialized Agent"
        }
        
        doc_ref.set(full_data)
        log_info(f"Agent '{full_data['name']}' ({agent_id}) created in workspace {workspace_id}")
        
        if "tools" in full_data and full_data["tools"]:
            AgentService._sync_agent_tools_to_integrations(workspace_id, agent_id, full_data["name"], full_data["tools"])
            
        return full_data

    @staticmethod
    async def update_agent(workspace_id: str, agent_id: str, update_data: dict) -> dict:
        doc_ref = firestore_client.collection("agents").document(agent_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found.")
            
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to agent resource.")
            
        filtered_updates = {k: v for k, v in update_data.items() if v is not None}
        if filtered_updates:
            doc_ref.update(filtered_updates)
            log_info(f"Updated Agent {agent_id} settings.")
            if "tools" in filtered_updates:
                agent_name = filtered_updates.get("name", data.get("name"))
                AgentService._sync_agent_tools_to_integrations(workspace_id, agent_id, agent_name, filtered_updates["tools"])
            
        return (doc_ref.get()).to_dict()

    @staticmethod
    async def delete_agent(workspace_id: str, agent_id: str) -> None:
        doc_ref = firestore_client.collection("agents").document(agent_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found.")
            
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to agent resource.")
            
        doc_ref.delete()
        log_info(f"Deleted Agent {agent_id} from workspace {workspace_id}")

    @staticmethod
    async def provision_default_agents(workspace_id: str) -> None:
        """Seeds initial default agents for workspace sandbox exploration."""
        defaults = [
            {
                "id": f"agt_nova_{workspace_id[:5]}",
                "name": "Nova",
                "purpose": "Customer Support Lead",
                "avatar_gradient": "from-[#2F6BFF] to-[#8B7CF6]",
                "initials": "NV",
                "status": "active",
                "capabilities": ["Answers FAQs", "Handles refunds", "Escalates edge cases", "Sentiment aware"],
                "channels": ["Web Chat", "WhatsApp", "Email"],
                "conversations_today": 0,
                "resolution_rate": 0,
                "health": 0,
                "personality": "Warm, concise, and endlessly patient.",
                "role": "First line of support across every channel.",
                "goals": ["Resolve 90%+ without escalation", "Keep CSAT above 4.7", "Respond within 8 seconds"],
                "tools": ["Zendesk", "Stripe", "Order DB"],
                "knowledge_sources": ["Support Macros", "Refund Policy", "Product Manual v4"],
                "recent_improvement": "Learned new shipping policy from 12 updated documents.",
                "overrides": {
                    "provider": "gemini",
                    "model": "gemini-3.5-flash",
                    "temperature": 0.3,
                    "system_prompt": "You are Nova, Customer Support Lead. Be warm, concise, and endlessly patient."
                }
            },
            {
                "id": f"agt_orion_{workspace_id[:5]}",
                "name": "Orion",
                "purpose": "Appointment Concierge",
                "avatar_gradient": "from-[#8B7CF6] to-[#2F6BFF]",
                "initials": "OR",
                "status": "active",
                "capabilities": ["Books appointments", "Reschedules", "Sends reminders", "Handles cancellations"],
                "channels": ["Phone", "Web Chat", "SMS"],
                "conversations_today": 0,
                "resolution_rate": 0,
                "health": 0,
                "personality": "Friendly and efficient, never keeps people waiting.",
                "role": "Manages the full booking lifecycle for the clinic team.",
                "goals": ["Fill 95% of available slots", "Reduce no-shows by 20%"],
                "tools": ["Google Calendar", "Calendly", "Twilio"],
                "knowledge_sources": ["Clinic Hours", "Provider Directory"],
                "recent_improvement": "Now handles multi-provider rescheduling automatically.",
                "overrides": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "system_prompt": "You are Orion, the Appointment Concierge. You are friendly, prompt, and focus on scheduling appointments."
                }
            },
            {
                "id": f"agt_sage_{workspace_id[:5]}",
                "name": "Sage",
                "purpose": "Knowledge & Research Assistant",
                "avatar_gradient": "from-[#16A672] to-[#2F6BFF]",
                "initials": "SG",
                "status": "training",
                "capabilities": ["Summarizes documents", "Answers internal questions", "Cites sources"],
                "channels": ["Slack", "Internal Portal"],
                "conversations_today": 0,
                "resolution_rate": 0,
                "health": 0,
                "personality": "Precise, thoughtful, cites everything.",
                "role": "Internal knowledge assistant for the operations team.",
                "goals": ["Reduce time-to-answer for internal queries", "Maintain source accuracy"],
                "tools": ["Notion", "Google Drive"],
                "knowledge_sources": ["Ops Wiki", "Onboarding Docs"],
                "recent_improvement": "Currently learning the new vendor management policy.",
                "overrides": {
                    "provider": "claude",
                    "model": "claude-3-5-sonnet-latest",
                    "temperature": 0.1,
                    "system_prompt": "You are Sage, a precise and thoughtful Knowledge Assistant. Always cite sources."
                }
            }
        ]
        
        for agent in defaults:
            ref = firestore_client.collection("agents").document(agent["id"])
            agent["workspace_id"] = workspace_id
            ref.set(agent)
            
        log_info(f"Seeded default agents Nova, Orion, and Sage for workspace {workspace_id}")
