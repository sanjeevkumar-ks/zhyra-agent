"""
Channels API
============
Real channel state + lifecycle for an agent, backed by the agent_channels
collection and the channel adapters. No hardcoded statuses, no fake toggles,
no credentials exposed to the browser.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.channels.service import ChannelService
from app.channels.adapters import get_adapter
from app.channels.registry import STATUS_CONNECTED, STATUS_ERROR
from app.utils.logger import log_info, log_error

router = APIRouter()


class ChannelConfigPayload(BaseModel):
    config: dict = {}


class ChannelPublishPayload(BaseModel):
    publish: Optional[bool] = None


def _apply_adapter_result(state: dict, result: dict, config: dict) -> dict:
    """Merges adapter outputs (widget_id, webhook secret, username) into stored state."""
    current_config = dict(state.get("config") or {})
    for k, v in (result or {}).items():
        if k in ("detail",):
            continue
        if k == "bot_username":
            state["telegram_bot_username"] = v
        elif k in ("widget_id", "telegram_bot_username", "credentials_reference"):
            state[k] = v
        elif k in ("secret_token", "webhook_url"):
            current_config[k] = v
    state["config"] = current_config
    return state


@router.get("/{agent_id}/channels")
async def list_agent_channels(
    agent_id: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Returns the full channel registry state for an agent (real, from DB)."""
    channels = await ChannelService.list_channels(workspace_id, agent_id)
    return {
        "agent_id": agent_id,
        "workspace_id": workspace_id,
        "channels": channels,
        "count": {
            "total": len(channels),
            "supported": sum(1 for c in channels if c["supported"]),
            "connected": sum(1 for c in channels if c["status"] in (STATUS_CONNECTED, STATUS_ERROR)),
            "published": sum(1 for c in channels if c["published"]),
        },
    }


