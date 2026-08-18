import time
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Header, Request, Response, status
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from app.ai.runtime.agent_runtime import AgentRuntime
from app.services.analytics_service import AnalyticsService

router = APIRouter()

# In-memory widget session store (cached for fast validation)
WIDGET_SESSIONS: Dict[str, dict] = {}

def validate_domain_allowlist(origin: str, allowed_domains: List[str]) -> bool:
    """Validates request origin against allowed domains list."""
    if not origin:
        return True
    
    origin_clean = origin.lower().strip()
    
    # Always allow local dev environments and Zhyra domains
    if any(loc in origin_clean for loc in ["localhost", "127.0.0.1", "zhyra.web.app", "zhyra-e0d80.web.app", "vercel.app"]):
        return True
        
    if not allowed_domains or "*" in allowed_domains:
        return True

    for domain in allowed_domains:
        d_clean = domain.lower().strip()
        if d_clean == origin_clean:
            return True
        if d_clean.startswith("*.") and origin_clean.endswith(d_clean[1:]):
            return True
        if f"https://{d_clean}" == origin_clean or f"http://{d_clean}" == origin_clean:
            return True

    return False

@router.options("/{path:path}")
async def widget_cors_preflight(request: Request, response: Response):
    """Dynamically handles CORS preflight request for third-party websites."""
    origin = request.headers.get("origin", "*")
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"
    response.headers["Access-Control-Max-Age"] = "86400"
    return Response(status_code=204)

@router.get("/health")
async def widget_health():
    """Health check endpoint for widget backend."""
    return {"status": "ok"}

@router.post("/session")
@router.post("/chat/session")
async def create_widget_session(payload: dict, request: Request, response: Response):
    """Initializes a new public widget session after origin allowlist and agent validation."""
    origin = request.headers.get("origin") or payload.get("origin") or ""
    response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"

    agent_id = payload.get("agent_id") or payload.get("agentId")
    workspace_id = payload.get("workspace_id") or payload.get("workspaceId")

    if not agent_id or not workspace_id:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "MISSING_PARAMS", "message": "Zhyra Widget: Missing data-agent-id or data-workspace-id."}}
        )

    # 1. Fetch Agent data
    agent_ref = firestore_client.collection("agents").document(agent_id)
    agent_snap = agent_ref.get()
    if not agent_snap.exists:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "INVALID_AGENT", "message": f"Agent '{agent_id}' not found."}}
        )
    agent = agent_snap.to_dict()

    if agent.get("workspace_id") != workspace_id:
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "INVALID_WORKSPACE", "message": "Agent does not belong to specified workspace."}}
        )

    # 2. Check Widget Enabled State
    widget_config = agent.get("widget_config", {})
    if widget_config.get("enabled") is False:
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "WIDGET_DISABLED", "message": "This AI assistant is currently unavailable."}}
        )

    # 3. Domain Allowlist Check
    allowed_domains = widget_config.get("allowed_domains", [])
    if not validate_domain_allowlist(origin, allowed_domains):
        log_error(f"Widget access blocked for origin '{origin}' on agent '{agent_id}'")
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "WIDGET_DOMAIN_NOT_ALLOWED", "message": f"This website ({origin}) is not authorized to use this Zhyra agent."}}
        )

    # 4. Generate Widget Session
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
        "expires_at": now + (86400 * 7)  # 7 days valid
    }

    # Store in memory cache + Firestore
    WIDGET_SESSIONS[session_id] = session_data
    try:
        firestore_client.collection("widget_sessions").document(session_id).set(session_data)
        # Create initial conversation record in Firestore so it appears in dashboard
        convo_doc = {
            "id": convo_id,
            "workspace_id": workspace_id,
            "agent_id": agent_id,
            "agent_name": agent.get("name", "AI Agent"),
            "customer": payload.get("page_title") or "Website Visitor",
            "channel": "web_widget",
            "status": "active",
            "messages": [
                {
                    "id": f"msg_wgt_welcome",
                    "sender_type": "agent",
                    "text": agent.get("welcome_message") or f"Hi! I'm {agent.get('name', 'your AI employee')}. How can I help you today?",
                    "time": time.strftime("%H:%M")
                }
            ],
            "created_at": now,
            "updated_at": now
        }
        firestore_client.collection("conversations").document(convo_id).set(convo_doc)
        
        # Record analytics
        AnalyticsService.record_event(
            workspace_id=workspace_id,
            event_type="widget_session_started",
            agent_id=agent_id,
            conversation_id=convo_id,
            metadata={"origin": origin}
        )
    except Exception as e:
        log_error("Failed to persist widget session", exc=e)

    log_info(f"Widget session initialized: {session_id} for agent {agent_id} on {origin}")

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
            "primary_color": widget_config.get("primary_color", "#2F6BFF")
        }
    }

