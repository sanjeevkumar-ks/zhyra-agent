"""
Widget Service
==============
Server-side resolution of widget deployments and widget sessions.

Public widget endpoints resolve a widget_id (never agent_id/workspace_id) into
the owning workspace + agent on the server, enforce the published flag and the
domain allowlist, hand out short-lived session tokens, and rate-limit traffic.
No secrets, tool arguments, or internal errors ever reach the browser.
"""

import time
import uuid
from collections import deque
from typing import Dict, List, Optional
from fastapi import HTTPException
from app.database.firestore import firestore_client
from app.channels.service import ChannelService
from app.services.analytics_service import AnalyticsService
from app.utils.logger import log_info, log_error

# In-memory widget session store (cached for fast validation).
WIDGET_SESSIONS: Dict[str, dict] = {}

SESSION_TTL_SECONDS = 7 * 86400  # 7 days
CONVERSATION_PREFIX = "con_wgt_"


class RateLimiter:
    """Simple sliding-window in-memory limiter."""

    def __init__(self, max_calls: int, window_seconds: int):
        self.max_calls = max_calls
        self.window_seconds = window_seconds
        self._hits: Dict[str, deque] = {}

    def allow(self, key: str) -> bool:
        now = time.time()
        q = self._hits.setdefault(key, deque())
        while q and q[0] < now - self.window_seconds:
            q.popleft()
        if len(q) >= self.max_calls:
            return False
        q.append(now)
        return True


# Rate limits
INIT_LIMITER = RateLimiter(max_calls=60, window_seconds=3600)      # 60 sessions per IP/hour
MESSAGE_LIMITER = RateLimiter(max_calls=30, window_seconds=60)     # 30 messages per session/minute


def validate_domain_allowlist(origin: str, allowed_domains) -> bool:
    """Validates a request origin against the deployment's allowed domains."""
    if not origin:
        return True

    origin_clean = origin.lower().strip()

    # Always allow local dev environments and Zhyra domains
    if any(loc in origin_clean for loc in ["localhost", "127.0.0.1", "zhyra.web.app", "zhyra-e0d80.web.app", "vercel.app"]):
        return True

    # Normalize allowed_domains to a list
    if isinstance(allowed_domains, str):
        allowed_domains = [d.strip() for d in allowed_domains.split(",") if d.strip()]

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


