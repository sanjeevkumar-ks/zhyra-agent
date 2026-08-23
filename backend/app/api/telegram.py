"""
Telegram Channel Webhook
========================
Receives Telegram updates for published bot deployments and routes them through
the SAME AgentRuntime used by every other channel.

Security:
  - each deployment registers its webhook with a random secret_token
  - the webhook verifies X-Telegram-Bot-Api-Secret-Token before processing
  - the connection must exist, belong to a real workspace, and be published
  - bot tokens are only read from the encrypted credential store
"""

from typing import Optional
from fastapi import APIRouter, Request
from app.database.firestore import firestore_client
from app.channels.service import ChannelService
from app.channels.adapters import TelegramChannelAdapter
from app.services.conversation_service import ConversationService
from app.ai.runtime.agent_runtime import AgentRuntime
from app.utils.logger import log_info, log_error

router = APIRouter()


async def _load_bot_token(workspace_id: str, agent_id: str) -> Optional[str]:
    from app.integrations.credential_store import load_credentials
    creds = load_credentials(workspace_id, TelegramChannelAdapter._credential_id(agent_id))
    if creds:
        return creds.get("bot_token")
    return None


async def _resolve_or_create_conversation(workspace_id: str, agent_id: str, agent_name: str,
                                          telegram_chat_id, customer: str) -> str:
    """Reuses a Telegram conversation for the same chat, or creates a new one."""
    try:
        for doc in firestore_client.collection("conversations").stream():
            data = doc.to_dict()
            if (data.get("workspace_id") == workspace_id
                    and data.get("agent_id") == agent_id
                    and str(data.get("telegram_chat_id")) == str(telegram_chat_id)):
                return data.get("id")
    except Exception as e:
        log_error("Failed to lookup telegram conversation", exc=e)

    convo = await ConversationService.create_conversation(
        workspace_id=workspace_id,
        agent_id=agent_id,
        customer=customer or "Telegram User",
        channel="Telegram",
    )
    try:
        firestore_client.collection("conversations").document(convo["id"]).update({"telegram_chat_id": str(telegram_chat_id)})
    except Exception as e:
        log_error("Failed to stamp telegram_chat_id on conversation", exc=e)
    return convo["id"]


@router.post("/telegram/webhook/{connection_id}")
async def telegram_webhook(connection_id: str, payload: dict, request: Request):
    connection = await ChannelService.resolve_telegram_connection(connection_id)
    if not connection or connection.get("channel_type") != "telegram":
        return {"ok": False}

    # Verify the deployment's secret token
    secret_token = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
    stored_secret = (connection.get("config") or {}).get("secret_token")
    if stored_secret and secret_token != stored_secret:
        return {"ok": False}

    # Ignore updates while the bot is not published
    if not connection.get("published"):
        return {"ok": True}

    workspace_id = connection.get("workspace_id")
    agent_id = connection.get("agent_id")

    message = payload.get("message") or payload.get("edited_message") or {}
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not text or chat_id is None:
        return {"ok": True}

    from_user = message.get("from") or {}
    first = from_user.get("first_name") or ""
    last = from_user.get("last_name") or ""
    customer = f"{first} {last}".strip() or from_user.get("username") or "Telegram User"
    user_id = f"tg_{chat_id}"

    log_info(f"Telegram update received for connection {connection_id}: chat={chat_id} text='{text[:60]}'")

    try:
        convo_id = await _resolve_or_create_conversation(workspace_id, agent_id, connection.get("agent_id", ""), chat_id, customer)
        history = []
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        snap = convo_ref.get()
        if snap.exists:
            history = [{"sender": m.get("sender_type", "user"), "text": m.get("text", "")} for m in snap.to_dict().get("messages", [])]

        user_msg = {"id": f"msg_tg_{uuid4hex()}", "sender_type": "customer", "text": text, "time": hm()}
        curr = snap.to_dict().get("messages", []) if (snap and snap.exists) else []
        convo_ref.update({"messages": curr + [user_msg], "preview": text[:60]})

        agent_reply = await AgentRuntime.execute(
            workspace_id=workspace_id,
            agent_id=agent_id,
            query=text,
            history=history,
            conversation_id=convo_id,
            user_id=user_id,
        )
        reply_text = agent_reply.get("text") or "I completed your request."
        if len(reply_text) > 4096:
            reply_text = reply_text[:4093] + "..."

        token = await _load_bot_token(workspace_id, agent_id)
        if token:
            await TelegramChannelAdapter._api("sendMessage", token, {"chat_id": chat_id, "text": reply_text})

        snap2 = convo_ref.get()
        curr2 = snap2.to_dict().get("messages", []) if (snap2 and snap2.exists) else []
        agent_msg = {"id": f"msg_tg_{uuid4hex()}", "sender_type": "agent", "text": reply_text, "time": hm()}
        convo_ref.update({"messages": curr2 + [agent_msg], "preview": reply_text[:60]})
    except Exception as e:
        log_error(f"Telegram webhook processing failed for connection {connection_id}", exc=e)

    return {"ok": True}


def uuid4hex() -> str:
    import uuid
    return uuid.uuid4().hex[:8]


def hm() -> str:
    import time
    return time.strftime("%H:%M")