@router.post("/message")
@router.post("/chat")
async def send_widget_message(
    payload: dict,
    request: Request,
    response: Response,
    authorization: Optional[str] = Header(None)
):
    """Processes user message through the real AgentRuntime and returns agent reply."""
    origin = request.headers.get("origin") or payload.get("origin") or ""
    response.headers["Access-Control-Allow-Origin"] = origin if origin else "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"

    # Extract session token from header or payload
    session_token = None
    if authorization and authorization.startswith("Bearer "):
        session_token = authorization.split("Bearer ")[1].strip()
    elif payload.get("session_token"):
        session_token = payload.get("session_token")

    if not session_token:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "Widget session token missing."}})

    # Retrieve session
    session = WIDGET_SESSIONS.get(session_token)
    if not session:
        try:
            snap = firestore_client.collection("widget_sessions").document(session_token).get()
            if snap.exists:
                session = snap.to_dict()
                WIDGET_SESSIONS[session_token] = session
        except Exception:
            pass

    if not session:
        raise HTTPException(status_code=401, detail={"error": {"code": "SESSION_EXPIRED", "message": "Widget session expired or invalid."}})

    user_text = payload.get("message", "").strip()
    if not user_text:
        raise HTTPException(status_code=400, detail={"error": {"code": "EMPTY_MESSAGE", "message": "Message text is required."}})

    workspace_id = session["workspace_id"]
    agent_id = session["agent_id"]
    convo_id = session["conversation_id"]

    # 1. Fetch current conversation history
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
    user_msg_doc = {
        "id": f"msg_wgt_{uuid.uuid4().hex[:8]}",
        "sender_type": "customer",
        "text": user_text,
        "time": time.strftime("%H:%M")
    }
    try:
        snap = convo_ref.get()
        curr_msgs = snap.to_dict().get("messages", []) if (snap and snap.exists) else []
        convo_ref.update({
            "messages": curr_msgs + [user_msg_doc],
            "preview": user_text[:60],
            "updated_at": time.time()
        })
        AnalyticsService.record_event(
            workspace_id=workspace_id,
            event_type="user_message",
            agent_id=agent_id,
            conversation_id=convo_id,
            metadata={"text": user_text}
        )
    except Exception as e:
        log_error("Failed to log user message in widget conversation", exc=e)

    # 3. Execute Real AgentRuntime Engine
    try:
        agent_reply = await AgentRuntime.execute(
            workspace_id=workspace_id,
            agent_id=agent_id,
            query=user_text,
            history=history,
            conversation_id=convo_id,
            user_id="widget_user"
        )

        reply_text = agent_reply.get("text") or agent_reply.get("message") or "I completed your request."
        blocks = agent_reply.get("blocks", [])
        actions = agent_reply.get("actions", [])

        # 4. Append Agent reply to Firestore
        agent_msg_doc = {
            "id": f"msg_wgt_{uuid.uuid4().hex[:8]}",
            "sender_type": "agent",
            "text": reply_text,
            "blocks": blocks,
            "actions": actions,
            "time": time.strftime("%H:%M")
        }
        try:
            snap2 = convo_ref.get()
            curr_msgs2 = snap2.to_dict().get("messages", []) if (snap2 and snap2.exists) else []
            convo_ref.update({
                "messages": curr_msgs2 + [agent_msg_doc],
                "preview": reply_text[:60],
                "updated_at": time.time()
            })
        except Exception as ex:
            log_error("Failed to append agent reply to Firestore", exc=ex)

        AnalyticsService.record_event(
            workspace_id=workspace_id,
            event_type="agent_message",
            agent_id=agent_id,
            conversation_id=convo_id,
            metadata={"text": reply_text}
        )

        return {
            "success": True,
            "message": reply_text,
            "blocks": blocks,
            "actions": actions,
            "status": agent_reply.get("status", "active")
        }

    except Exception as e:
        log_error(f"Widget AgentRuntime execution error: {e}", exc=e)
        err_msg = f"I encountered an issue processing your request: {str(e)}"
        return {
            "success": False,
            "message": err_msg,
            "blocks": [{"type": "text", "data": {"text": err_msg}}],
            "actions": [],
            "status": "error"
        }

@router.post("/feedback")
async def record_widget_feedback(payload: dict, authorization: Optional[str] = Header(None)):
    """Logs customer feedback for widget conversation."""
    session_token = payload.get("session_token")
    if not session_token and authorization and authorization.startswith("Bearer "):
        session_token = authorization.split("Bearer ")[1].strip()

    session = WIDGET_SESSIONS.get(session_token) if session_token else None
    if session:
        rating = payload.get("rating", 5)
        AnalyticsService.record_event(
            workspace_id=session["workspace_id"],
            event_type="feedback_received",
            agent_id=session["agent_id"],
            conversation_id=session["conversation_id"],
            metadata={"rating": rating, "comment": payload.get("comment", "")}
        )
    return {"success": True}

@router.post("/end-session")
async def end_widget_session(payload: dict, authorization: Optional[str] = Header(None)):
    """Ends widget session and records conversation_completed."""
    session_token = payload.get("session_token")
    if not session_token and authorization and authorization.startswith("Bearer "):
        session_token = authorization.split("Bearer ")[1].strip()

    session = WIDGET_SESSIONS.get(session_token) if session_token else None
    if session:
        AnalyticsService.record_event(
            workspace_id=session["workspace_id"],
            event_type="conversation_completed",
            agent_id=session["agent_id"],
            conversation_id=session["conversation_id"]
        )
        try:
            firestore_client.collection("conversations").document(session["conversation_id"]).update({"status": "completed"})
        except Exception:
            pass
    return {"success": True}
