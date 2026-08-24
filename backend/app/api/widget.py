"""
Embeddable Widget API (public)
==============================
Public, unauthenticated namespace for the web chat widget.

The widget loads with only a widget_id. Every request is validated server-side:
  - widget_id resolves to a published deployment (workspace + agent)
  - origin must match the deployment's domain allowlist
  - messages are rate-limited per session
  - no agent secrets, tool arguments, or internal errors are returned

All traffic flows through the single AgentRuntime / action-gate stack.
"""

import time
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Header, Request, Response
from app.database.firestore import firestore_client
from app.ai.runtime.agent_runtime import AgentRuntime
from app.services.widget_service import (
    WidgetService,
    WIDGET_SESSIONS,
    validate_domain_allowlist,
)
from app.services.analytics_service import AnalyticsService
from app.utils.logger import log_info, log_error

router = APIRouter()


def _cors_headers(request: Request, response: Response):
    origin = request.headers.get("origin") or ""
    response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"


@router.get("/health")
async def widget_health():
    """Health check endpoint for widget backend."""
    return {"status": "ok"}


@router.post("/init")
async def init_widget_session(payload: dict, request: Request, response: Response):
    """Initializes a public widget session from a widget_id (production flow)."""
    _cors_headers(request, response)
    widget_id = payload.get("widget_id") or payload.get("widgetId")
    origin = request.headers.get("origin") or payload.get("origin") or ""
    client_ip = request.client.host if request.client else ""

    session = await WidgetService.create_session(
        widget_id=widget_id,
        origin=origin,
        page_url=payload.get("page_url", ""),
        page_title=payload.get("page_title", ""),
        client_ip=client_ip,
    )

    return {
        "session_token": session["session_id"],
        "conversation_id": session["conversation_id"],
        "widget_id": widget_id,
        "agent": WidgetService.agent_meta(session["agent_id"]),
        "widget_version": 2,
    }


@router.post("/session")
@router.post("/chat/session")
async def create_widget_session(payload: dict, request: Request, response: Response):
    """Legacy-compatible session init. Prefers widget_id; falls back to agent_id+workspace_id."""
    _cors_headers(request, response)
    widget_id = payload.get("widget_id") or payload.get("widgetId")

    if widget_id:
        origin = request.headers.get("origin") or payload.get("origin") or ""
        client_ip = request.client.host if request.client else ""
        session = await WidgetService.create_session(
            widget_id=widget_id,
            origin=origin,
            page_url=payload.get("page_url", ""),
            page_title=payload.get("page_title", ""),
            client_ip=client_ip,
        )
        return {
            "session_id": session["session_id"],
            "session_token": session["session_id"],
            "conversation_id": session["conversation_id"],
            "widget_id": widget_id,
            "agent": {
                **WidgetService.agent_meta(session["agent_id"]),
                "primary_color": "#2F6BFF",
            },
        }

    # --- Legacy flow: agent_id + workspace_id from embed attributes ---
    agent_id = payload.get("agent_id") or payload.get("agentId")
    workspace_id = payload.get("workspace_id") or payload.get("workspaceId")
    if not agent_id or not workspace_id:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "MISSING_PARAMS", "message": "Missing data-widget-id (or data-agent-id + data-workspace-id)."}},
        )

    origin = request.headers.get("origin") or payload.get("origin") or ""
    agent_ref = firestore_client.collection("agents").document(agent_id)
    agent_snap = agent_ref.get()
    if not agent_snap.exists:
        raise HTTPException(status_code=404, detail={"error": {"code": "INVALID_AGENT", "message": f"Agent '{agent_id}' not found."}})
    agent = agent_snap.to_dict()
    if agent.get("workspace_id") != workspace_id:
        raise HTTPException(status_code=403, detail={"error": {"code": "INVALID_WORKSPACE", "message": "Agent does not belong to specified workspace."}})

    widget_config = agent.get("widget_config") or {}
    if widget_config.get("enabled") is False:
        raise HTTPException(status_code=403, detail={"error": {"code": "WIDGET_DISABLED", "message": "This AI assistant is currently unavailable."}})

    allowed_domains = widget_config.get("allowed_domains", [])
    if not validate_domain_allowlist(origin, allowed_domains):
        log_error(f"Widget access blocked for origin '{origin}' on agent '{agent_id}'")
        raise HTTPException(status_code=403, detail={"error": {"code": "WIDGET_DOMAIN_NOT_ALLOWED", "message": f"This website ({origin}) is not authorized to use this Zhyra agent."}})

    session_id = f"wses_{uuid.uuid4().hex[:12]}"
    convo_id = f"con_wgt_{uuid.uuid4().hex[:10]}"
    now = time.time()
    session_data = {
        "session_id": session_id,
        "conversation_id": convo_id,
        "workspace_id": workspace_id,
        "agent_id": agent_id,
        "origin": origin,
        "page_url": payload.get("page_url", ""),
        "page_title": payload.get("page_title", ""),
        "created_at": now,
        "expires_at": now + (86400 * 7),
    }
    WIDGET_SESSIONS[session_id] = session_data
    try:
        firestore_client.collection("widget_sessions").document(session_id).set(session_data)
        welcome = agent.get("welcome_message") or f"Hi! I'm {agent.get('name', 'your AI employee')}. How can I help you today?"
        convo_doc = {
            "id": convo_id,
            "workspace_id": workspace_id,
            "agent_id": agent_id,
            "agent_name": agent.get("name", "AI Agent"),
            "customer": payload.get("page_title") or "Website Visitor",
            "channel": "web_widget",
            "status": "active",
            "messages": [{"id": "msg_wgt_welcome", "sender_type": "agent", "text": welcome, "time": time.strftime("%H:%M")}],
            "created_at": now,
            "updated_at": now,
        }
        firestore_client.collection("conversations").document(convo_id).set(convo_doc)
        AnalyticsService.record_event(
            workspace_id=workspace_id,
            event_type="widget_session_started",
            agent_id=agent_id,
            conversation_id=convo_id,
            metadata={"origin": origin},
        )
    except Exception as e:
        log_error("Failed to persist widget session", exc=e)

    return {
        "session_id": session_id,
        "session_token": session_id,
        "conversation_id": convo_id,
        "agent": {
            "id": agent_id,
            "name": agent.get("name", "AI Employee"),
            "role": agent.get("role", "AI Assistant"),
            "avatar": agent.get("avatar", ""),
            "welcome_message": agent.get("welcome_message") or f"Hi! I'm {agent.get('name', 'your AI employee')}. How can I help you today?",
            "primary_color": widget_config.get("primary_color", "#2F6BFF"),
        },
    }


