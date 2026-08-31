from app.database.firestore import firestore_client
from fastapi import HTTPException
from app.utils.logger import log_info, log_error
import uuid

class AgentService:
    @staticmethod
    async def _attach_channel_counts(workspace_id: str, agent_id: str, data: dict) -> dict:
        try:
            from app.channels.service import ChannelService
            counts = await ChannelService.channel_counts(workspace_id, agent_id)
            data["channel_counts"] = counts
        except Exception:
            data["channel_counts"] = {"total": 7, "supported": 2, "connected": 0, "published": 0}
        return data

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
                data["conversations_today"] = convo_counts.get(aid, 0)
                data = await AgentService._attach_channel_counts(workspace_id, aid, data)
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

        data["conversations_today"] = count
        return await AgentService._attach_channel_counts(workspace_id, agent_id, data)

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
    async def get_available_agents(workspace_id: str) -> list:
        """Canonical agent registry method to retrieve eligible active standard/specialist agents for a workspace."""
        coll = firestore_client.collection("agents")
        docs = coll.stream()
        results = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                if data.get("agent_type") != "master":
                    results.append({
                        "id": data.get("id"),
                        "name": data.get("name"),
                        "purpose": data.get("purpose"),
                        "status": data.get("status", "active"),
                        "agent_type": data.get("agent_type", "specialist"),
                        "capabilities": data.get("capabilities", []),
                        "tools": data.get("tools", []),
                        "role": data.get("role"),
                        "avatar_gradient": data.get("avatar_gradient"),
                        "initials": data.get("initials")
                    })
        return results

    @staticmethod
    async def create_agent(workspace_id: str, agent_data: dict) -> dict:
        if agent_data.get("agent_type") == "master":
            raise HTTPException(status_code=400, detail="Master agents cannot be created manually.")
            
        if agent_data.get("name", "").strip().lower() == "zhyra":
            raise HTTPException(status_code=400, detail="The name 'Zhyra' is reserved for the Master Agent.")
            
        agent_id = f"agt_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("agents").document(agent_id)
        
        # Merge ID and workspace
        full_data = {
            **agent_data,
            "id": agent_id,
            "workspace_id": workspace_id,
            "agent_type": agent_data.get("agent_type") or "specialist",
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
        
        # Protect agent_type modifications
        existing_type = data.get("agent_type", "specialist")
        new_type = filtered_updates.get("agent_type")
        if new_type and new_type != existing_type:
            raise HTTPException(status_code=400, detail="Modifying agent_type is protected and cannot be changed.")
            
        if existing_type != "master" and filtered_updates.get("name", "").strip().lower() == "zhyra":
            raise HTTPException(status_code=400, detail="The name 'Zhyra' is reserved for the Master Agent.")
            
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
            
        if data.get("agent_type") == "master":
            raise HTTPException(status_code=400, detail="The Zhyra Master Agent cannot be deleted.")
            
        doc_ref.delete()
        log_info(f"Deleted Agent {agent_id} from workspace {workspace_id}")

    @staticmethod
    async def provision_zhyra_master_agent(workspace_id: str) -> dict:
        """Seeds the Zhyra Master Agent for a workspace if it does not exist."""
        agent_id = f"agt_zhyra_{workspace_id[:5]}"
        doc_ref = firestore_client.collection("agents").document(agent_id)
        snap = doc_ref.get()
        if snap.exists:
            # Enforce agent_type is master if it was created without it
            existing = snap.to_dict()
            if existing.get("agent_type") != "master":
                doc_ref.update({"agent_type": "master"})
                existing["agent_type"] = "master"
            return existing

        zhyra_data = {
            "id": agent_id,
            "workspace_id": workspace_id,
            "name": "Zhyra",
            "purpose": "Master AI agent responsible for coordinating your AI workforce.",
            "avatar_gradient": "from-[#0F172A] to-[#1E293B]",
            "initials": "ZH",
            "status": "setup_required",
            "enabled": False,
            "is_enabled": False,
            "agent_type": "master",
            "provider_id": None,
            "model": None,
            "capabilities": ["Coordinate AI agents", "Monitor agent activity", "Diagnose operational issues", "Manage workflows"],
            "channels": ["Web Chat"],
            "personality": "Professional, operationally rigorous, clear-headed, and factual.",
            "role": "Master Agent",
            "goals": [
                "Coordinate AI agents",
                "Monitor agent activity",
                "Diagnose operational issues",
                "Manage workflows",
                "Analyze workspace performance",
                "Recommend improvements",
                "Execute approved actions",
                "Maintain operational reliability"
            ],
            "tools": [
                "zhyra.list_agents",
                "zhyra.get_agent",
                "zhyra.pause_agent",
                "zhyra.resume_agent",
                "zhyra.get_agent_conversations",
                "zhyra.list_workflows",
                "zhyra.get_workspace_analytics",
                "zhyra.list_integrations",
                "zhyra.get_agent_issues",
                "zhyra.delegate_to_agent"
            ],
            "knowledge_sources": [],
            "orchestration": {
                "delegation_enabled": True,
                "managed_agent_ids": []
            },
            "overrides": {
                "provider": None,
                "model": None,
                "temperature": 0.2,
                "system_prompt": (
                    "You are Zhyra, the Master Agent of this workspace. Your responsibility is to "
                    "understand, coordinate, monitor, and manage the user's AI workforce.\n\n"
                    "You have internal platform tools that allow you to check workspace state (list_agents, "
                    "get_agent, pause_agent, resume_agent, list_workflows, list_integrations, get_workspace_analytics, and delegate_to_agent). "
                    "Use them to inspect real workspace data when asked. Never fabricate metrics, activity, agent state, or analytics.\n\n"
                    "When a request requires executing actions or handling specialized domains belonging to a specialist agent (such as Tara, Kayal, Mitran, Agan, Mathi), "
                    "use the delegate_to_agent tool to delegate the task to the appropriate real enabled agent and synthesize their response for the user."
                )
            },
            "conversations_today": 0,
            "resolution_rate": 100,
            "health": 100,
            "recent_improvement": "Ready to orchestrate."
        }
        doc_ref.set(zhyra_data)
        log_info(f"Zhyra Master Agent provisioned for workspace {workspace_id}")
        
        try:
            ws_ref = firestore_client.collection("workspaces").document(workspace_id)
            ws_snap = ws_ref.get()
            if ws_snap.exists:
                ws_ref.update({"zhyra_agent_id": agent_id})
        except Exception as e:
            log_error(f"Failed to update workspace with zhyra_agent_id: {e}")
            
        return zhyra_data

    @staticmethod
    async def provision_default_agents(workspace_id: str) -> None:
        """Seeds initial default agents for workspace sandbox exploration."""
        defaults = [
            {
                "id": f"agt_tara_{workspace_id[:5]}",
                "name": "Tara",
                "purpose": "Customer Support Assistant",
                "avatar_gradient": "from-[#2F6BFF] to-[#8B7CF6]",
                "initials": "T",
                "status": "active",
                "agent_type": "specialist",
                "channels": ["Web Chat", "Email"],
                "tools": [],
                "knowledge_sources": [],
                "overrides": {
                    "provider": "gemini",
                    "model": "gemini-3.5-flash",
                    "temperature": 0.3,
                    "system_prompt": "You are Tara, Customer Support Assistant. Help users resolve inquiries politely and accurately."
                }
            },
            {
                "id": f"agt_kayal_{workspace_id[:5]}",
                "name": "Kayal",
                "purpose": "Appointment Concierge",
                "avatar_gradient": "from-[#8B7CF6] to-[#2F6BFF]",
                "initials": "K",
                "status": "active",
                "agent_type": "specialist",
                "channels": ["Web Chat"],
                "tools": [],
                "knowledge_sources": [],
                "overrides": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "temperature": 0.5,
                    "system_prompt": "You are Kayal, Appointment Concierge. Assist users with scheduling and bookings."
                }
            },
            {
                "id": f"agt_mitran_{workspace_id[:5]}",
                "name": "Mitran",
                "purpose": "Knowledge Assistant",
                "avatar_gradient": "from-[#16A672] to-[#2F6BFF]",
                "initials": "M",
                "status": "active",
                "agent_type": "specialist",
                "channels": ["Web Chat"],
                "tools": [],
                "knowledge_sources": [],
                "overrides": {
                    "provider": "claude",
                    "model": "claude-3-5-sonnet-latest",
                    "temperature": 0.1,
                    "system_prompt": "You are Mitran, Knowledge Assistant. Answer questions accurately based on documentation."
                }
            },
            {
                "id": f"agt_agan_{workspace_id[:5]}",
                "name": "Agan",
                "purpose": "Sales Qualification Assistant",
                "avatar_gradient": "from-[#D89A2A] to-[#2F6BFF]",
                "initials": "A",
                "status": "active",
                "agent_type": "specialist",
                "channels": ["Web Chat", "Email"],
                "tools": [],
                "knowledge_sources": [],
                "overrides": {
                    "provider": "gemini",
                    "model": "gemini-3.5-flash",
                    "temperature": 0.4,
                    "system_prompt": "You are Agan, Sales Qualification Assistant. Qualify leads and answer product questions."
                }
            },
            {
                "id": f"agt_mathi_{workspace_id[:5]}",
                "name": "Mathi",
                "purpose": "Operations Assistant",
                "avatar_gradient": "from-[#E11D48] to-[#8B7CF6]",
                "initials": "M",
                "status": "active",
                "agent_type": "specialist",
                "channels": ["Web Chat"],
                "tools": [],
                "knowledge_sources": [],
                "overrides": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "temperature": 0.2,
                    "system_prompt": "You are Mathi, Operations Assistant. Assist with operational tracking and task routing."
                }
            }
        ]
        
        for agent in defaults:
            ref = firestore_client.collection("agents").document(agent["id"])
            agent["workspace_id"] = workspace_id
            ref.set(agent)
            
        log_info(f"Seeded default agents (Tara, Kayal, Mitran, Agan, Mathi) for workspace {workspace_id}")
