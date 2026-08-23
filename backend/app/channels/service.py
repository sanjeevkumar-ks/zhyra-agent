"""
Channel Service
===============
Persists real channel state per agent in the `agent_channels` collection and
enforces status transitions. Statuses are NEVER derived from the agent's legacy
`channels` string list — they come from this collection only.

Never returns credentials or encrypted tokens in API responses.
"""

import time
from typing import Dict, List, Optional
from fastapi import HTTPException
from app.database.firestore import firestore_client
from app.channels.registry import (
    CHANNEL_DEFS_BY_TYPE,
    CHANNELS_COLLECTION,
    channel_doc_id,
    default_channel_state,
    STATUS_CONNECTED,
    STATUS_ERROR,
    STATUS_NOT_CONFIGURED,
    STATUS_CONNECTING,
)
from app.utils.logger import log_info, log_error

PUBLIC_CONFIG_KEYS = {
    "web": {"allowed_domains", "primary_color", "widget_title", "welcome_message"},
    "telegram": {"webhook_url"},  # read-only surfaced info; never secrets
}


class ChannelService:
    @staticmethod
    def _doc_ref(agent_id: str, channel_type: str):
        return firestore_client.collection(CHANNELS_COLLECTION).document(
            channel_doc_id(agent_id, channel_type)
        )

    @staticmethod
    def _verify_agent_ownership(workspace_id: str, agent_id: str) -> Dict:
        agent_snap = firestore_client.collection("agents").document(agent_id).get()
        if not agent_snap.exists:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found.")
        data = agent_snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to agent resource.")
        return data

    @staticmethod
    def _read_channel(workspace_id: str, agent_id: str, channel_type: str) -> Optional[Dict]:
        if channel_type not in CHANNEL_DEFS_BY_TYPE:
            raise HTTPException(status_code=400, detail=f"Unknown channel type '{channel_type}'.")
        snap = ChannelService._doc_ref(agent_id, channel_type).get()
        return snap.to_dict() if snap.exists else None

    @classmethod
    async def list_channels(cls, workspace_id: str, agent_id: str) -> List[Dict]:
        """Returns merged channel states: stored doc + registry def, with safe public fields."""
        cls._verify_agent_ownership(workspace_id, agent_id)

        stored: Dict[str, Dict] = {}
        try:
            for doc in firestore_client.collection(CHANNELS_COLLECTION).stream():
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id and data.get("agent_id") == agent_id:
                    stored[data.get("channel_type")] = data
        except Exception as e:
            log_error("Failed to stream agent_channels", exc=e)

        results = []
        for defn in CHANNEL_DEFS_BY_TYPE.values():
            state = stored.get(defn["type"]) or default_channel_state(workspace_id, agent_id, defn["type"])
            results.append(cls._public_state(defn, state))
        return results

    @classmethod
    async def get_channel(cls, workspace_id: str, agent_id: str, channel_type: str) -> Dict:
        cls._verify_agent_ownership(workspace_id, agent_id)
        defn = CHANNEL_DEFS_BY_TYPE.get(channel_type)
        if not defn:
            raise HTTPException(status_code=400, detail=f"Unknown channel type '{channel_type}'.")
        state = cls._read_channel(workspace_id, agent_id, channel_type) or default_channel_state(
            workspace_id, agent_id, channel_type
        )
        return cls._public_state(defn, state)

    @classmethod
    def _public_state(cls, defn: Dict, state: Dict) -> Dict:
        """Shapes a stored channel doc into the public API representation (no secrets)."""
        status = state.get("status", STATUS_NOT_CONFIGURED)
        published = bool(state.get("published"))
        config = state.get("config") or {}
        public_config = {}
        for key in PUBLIC_CONFIG_KEYS.get(defn["type"], set()):
            if key in config and config[key] is not None:
                public_config[key] = config[key]

        can_publish = (
            defn["supported"]
            and status in (STATUS_CONNECTED, STATUS_ERROR)
            and state.get("credentials_reference") is not None
        ) or (defn["supported"] and defn["type"] == "web" and status == STATUS_CONNECTED)

        return {
            "type": defn["type"],
            "label": defn["label"],
            "description": defn["description"],
            "icon": defn["icon"],
            "supported": defn["supported"],
            "setup_fields": defn["setup_fields"],
            "status": status,
            "published": published,
            "error_message": state.get("error_message"),
            "last_tested_at": state.get("last_tested_at"),
            "last_test_result": state.get("last_test_result"),
            "config": public_config,
            "widget_id": state.get("widget_id"),
            "telegram_bot_username": state.get("telegram_bot_username"),
            "credentials_configured": state.get("credentials_reference") is not None,
            "can_publish": can_publish,
        }

    @classmethod
    async def _read_full(cls, workspace_id: str, agent_id: str, channel_type: str) -> Dict:
        state = cls._read_channel(workspace_id, agent_id, channel_type) or default_channel_state(
            workspace_id, agent_id, channel_type
        )
        return state

    @classmethod
    async def get_full_state(cls, workspace_id: str, agent_id: str, channel_type: str) -> Dict:
        """Full stored state (may contain internal fields) after verifying ownership."""
        cls._verify_agent_ownership(workspace_id, agent_id)
        return await cls._read_full(workspace_id, agent_id, channel_type)

    @classmethod
    async def update_config(cls, workspace_id: str, agent_id: str, channel_type: str, config: Dict) -> Dict:
        cls._verify_agent_ownership(workspace_id, agent_id)
        defn = CHANNEL_DEFS_BY_TYPE.get(channel_type)
        if not defn:
            raise HTTPException(status_code=400, detail=f"Unknown channel type '{channel_type}'.")

        allowed_keys = PUBLIC_CONFIG_KEYS.get(channel_type, set())
        # bot_token is accepted here for the telegram connect flow but never stored on the doc.
        clean = {k: v for k, v in config.items() if k in allowed_keys or k == "bot_token"}

        state = await cls._read_full(workspace_id, agent_id, channel_type)
        merged = dict(state.get("config") or {})
        for k, v in clean.items():
            if k == "bot_token":
                continue
            merged[k] = v
        state["config"] = merged
        state["updated_at"] = time.time()
        cls._doc_ref(agent_id, channel_type).set(state, merge=True)
        log_info(f"Channel config updated for {agent_id} / {channel_type}")
        return cls._public_state(defn, state)

    @classmethod
    async def transition(cls, workspace_id: str, agent_id: str, channel_type: str,
                         status: str, **extra) -> Dict:
        state = await cls._read_full(workspace_id, agent_id, channel_type)
        state["status"] = status
        state["updated_at"] = time.time()
        for k, v in extra.items():
            if v is not None:
                state[k] = v
        cls._doc_ref(agent_id, channel_type).set(state, merge=True)
        return state

    @classmethod
    async def mark_test_result(cls, workspace_id: str, agent_id: str, channel_type: str,
                               ok: bool, detail: str) -> Dict:
        state = await cls._read_full(workspace_id, agent_id, channel_type)
        state["last_tested_at"] = time.time()
        state["last_test_result"] = {"ok": bool(ok), "detail": detail}
        state["status"] = STATUS_CONNECTED if ok else STATUS_ERROR
        state["error_message"] = None if ok else detail
        state["updated_at"] = time.time()
        cls._doc_ref(agent_id, channel_type).set(state, merge=True)
        return state

    @classmethod
    async def set_error(cls, workspace_id: str, agent_id: str, channel_type: str, message: str) -> Dict:
        state = await cls._read_full(workspace_id, agent_id, channel_type)
        state["status"] = STATUS_ERROR
        state["error_message"] = message
        state["updated_at"] = time.time()
        cls._doc_ref(agent_id, channel_type).set(state, merge=True)
        return state

    @classmethod
    async def set_published(cls, workspace_id: str, agent_id: str, channel_type: str, published: bool) -> Dict:
        state = await cls._read_full(workspace_id, agent_id, channel_type)
        state["published"] = published
        state["updated_at"] = time.time()
        cls._doc_ref(agent_id, channel_type).set(state, merge=True)
        return state

    @classmethod
    async def set_credentials(cls, workspace_id: str, agent_id: str, channel_type: str,
                              credentials_reference: Optional[str]) -> Dict:
        state = await cls._read_full(workspace_id, agent_id, channel_type)
        state["credentials_reference"] = credentials_reference
        state["updated_at"] = time.time()
        cls._doc_ref(agent_id, channel_type).set(state, merge=True)
        return state

    @classmethod
    async def reset(cls, workspace_id: str, agent_id: str, channel_type: str) -> Dict:
        """Disconnect resets a channel to a pristine not_configured state (no fake toggles)."""
        state = await cls._read_full(workspace_id, agent_id, channel_type)
        state.update({
            "status": STATUS_NOT_CONFIGURED,
            "published": False,
            "error_message": None,
            "last_tested_at": None,
            "last_test_result": None,
            "credentials_reference": None,
            "telegram_bot_username": None,
            "config": {},
        })
        if channel_type == "web":
            state["widget_id"] = None
        state["updated_at"] = time.time()
        cls._doc_ref(agent_id, channel_type).set(state, merge=True)
        log_info(f"Channel reset for {agent_id} / {channel_type}")
        return state

    @classmethod
    async def resolve_widget_deployment(cls, widget_id: str) -> Optional[Dict]:
        """Locates the published web channel deployment for a widget_id (server-side resolution)."""
        if not widget_id:
            return None
        widget_id = widget_id.strip()
        try:
            for doc in firestore_client.collection(CHANNELS_COLLECTION).stream():
                data = doc.to_dict()
                if data.get("widget_id") == widget_id and data.get("channel_type") == "web":
                    return data
        except Exception as e:
            log_error("Failed to resolve widget deployment", exc=e)
        return None

    @classmethod
    async def resolve_telegram_connection(cls, connection_id: str) -> Optional[Dict]:
        try:
            snap = firestore_client.collection(CHANNELS_COLLECTION).document(connection_id).get()
            if snap.exists:
                data = snap.to_dict()
                if data.get("channel_type") == "telegram":
                    return data
        except Exception as e:
            log_error("Failed to resolve telegram connection", exc=e)
        return None

    @classmethod
    async def channel_counts(cls, workspace_id: str, agent_id: str) -> Dict:
        """Real connected/published counts from the agent_channels collection."""
        channels = await cls.list_channels(workspace_id, agent_id)
        connected = sum(1 for c in channels if c["status"] in (STATUS_CONNECTED, STATUS_ERROR))
        published = sum(1 for c in channels if c["published"])
        return {
            "total": len(channels),
            "supported": sum(1 for c in channels if c["supported"]),
            "connected": connected,
            "published": published,
        }