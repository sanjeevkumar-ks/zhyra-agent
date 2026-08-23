"""
Channel Adapters
================
Each supported channel implements the same adapter contract. Adapters are the
ONLY place that talks to external channel APIs. Every adapter funnels messages
into the single AgentRuntime / ToolExecutor / action-gate stack.

Credentials are encrypted (credential_store) and only decrypted immediately
before use. They never appear in API responses or logs.
"""

import os
import uuid
from typing import Dict, Optional
from fastapi import HTTPException
import httpx
from app.channels.registry import STATUS_CONNECTED, STATUS_NOT_CONFIGURED
from app.utils.logger import log_info, log_error

TELEGRAM_API_BASE = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org")
WEBHOOK_BASE_URL = (os.getenv("WEBHOOK_BASE_URL") or os.getenv("BACKEND_BASE_URL") or "").rstrip("/")


def _default_webhook_base() -> str:
    if WEBHOOK_BASE_URL:
        return WEBHOOK_BASE_URL
    if os.getenv("VERCEL"):
        return "https://zhyra-agent.vercel.app"
    return "http://127.0.0.1:8011"


class ChannelAdapter:
    key: str = ""

    async def test(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        raise NotImplementedError

    async def connect(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        raise NotImplementedError

    async def publish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        raise NotImplementedError

    async def unpublish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        raise NotImplementedError

    async def disconnect(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        raise NotImplementedError


class WebChannelAdapter(ChannelAdapter):
    """Web chat widget — no external credentials required.

    Publish generates a widget_id (server-side deployment key). The iframe
    widget and the public /api/widget/* endpoints are bound to that widget_id.
    """

    key = "web"

    async def test(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        return {"ok": True, "detail": "Widget is ready to serve. No external credentials required.", "bot_username": None}

    async def connect(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        return {"status": STATUS_CONNECTED, "detail": "Web Chat connected. You can now publish the widget."}

    async def publish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        widget_id = channel_doc.get("widget_id")
        if not widget_id:
            widget_id = f"wdg_{uuid.uuid4().hex[:10]}"
        log_info(f"Web Chat deployment created: {widget_id} for agent {agent_id}")
        return {"widget_id": widget_id}

    async def unpublish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        return {"detail": "Web Chat widget unpublished."}

    async def disconnect(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        return {"detail": "Web Chat disconnected."}


class UnsupportedChannelAdapter(ChannelAdapter):
    def __init__(self, key: str):
        self.key = key

    def _coming_soon(self):
        raise HTTPException(status_code=400, detail=f"The {self.key} channel is coming soon and cannot be configured yet.")

    async def test(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        self._coming_soon()

    async def connect(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        self._coming_soon()

    async def publish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        self._coming_soon()

    async def unpublish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        self._coming_soon()

    async def disconnect(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        self._coming_soon()


class TelegramChannelAdapter(ChannelAdapter):
    """Real Telegram bot integration.

    connect   -> validates the bot token with Telegram getMe, stores it encrypted.
    publish   -> registers the webhook pointing at our public webhook endpoint,
                 with a random secret_token that the webhook verifies.
    """

    key = "telegram"

    @staticmethod
    def _credential_id(agent_id: str) -> str:
        return f"ch_telegram_{agent_id}"

    @staticmethod
    async def _api(method: str, token: str, params: Optional[Dict] = None) -> Dict:
        """Thin wrapper over the Telegram Bot API. monkeypatched in tests."""
        url = f"{TELEGRAM_API_BASE}/bot{token}/{method}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, json=params or {})
            resp.raise_for_status()
            return resp.json()

    # Reference for tests that monkeypatch _api and restore afterwards.
    _real_api = _api

    async def _get_me(self, token: str) -> Dict:
        data = await self._api("getMe", token)
        if not data.get("ok"):
            return {"ok": False, "detail": data.get("description", "Invalid bot token."), "bot_username": None}
        user = data.get("result") or {}
        return {"ok": True, "detail": f"Authenticated as @{user.get('username', 'bot')}", "bot_username": user.get("username")}

    async def test(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        token = config.get("bot_token") or self._load_token(workspace_id, agent_id)
        if not token:
            return {"ok": False, "detail": "No bot token configured. Connect the bot first.", "bot_username": None}
        return await self._get_me(token)

    def _load_token(self, workspace_id: str, agent_id: str) -> Optional[str]:
        from app.integrations.credential_store import load_credentials
        creds = load_credentials(workspace_id, self._credential_id(agent_id))
        if creds:
            return creds.get("bot_token")
        return None

    async def connect(self, workspace_id: str, agent_id: str, channel_doc: Dict, config: Dict) -> Dict:
        token = (config or {}).get("bot_token", "").strip()
        if not token:
            raise HTTPException(status_code=400, detail="A Telegram bot token is required to connect.")
        result = await self._get_me(token)
        if not result["ok"]:
            raise HTTPException(status_code=400, detail=result["detail"])

        from app.integrations.credential_store import save_credentials
        save_credentials(workspace_id, self._credential_id(agent_id), {"bot_token": token})
        log_info(f"Telegram bot @{result['bot_username']} connected for agent {agent_id}")
        return {
            "status": STATUS_CONNECTED,
            "bot_username": result["bot_username"],
            "credentials_reference": self._credential_id(agent_id),
            "detail": result["detail"],
        }

    async def publish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        token = self._load_token(workspace_id, agent_id)
        if not token:
            raise HTTPException(status_code=400, detail="Telegram bot is not connected. Connect it before publishing.")

        connection_id = channel_doc.get("id") or f"{agent_id}__telegram"
        secret_token = uuid.uuid4().hex[:24]
        webhook_url = f"{_default_webhook_base()}/api/channels/telegram/webhook/{connection_id}"
        data = await self._api("setWebhook", token, {
            "url": webhook_url,
            "allowed_updates": ["message"],
            "secret_token": secret_token,
            "drop_pending_updates": False,
        })
        if not data.get("ok"):
            log_error(f"Telegram setWebhook failed for agent {agent_id}: {data.get('description')}")
            raise HTTPException(status_code=400, detail=data.get("description", "Telegram rejected the webhook."))
        return {
            "detail": f"Webhook registered: {webhook_url}",
            "webhook_url": webhook_url,
            "secret_token": secret_token,
        }

    async def unpublish(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        token = self._load_token(workspace_id, agent_id)
        if not token:
            return {"detail": "No active webhook to remove."}
        await self._api("deleteWebhook", token, {})
        return {"detail": "Telegram webhook removed."}

    async def disconnect(self, workspace_id: str, agent_id: str, channel_doc: Dict) -> Dict:
        try:
            await self.unpublish(workspace_id, agent_id, channel_doc)
        except Exception as e:
            log_error(f"Telegram disconnect webhook cleanup failed for {agent_id}", exc=e)
        from app.integrations.credential_store import delete_credentials
        delete_credentials(workspace_id, self._credential_id(agent_id))
        return {"detail": "Telegram bot disconnected."}


def get_adapter(channel_type: str) -> ChannelAdapter:
    if channel_type == "web":
        return WebChannelAdapter()
    if channel_type == "telegram":
        return TelegramChannelAdapter()
    return UnsupportedChannelAdapter(channel_type)