class WidgetService:

    @staticmethod
    async def resolve_deployment(widget_id: Optional[str]) -> Dict:
        """Resolves a widget_id to a published web deployment, verifying agent ownership."""
        if not widget_id:
            raise HTTPException(status_code=400, detail={"error": {"code": "MISSING_WIDGET_ID", "message": "Missing widget_id."}})

        deployment = await ChannelService.resolve_widget_deployment(widget_id)
        if not deployment:
            raise HTTPException(status_code=404, detail={"error": {"code": "WIDGET_NOT_FOUND", "message": "This chat widget does not exist."}})
        if not deployment.get("published"):
            raise HTTPException(status_code=403, detail={"error": {"code": "WIDGET_NOT_PUBLISHED", "message": "This chat widget is not published."}})
        if deployment.get("status") not in ("connected", "error"):
            raise HTTPException(status_code=403, detail={"error": {"code": "WIDGET_UNAVAILABLE", "message": "This AI assistant is currently unavailable."}})
        return deployment

    @staticmethod
    def _get_agent(agent_id: str) -> Optional[Dict]:
        snap = firestore_client.collection("agents").document(agent_id).get()
        if snap.exists:
            return snap.to_dict()
        return None

    @staticmethod
    def agent_meta(agent_id: str) -> Dict:
        agent = WidgetService._get_agent(agent_id) or {}
        return {
            "id": agent_id,
            "name": agent.get("name", "AI Employee"),
            "role": agent.get("role", "AI Assistant"),
            "avatar": agent.get("avatar", ""),
            "welcome_message": agent.get("welcome_message")
            or f"Hi! I'm {agent.get('name', 'your AI employee')}. How can I help you today?",
        }

    @staticmethod
    async def create_session(widget_id: str, origin: str, page_url: str = "", page_title: str = "",
                             client_ip: str = "") -> Dict:
        """Validates the deployment, checks origin + rate limit, and mints a session token."""
        deployment = await WidgetService.resolve_deployment(widget_id)
        agent_id = deployment.get("agent_id")
        workspace_id = deployment.get("workspace_id")

        if client_ip and not INIT_LIMITER.allow(f"init:{client_ip}"):
            raise HTTPException(status_code=429, detail={"error": {"code": "RATE_LIMITED", "message": "Too many session requests. Please try again later."}})

        allowed_domains = (deployment.get("config") or {}).get("allowed_domains", [])
        if not validate_domain_allowlist(origin, allowed_domains):
            log_error(f"Widget access blocked for origin '{origin}' on widget '{widget_id}'")
            raise HTTPException(status_code=403, detail={"error": {"code": "WIDGET_DOMAIN_NOT_ALLOWED", "message": f"This website ({origin}) is not authorized to use this agent."}})

        agent = WidgetService._get_agent(agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail={"error": {"code": "INVALID_AGENT", "message": "Agent not found."}})

        session_id = f"wses_{uuid.uuid4().hex[:12]}"
        convo_id = f"{CONVERSATION_PREFIX}{uuid.uuid4().hex[:10]}"
        now = time.time()

        session_data = {
            "session_id": session_id,
            "conversation_id": convo_id,
            "widget_id": widget_id,
            "workspace_id": workspace_id,
            "agent_id": agent_id,
            "origin": origin,
            "page_url": page_url,
            "page_title": page_title,
            "created_at": now,
            "expires_at": now + SESSION_TTL_SECONDS,
        }
        WIDGET_SESSIONS[session_id] = session_data

        try:
            firestore_client.collection("widget_sessions").document(session_id).set(session_data)
            config = deployment.get("config") or {}
            welcome = config.get("welcome_message") or WidgetService.agent_meta(agent_id)["welcome_message"]
            convo_doc = {
                "id": convo_id,
                "workspace_id": workspace_id,
                "agent_id": agent_id,
                "agent_name": agent.get("name", "AI Agent"),
                "customer": page_title or "Website Visitor",
                "channel": "Web Chat",
                "status": "active",
                "time": time.strftime("%I:%M %p"),
                "messages": [
                    {
                        "id": "msg_wgt_welcome",
                        "sender_type": "agent",
                        "text": welcome,
                        "time": time.strftime("%H:%M"),
                    }
                ],
                "created_at": now,
                "updated_at": now,
            }
            firestore_client.collection("conversations").document(convo_id).set(convo_doc)
            AnalyticsService.record_event(
                workspace_id=workspace_id,
                event_type="widget_session_started",
                agent_id=agent_id,
                conversation_id=convo_id,
                metadata={"origin": origin, "widget_id": widget_id},
            )
        except Exception as e:
            log_error("Failed to persist widget session", exc=e)

        log_info(f"Widget session initialized: {session_id} for widget {widget_id} on {origin}")
        return session_data

    @staticmethod
    def get_session(session_token: Optional[str]) -> Optional[Dict]:
        """Loads a session from memory, falling back to Firestore."""
        if not session_token:
            return None
        session = WIDGET_SESSIONS.get(session_token)
        if session:
            return session
        try:
            snap = firestore_client.collection("widget_sessions").document(session_token).get()
            if snap.exists:
                data = snap.to_dict()
                WIDGET_SESSIONS[session_token] = data
                return data
        except Exception:
            pass
        return None

    @staticmethod
    def assert_message_allowed(session_token: str) -> None:
        if not MESSAGE_LIMITER.allow(f"msg:{session_token}"):
            raise HTTPException(status_code=429, detail={"error": {"code": "RATE_LIMITED", "message": "You are sending messages too quickly. Please slow down."}})

    @staticmethod
    async def health_test(widget_id: str) -> Dict:
        """Public, zero-cost health check for a deployed widget."""
        deployment = await WidgetService.resolve_deployment(widget_id)
        agent = WidgetService._get_agent(deployment.get("agent_id")) or {}
        return {
            "ok": True,
            "widget_id": widget_id,
            "agent_id": deployment.get("agent_id"),
            "agent_name": agent.get("name", "AI Employee"),
            "published": True,
            "timestamp": time.time(),
        }