def _extract_session_token(payload: dict, authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization.split("Bearer ")[1].strip()
    return payload.get("session_token")


@router.get("/{widget_id}/config")
@router.post("/{widget_id}/config")
async def get_widget_public_config(widget_id: str, request: Request, response: Response):
    """Returns the public deployment configuration for a widget_id."""
    _cors_headers(request, response)
    deployment = await WidgetService.resolve_deployment(widget_id)
    agent = WidgetService._get_agent(deployment.get("agent_id")) or {}
    config = deployment.get("config") or {}
    return {
        "widget_id": widget_id,
        "agent_id": deployment.get("agent_id"),
        "workspace_id": deployment.get("workspace_id"),
        "agent": {
            "id": deployment.get("agent_id"),
            "name": agent.get("name", "AI Employee"),
            "role": agent.get("role", "AI Assistant"),
            "avatar": agent.get("avatar", ""),
            "welcome_message": config.get("welcome_message") or agent.get("welcome_message") or f"Hi! I'm {agent.get('name', 'your AI employee')}. How can I help you today?",
            "primary_color": config.get("primary_color", "#2F6BFF"),
        },
        "allowed_domains": config.get("allowed_domains", []),
    }


@router.post("/{widget_id}/session")
async def create_widget_session_by_id(widget_id: str, payload: Optional[dict], request: Request, response: Response):
    """Creates a widget session for a given widget_id parameter in path."""
    _cors_headers(request, response)
    body = payload or {}
    origin = request.headers.get("origin") or body.get("origin") or ""
    client_ip = request.client.host if request.client else ""
    session = await WidgetService.create_session(
        widget_id=widget_id,
        origin=origin,
        page_url=body.get("page_url", ""),
        page_title=body.get("page_title", ""),
        client_ip=client_ip,
    )
    return {
        "session_id": session["session_id"],
        "session_token": session["session_id"],
        "conversation_id": session["conversation_id"],
        "widget_id": widget_id,
        "agent": WidgetService.agent_meta(session["agent_id"]),
    }


@router.post("/{widget_id}/test")
async def widget_health_test(widget_id: str, request: Request, response: Response):
    """Zero-cost public health test for a deployed widget."""
    _cors_headers(request, response)
    try:
        return await WidgetService.health_test(widget_id)
    except HTTPException as e:
        response.status_code = e.status_code
        return {"ok": False, "detail": e.detail}


@router.post("/message")
@router.post("/chat")
async def send_widget_message(payload: dict, request: Request, response: Response,
                              authorization: Optional[str] = Header(None)):
    """Processes a user message through the real AgentRuntime."""
    _cors_headers(request, response)
    session_token = _extract_session_token(payload, authorization)
    session = WidgetService.get_session(session_token)
    if not session:
        raise HTTPException(status_code=401, detail={"error": {"code": "SESSION_EXPIRED", "message": "Widget session expired or invalid."}})

    user_text = payload.get("message", "").strip()
    if not user_text:
        raise HTTPException(status_code=400, detail={"error": {"code": "EMPTY_MESSAGE", "message": "Message text is required."}})

    WidgetService.assert_message_allowed(session["session_id"])

    workspace_id = session["workspace_id"]
    agent_id = session["agent_id"]
    convo_id = session["conversation_id"]

    # 1. Load current conversation history
    history = []
    convo_ref = firestore_client.collection("conversations").document(convo_id)
    try:
        snap = convo_ref.get()
        if snap.exists:
            existing_msgs = snap.to_dict().get("messages", [])
            history = [{"sender": m.get("sender_type", "user"), "text": m.get("text", "")} for m in existing_msgs]
    except Exception as e:
        log_error("Failed to read conversation history for widget", exc=e)

    # 2. Append user message to Firestore
    user_msg_doc = {"id": f"msg_wgt_{uuid.uuid4().hex[:8]}", "sender_type": "customer", "text": user_text, "time": time.strftime("%H:%M")}
    try:
        snap = convo_ref.get()
        curr_msgs = snap.to_dict().get("messages", []) if (snap and snap.exists) else []
        convo_ref.update({"messages": curr_msgs + [user_msg_doc], "preview": user_text[:60], "updated_at": time.time()})
        AnalyticsService.record_event(
            workspace_id=workspace_id, event_type="user_message", agent_id=agent_id,
            conversation_id=convo_id, metadata={"text": user_text},
        )
    except Exception as e:
        log_error("Failed to log user message in widget conversation", exc=e)

    # 3. Execute the real AgentRuntime
    try:
        agent_reply = await AgentRuntime.execute(
            workspace_id=workspace_id,
            agent_id=agent_id,
            query=user_text,
            history=history,
            conversation_id=convo_id,
            user_id="widget_user",
        )
        reply_text = agent_reply.get("text") or agent_reply.get("message") or "I completed your request."
        blocks = agent_reply.get("blocks", [])
        actions = agent_reply.get("actions", [])

        agent_msg_doc = {
            "id": f"msg_wgt_{uuid.uuid4().hex[:8]}",
            "sender_type": "agent",
            "text": reply_text,
            "blocks": blocks,
            "actions": actions,
            "time": time.strftime("%H:%M"),
        }
        try:
            snap2 = convo_ref.get()
            curr_msgs2 = snap2.to_dict().get("messages", []) if (snap2 and snap2.exists) else []
            convo_ref.update({"messages": curr_msgs2 + [agent_msg_doc], "preview": reply_text[:60], "updated_at": time.time()})
        except Exception as ex:
            log_error("Failed to append agent reply to Firestore", exc=ex)

        AnalyticsService.record_event(
            workspace_id=workspace_id, event_type="agent_message", agent_id=agent_id,
            conversation_id=convo_id, metadata={"text": reply_text},
        )

        if agent_reply.get("terminal_state") == "FAILED" or agent_reply.get("status") == "error":
            raise HTTPException(
                status_code=503,
                detail={"error": {"code": agent_reply.get("error_code", "PROVIDER_ERROR"), "message": reply_text}}
            )

        return {
            "success": True,
            "message": reply_text,
            "blocks": blocks,
            "actions": actions,
            "status": agent_reply.get("status", "active"),
            "terminal_state": agent_reply.get("terminal_state", "COMPLETED"),
        }
    except Exception as e:
        log_error(f"Widget AgentRuntime execution error: {e}", exc=e)
        err_msg = "I encountered an issue processing your request. Please try again."
        return {"success": False, "message": err_msg, "blocks": [], "actions": [], "status": "error", "terminal_state": "FAILED"}


@router.post("/feedback")
async def record_widget_feedback(payload: dict, authorization: Optional[str] = Header(None)):
    """Logs customer feedback for a widget conversation."""
    session = WidgetService.get_session(_extract_session_token(payload, authorization))
    if session:
        AnalyticsService.record_event(
            workspace_id=session["workspace_id"],
            event_type="feedback_received",
            agent_id=session["agent_id"],
            conversation_id=session["conversation_id"],
            metadata={"rating": payload.get("rating", 5), "comment": payload.get("comment", "")},
        )
    return {"success": True}


@router.post("/end-session")
async def end_widget_session(payload: dict, authorization: Optional[str] = Header(None)):
    """Ends a widget session and records conversation_completed."""
    session = WidgetService.get_session(_extract_session_token(payload, authorization))
    if session:
        AnalyticsService.record_event(
            workspace_id=session["workspace_id"],
            event_type="conversation_completed",
            agent_id=session["agent_id"],
            conversation_id=session["conversation_id"],
        )
        try:
            firestore_client.collection("conversations").document(session["conversation_id"]).update({"status": "completed"})
        except Exception:
            pass
    return {"success": True}