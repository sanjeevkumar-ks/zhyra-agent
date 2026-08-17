from app.database.firestore import firestore_client
from app.middleware.auth import AuthUser
from app.utils.logger import log_info, log_error

class AuthService:
    @staticmethod
    async def verify_and_register_user(auth_user: AuthUser) -> dict:
        """
        Validates the user exists in Firestore. 
        If not, creates user record and provisions a default workspace.
        """
        user_ref = firestore_client.collection("users").document(auth_user.uid)
        user_snap = user_ref.get()

        if user_snap.exists:
            return user_snap.to_dict()

        # User does not exist, provision a new user & workspace
        log_info(f"Registering new user: {auth_user.email} (uid: {auth_user.uid})")
        
        # 1. Create a default workspace
        workspace_id = f"ws_{auth_user.uid[:10]}"
        ws_ref = firestore_client.collection("workspaces").document(workspace_id)
        
        workspace_data = {
            "id": workspace_id,
            "name": f"{auth_user.name or 'My Business'}'s Workspace",
            "owner_id": auth_user.uid,
            "industry": "Technology",
            "timezone": "UTC",
            "language": "English (US)",
            "default_provider": "gemini",
            "default_model": "gemini-3.5-flash",
            "temperature": 0.7,
            "max_output_tokens": 1000,
            "streaming_enabled": True
        }
        ws_ref.set(workspace_data)
        log_info(f"Provisioned default workspace {workspace_id} for user {auth_user.uid}")

        # 2. Create user record
        user_data = {
            "uid": auth_user.uid,
            "email": auth_user.email,
            "name": auth_user.name,
            "avatar_url": auth_user.picture,
            "workspace_id": workspace_id,
            "onboarded": False
        }
        user_ref.set(user_data)
        
        # 3. Create default plans and settings collections for this workspace
        plan_ref = firestore_client.collection("plans").document(workspace_id)
        plan_ref.set({
            "name": "Scale Plan (Trial)",
            "status": "active",
            "price_monthly": 0.0,
            "renews_date": "N/A",
            "conversations_included": 1000,
            "conversations_used": 0
        })

        # Provision empty providers structure
        settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
        settings_ref.set({
            "gemini": {"connected": False, "api_key": ""},
            "openai": {"connected": False, "api_key": ""},
            "claude": {"connected": False, "api_key": ""},
            "openrouter": {"connected": False, "api_key": ""}
        })
        
        # Provision default team members
        team_ref_1 = firestore_client.collection("team").document(f"team_member_1_{workspace_id}")
        team_ref_1.set({
            "id": f"team_member_1_{workspace_id}",
            "workspace_id": workspace_id,
            "name": auth_user.name or "Owner",
            "email": auth_user.email,
            "role": "Workspace Creator",
            "permission": "Owner",
            "initials": (auth_user.name or "O")[0].upper(),
            "gradient": "from-[#2F6BFF] to-[#8B7CF6]",
            "lastActive": "Just now"
        })

        # Provision default memories
        memory_ref_1 = firestore_client.collection("memories").document(f"mem_1_{workspace_id}")
        memory_ref_1.set({
            "id": f"mem_1_{workspace_id}",
            "workspace_id": workspace_id,
            "title": "Customer #4021 Billing Issue",
            "detail": "Elena corrected invoice pricing margin overrides for clinical consultations.",
            "type": "long-term",
            "time": "2h ago",
            "agent": "Tara",
            "protected": True
        })
        
        memory_ref_2 = firestore_client.collection("memories").document(f"mem_2_{workspace_id}")
        memory_ref_2.set({
            "id": f"mem_2_{workspace_id}",
            "workspace_id": workspace_id,
            "title": "Customer Preference",
            "detail": "Patient prefers SMS reminders instead of direct telephone calls.",
            "type": "preference",
            "time": "1d ago",
            "agent": "Kayal",
            "protected": False
        })
        
        memory_ref_3 = firestore_client.collection("memories").document(f"mem_3_{workspace_id}")
        memory_ref_3.set({
            "id": f"mem_3_{workspace_id}",
            "workspace_id": workspace_id,
            "title": "Temporary Session State",
            "detail": "Checked inventory levels for flu vaccination supplies.",
            "type": "short-term",
            "time": "2d ago",
            "agent": "Mitran",
            "protected": False
        })
        
        # Load default agents (Tara, Kayal, Mitran, Agan, Mathi)
        from app.services.agent_service import AgentService
        await AgentService.provision_default_agents(workspace_id)

        return user_data