@router.get("/{agent_id}/channels/{channel_type}")
async def get_agent_channel(
    agent_id: str,
    channel_type: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    return await ChannelService.get_channel(workspace_id, agent_id, channel_type)


@router.put("/{agent_id}/channels/{channel_type}")
async def update_agent_channel_config(
    agent_id: str,
    channel_type: str,
    payload: ChannelConfigPayload,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Saves public channel config (allowed domains, colors, welcome message)."""
    return await ChannelService.update_config(workspace_id, agent_id, channel_type, payload.config or {})


@router.post("/{agent_id}/channels/{channel_type}/connect")
async def connect_agent_channel(
    agent_id: str,
    channel_type: str,
    payload: ChannelConfigPayload,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Validates + connects a channel. Telegram validates the bot token via getMe."""
    adapter = get_adapter(channel_type)
    config = payload.config or {}
    channel_doc = await ChannelService.get_full_state(workspace_id, agent_id, channel_type)

    # Persist safe config first so publish uses it
    if config:
        await ChannelService.update_config(workspace_id, agent_id, channel_type, config)
        channel_doc = await ChannelService.get_full_state(workspace_id, agent_id, channel_type)

    try:
        result = await adapter.connect(workspace_id, agent_id, channel_doc, config)
    except HTTPException:
        raise
    except Exception as e:
        log_error(f"Channel connect failed for {agent_id}/{channel_type}", exc=e)
        await ChannelService.set_error(workspace_id, agent_id, channel_type, str(e))
        raise HTTPException(status_code=400, detail=str(e))

    state = _apply_adapter_result(channel_doc, result, config)
    state = await ChannelService.transition(
        workspace_id, agent_id, channel_type,
        result.get("status", STATUS_CONNECTED),
        widget_id=state.get("widget_id"),
        telegram_bot_username=state.get("telegram_bot_username"),
        credentials_reference=state.get("credentials_reference"),
        config=state.get("config"),
        error_message=None,
    )
    log_info(f"Channel {channel_type} connected for agent {agent_id}")
    return await ChannelService.get_channel(workspace_id, agent_id, channel_type)


@router.post("/{agent_id}/channels/{channel_type}/test")
async def test_agent_channel(
    agent_id: str,
    channel_type: str,
    payload: ChannelConfigPayload,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Runs a real connectivity test (Telegram getMe, widget readiness)."""
    adapter = get_adapter(channel_type)
    config = payload.config or {}
    channel_doc = await ChannelService.get_full_state(workspace_id, agent_id, channel_type)
    try:
        result = await adapter.test(workspace_id, agent_id, channel_doc, config)
    except Exception as e:
        log_error(f"Channel test failed for {agent_id}/{channel_type}", exc=e)
        await ChannelService.mark_test_result(workspace_id, agent_id, channel_type, False, str(e))
        return {"ok": False, "detail": str(e)}

    await ChannelService.mark_test_result(workspace_id, agent_id, channel_type, bool(result.get("ok")), result.get("detail", ""))
    return {"ok": bool(result.get("ok")), "detail": result.get("detail")}


@router.post("/{agent_id}/channels/{channel_type}/publish")
async def publish_agent_channel(
    agent_id: str,
    channel_type: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Publishes a channel: web -> generate widget_id; telegram -> register webhook."""
    adapter = get_adapter(channel_type)
    channel_doc = await ChannelService.get_full_state(workspace_id, agent_id, channel_type)

    if channel_doc.get("status") not in (STATUS_CONNECTED, STATUS_ERROR):
        raise HTTPException(status_code=400, detail="Connect the channel before publishing.")
    if channel_type != "web" and not channel_doc.get("credentials_reference"):
        raise HTTPException(status_code=400, detail="Channel credentials are missing.")

    try:
        result = await adapter.publish(workspace_id, agent_id, channel_doc)
    except HTTPException:
        raise
    except Exception as e:
        log_error(f"Channel publish failed for {agent_id}/{channel_type}", exc=e)
        await ChannelService.set_error(workspace_id, agent_id, channel_type, str(e))
        raise HTTPException(status_code=400, detail=str(e))

    state = _apply_adapter_result(channel_doc, result, {})
    state = await ChannelService.transition(
        workspace_id, agent_id, channel_type,
        channel_doc.get("status", STATUS_CONNECTED),
        widget_id=state.get("widget_id"),
        telegram_bot_username=state.get("telegram_bot_username"),
        config=state.get("config"),
        error_message=None,
    )
    await ChannelService.set_published(workspace_id, agent_id, channel_type, True)
    log_info(f"Channel {channel_type} published for agent {agent_id} (widget_id={state.get('widget_id')})")
    return await ChannelService.get_channel(workspace_id, agent_id, channel_type)


@router.post("/{agent_id}/channels/{channel_type}/unpublish")
async def unpublish_agent_channel(
    agent_id: str,
    channel_type: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    adapter = get_adapter(channel_type)
    channel_doc = await ChannelService.get_full_state(workspace_id, agent_id, channel_type)
    try:
        await adapter.unpublish(workspace_id, agent_id, channel_doc)
    except Exception as e:
        log_error(f"Channel unpublish failed for {agent_id}/{channel_type}", exc=e)
    await ChannelService.set_published(workspace_id, agent_id, channel_type, False)
    return await ChannelService.get_channel(workspace_id, agent_id, channel_type)


@router.post("/{agent_id}/channels/{channel_type}/disconnect")
async def disconnect_agent_channel(
    agent_id: str,
    channel_type: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Removes credentials + resets the channel to not_configured (no fake states)."""
    adapter = get_adapter(channel_type)
    channel_doc = await ChannelService.get_full_state(workspace_id, agent_id, channel_type)
    try:
        await adapter.disconnect(workspace_id, agent_id, channel_doc)
    except Exception as e:
        log_error(f"Channel disconnect failed for {agent_id}/{channel_type}", exc=e)
    await ChannelService.reset(workspace_id, agent_id, channel_type)
    log_info(f"Channel {channel_type} disconnected for agent {agent_id}")
    return await ChannelService.get_channel(workspace_id, agent_id, channel_type)