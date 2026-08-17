import time
import uuid
from fastapi import HTTPException
from app.database.firestore import firestore_client
from app.integrations.credential_store import load_credentials
from app.integrations.providers.elevenlabs import ElevenLabsProvider
from app.utils.logger import log_info, log_error

# In-memory active voice session cache
ACTIVE_VOICE_SESSIONS = {}

class VoiceService:
    @staticmethod
    def get_elevenlabs_status(workspace_id: str) -> dict:
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_int_elevenlabs")
        snap = doc_ref.get()
        if not snap.exists:
            return {"connected": False, "provider": "elevenlabs"}
        data = snap.to_dict()
        return {
            "connected": bool(data.get("connected", False)),
            "provider": "elevenlabs",
            "last_sync": data.get("last_sync", "Never"),
            "connected_account": data.get("connected_account")
        }

    @classmethod
    def _require_api_key(cls, workspace_id: str) -> str:
        status = cls.get_elevenlabs_status(workspace_id)
        if not status.get("connected"):
            raise HTTPException(
                status_code=400,
                detail="VOICE_PROVIDER_NOT_CONNECTED: Connect ElevenLabs in Integrations to enable voice features."
            )
        creds = load_credentials(workspace_id, "int_elevenlabs")
        api_key = creds.get("api_key") if creds else None
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="VOICE_PROVIDER_AUTH_FAILED: ElevenLabs credentials missing or expired."
            )
        return api_key

    @classmethod
    async def list_voices(cls, workspace_id: str) -> list:
        api_key = cls._require_api_key(workspace_id)
        provider = ElevenLabsProvider()
        try:
            return await provider.fetch_voices(api_key)
        except HTTPException:
            raise
        except Exception as e:
            log_error(f"Failed to list ElevenLabs voices for workspace {workspace_id}", exc=e)
            raise HTTPException(status_code=500, detail=f"VOICE_PROVIDER_UNAVAILABLE: {str(e)}")

    @classmethod
    async def preview_voice(cls, workspace_id: str, voice_id: str, text: str = "Hello! I am your AI agent powered by ElevenLabs.") -> bytes:
        api_key = cls._require_api_key(workspace_id)
        provider = ElevenLabsProvider()
        return await provider.generate_tts_audio(api_key, text=text, voice_id=voice_id)

    @classmethod
    async def clone_voice(
        cls,
        workspace_id: str,
        name: str,
        description: str,
        files: list,
        confirm_permission: bool
    ) -> dict:
        if not confirm_permission:
            raise HTTPException(
                status_code=400,
                detail="VOICE_PERMISSION_DENIED: You must explicitly confirm that you have rights to clone this voice."
            )
        api_key = cls._require_api_key(workspace_id)
        provider = ElevenLabsProvider()
        result = await provider.clone_voice_from_file(api_key, name, description, files)
        voice_id = result.get("voice_id")
        
        voice_doc = {
            "id": voice_id,
            "voice_id": voice_id,
            "workspace_id": workspace_id,
            "name": name,
            "description": description,
            "provider": "ElevenLabs",
            "is_custom": True,
            "status": "ready",
            "created_at": time.time()
        }
        firestore_client.collection("voice_profiles").document(voice_id).set(voice_doc)
        log_info(f"Cloned ElevenLabs voice '{name}' ({voice_id}) for workspace {workspace_id}")
        return voice_doc

    @classmethod
    async def delete_voice(cls, workspace_id: str, voice_id: str) -> dict:
        api_key = cls._require_api_key(workspace_id)
        provider = ElevenLabsProvider()
        await provider.delete_voice_by_id(api_key, voice_id)
        
        # Remove local doc if exists
        try:
            firestore_client.collection("voice_profiles").document(voice_id).delete()
        except Exception:
            pass
        return {"success": True, "voice_id": voice_id}

    @classmethod
    async def create_session(cls, workspace_id: str, agent_id: str) -> dict:
        # 1. Check ElevenLabs provider status
        api_key = cls._require_api_key(workspace_id)

        # 2. Check Agent configuration
        agent_ref = firestore_client.collection("agents").document(agent_id)
        agent_snap = agent_ref.get()
        if not agent_snap.exists:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found.")
        agent = agent_snap.to_dict()
        if agent.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to agent.")

        voice_config = agent.get("voice_config") or {}
        # If enabled is not explicitly set, default to True if a voice_id is present
        voice_enabled = voice_config.get("enabled", True if agent.get("voice_id") else False)
        voice_id = voice_config.get("voice_id") or agent.get("voice_id")

        if not voice_enabled or not voice_id:
            raise HTTPException(
                status_code=400,
                detail="VOICE_NOT_CONFIGURED: Agent must have voice enabled and a valid ElevenLabs voice assigned."
            )

        session_id = f"vses_{uuid.uuid4().hex[:12]}"
        expires_at = time.time() + 3600  # 1 hour

        session_data = {
            "session_id": session_id,
            "workspace_id": workspace_id,
            "agent_id": agent_id,
            "voice_id": voice_id,
            "provider": "elevenlabs",
            "expires_at": expires_at,
            "created_at": time.time(),
            "status": "active"
        }

        ACTIVE_VOICE_SESSIONS[session_id] = session_data
        
        # Also store session record in Firestore
        firestore_client.collection("voice_sessions").document(session_id).set(session_data)

        log_info(f"Voice session {session_id} created for agent {agent_id} (voice: {voice_id})")

        return {
            "success": True,
            "session_id": session_id,
            "provider": "elevenlabs",
            "voice_id": voice_id,
            "expires_at": expires_at
        }

    @classmethod
    def get_session(cls, session_id: str) -> dict:
        sess = ACTIVE_VOICE_SESSIONS.get(session_id)
        if sess and sess["expires_at"] > time.time():
            return sess
        # Fallback to Firestore
        doc = firestore_client.collection("voice_sessions").document(session_id).get()
        if doc.exists:
            sess = doc.to_dict()
            if sess.get("expires_at", 0) > time.time():
                ACTIVE_VOICE_SESSIONS[session_id] = sess
                return sess
        raise HTTPException(status_code=404, detail="VOICE_SESSION_EXPIRED: Invalid or expired voice session.")
