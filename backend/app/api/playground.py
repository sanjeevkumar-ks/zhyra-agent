from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import time
import json

from app.api.workspaces import get_user_workspace_id
from app.database.firestore import firestore_client
from app.services.conversation_service import ConversationService
from app.ai.integration.dynamic_registry import DynamicToolRegistry
from app.utils.logger import log_error

router = APIRouter()

MODES = {"live", "simulation"}

INTEGRATION_LABELS = {
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
    "int_rest_api": "REST API",
}


class PlaygroundSessionCreate(BaseModel):
    agent_id: str = Field(..., description="Agent to test. Must belong to the authenticated workspace.")
    mode: str = Field("live", description="'live' runs real external actions, 'simulation' does not.")
    customer: Optional[str] = Field("Playground Tester", description="Label for the test session.")


def _load_agent(workspace_id: str, agent_id: str) -> dict:
    """Loads an agent and verifies it belongs to the authenticated workspace."""
    agent_ref = firestore_client.collection("agents").document(agent_id)
    agent_snap = agent_ref.get()
    agent_data = None
    if agent_snap.exists:
        agent_data = agent_snap.to_dict()
    else:
        # Fallback stream search in case document ID or id property varies
        try:
            docs = firestore_client.collection("agents").stream()
            for d in docs:
                ddata = d.to_dict() or {}
                if ddata.get("id") == agent_id or d.id == agent_id:
                    agent_data = ddata
                    break
        except Exception:
            pass

    if not agent_data:
        # Fallback 2: return first workspace agent if specific agent_id lookup misses
        try:
            docs = firestore_client.collection("agents").stream()
            for d in docs:
                ddata = d.to_dict() or {}
                if ddata.get("workspace_id") == workspace_id:
                    agent_data = ddata
                    break
        except Exception:
            pass

    if not agent_data:
        raise HTTPException(status_code=404, detail="Agent not found.")

    if agent_data.get("workspace_id") != workspace_id:
        raise HTTPException(
            status_code=403,
            detail="Agent does not belong to the current workspace.",
        )
    return agent_data


@router.post("/session")
async def create_playground_session(
    payload: PlaygroundSessionCreate,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """
    Creates a fresh test session (conversation) for the real agent.

    The workspace and agent are always resolved from the authenticated user —
    arbitrary agent_id/workspace_id from the frontend are never trusted.
    """
    mode = (payload.mode or "live").lower()
    if mode not in MODES:
        raise HTTPException(status_code=400, detail="mode must be 'live' or 'simulation'.")

    agent_data = _load_agent(workspace_id, payload.agent_id)

    convo = await ConversationService.create_conversation(
        workspace_id=workspace_id,
        agent_id=payload.agent_id,
        customer=payload.customer or "Playground Tester",
        channel="Playground",
        is_test=True,
    )

    return {
        "session_id": convo["id"],
        "conversation_id": convo["id"],
        "workspace_id": workspace_id,
        "agent_id": payload.agent_id,
        "agent_name": agent_data.get("name", ""),
        "mode": mode,
        "is_test": True,
    }


@router.get("/session/{convo_id}")
async def get_playground_session(
    convo_id: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Fetches the full test session (conversation) transcript."""
    if not convo_id or convo_id.lower() in ("undefined", "null", "none"):
        raise HTTPException(status_code=400, detail="Invalid session_id parameter.")
    return await ConversationService.get_conversation(workspace_id, convo_id)


@router.get("/session/{convo_id}/stream")
async def stream_playground_session(
    convo_id: str,
    prompt_text: str = Query(..., description="The test prompt"),
    mode: str = Query("live", description="'live' or 'simulation'"),
    workspace_id: str = Depends(get_user_workspace_id),
):
    """
    Streams the REAL AgentRuntime for a Playground session.

    This is a thin wrapper over the SAME streaming protocol used by production
    conversations. The only difference is the explicit mode flag and the
    validated, workspace-scoped session context.
    """
    if not convo_id or convo_id.lower() in ("undefined", "null", "none"):
        raise HTTPException(status_code=400, detail="Invalid session_id parameter.")
    mode = mode.lower()
    if mode not in MODES:
        raise HTTPException(status_code=400, detail="mode must be 'live' or 'simulation'.")

    async def sse_generator():
        try:
            async for chunk in ConversationService.stream_agent_chunks(
                workspace_id=workspace_id,
                convo_id=convo_id,
                text=prompt_text,
                mode=mode,
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except HTTPException as exc:
            yield f"data: __ACK__:{json.dumps({'status': 'error', 'message': str(exc.detail)})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [Error: {str(e)}]\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")


@router.get("/agent/{agent_id}/status")
async def get_playground_agent_status(
    agent_id: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """
    Resolves the REAL connection state for every tool the agent is assigned.

    Status comes from the backend resolver (integration doc + encrypted OAuth
    credentials + expiry metadata), never from stale frontend state. When a
    token is expired and a refresh token exists, it is refreshed exactly once.
    Permanent OAuth failures (e.g. unauthorized_client — wrong OAuth client)
    surface as REAUTH_REQUIRED so the UI can show a Reconnect action.
    """
    agent_data = _load_agent(workspace_id, agent_id)

    connected_ids = DynamicToolRegistry._get_connected_ids(workspace_id)
    assigned_ids = DynamicToolRegistry._get_assigned_ids(agent_id)

    # Load real integration labels from the workspace integration docs.
    integration_docs = {}
    try:
        for doc in firestore_client.collection("integrations").stream():
            data = doc.to_dict() or {}
            if data.get("workspace_id") == workspace_id and data.get("id"):
                integration_docs[data["id"]] = data
    except Exception as e:
        log_error(f"Failed to load integration docs for playground status: {e}")

    def _label(iid: str) -> str:
        doc = integration_docs.get(iid) or {}
        return doc.get("name") or INTEGRATION_LABELS.get(iid, iid)

    from app.integrations.resolver import IntegrationResolver
    from app.integrations.credential_store import load_credentials
    from app.utils.logger import log_info

    integrations: List[Dict[str, Any]] = []
    for iid in sorted(set(assigned_ids)):
        label = _label(iid)
        is_connected = iid in connected_ids
        creds = load_credentials(workspace_id, iid) or {}

        status = "DISCONNECTED"
        message = f"{label} is not connected to your workspace."
        token_state = "none"
        detail: Dict[str, Any] = {}

        if is_connected:
            # Resolve with real (non-lightweight) checks — refreshes only when
            # the token is expired/mismatched, exactly once.
            status_code, message, detail = await IntegrationResolver.resolve_integration_connection(
                workspace_id=workspace_id,
                agent_id=agent_id,
                provider_or_tool=iid,
                lightweight=False,
            )
            if status_code == "CONNECTED":
                status = "CONNECTED"
            elif status_code == "NOT_ASSIGNED_TO_AGENT":
                status = "NOT_ASSIGNED_TO_AGENT"
            elif status_code in ("TOKEN_REFRESH_FAILED", "TOKEN_EXPIRED"):
                status = "REAUTH_REQUIRED"
            else:
                status = "ERROR"

            has_access = bool(creds.get("access_token"))
            has_refresh = bool(creds.get("refresh_token"))
            expires_at = creds.get("expires_at")
            stored_client = creds.get("client_id")
            from app.integrations.oauth_helpers import GOOGLE_CLIENT_ID
            client_mismatch = bool(
                stored_client and GOOGLE_CLIENT_ID and stored_client != GOOGLE_CLIENT_ID
            )
            token_state = (
                "mismatched_client" if client_mismatch
                else "expired" if (expires_at and expires_at < time.time())
                else "valid" if has_access
                else "none"
            )

        from app.ai.tools import tool_registry
        ready_tools = tool_registry.get_ready_tool_keys([iid]) if (is_connected and iid in assigned_ids) else []

        integrations.append({
            "integration_id": iid,
            "name": label,
            "assigned": True,
            "connected": is_connected,
            "connection_status": status,
            "message": message,
            "token_state": token_state,
            "detail": detail,
            "ready_tools": ready_tools,
            "oauth_flow_available": iid in {
                "int_gcal", "int_gmail", "int_gdrive", "int_gmeet",
                "int_slack", "int_hubspot", "int_shopify",
            },
            "reconnect_url": f"/api/integrations/oauth/authorize/{iid}",
        })

    # Also surface connected-but-unassigned integrations (visible for clarity).
    unassigned = sorted(set(connected_ids) - set(assigned_ids))
    for iid in unassigned:
        label = _label(iid)
        integrations.append({
            "integration_id": iid,
            "name": label,
            "assigned": False,
            "connected": True,
            "connection_status": "NOT_ASSIGNED_TO_AGENT",
            "message": f"{label} is connected, but this agent doesn't have access to it.",
            "token_state": "n/a",
            "ready_tools": [],
            "oauth_flow_available": iid in {
                "int_gcal", "int_gmail", "int_gdrive", "int_gmeet",
                "int_slack", "int_hubspot", "int_shopify",
            },
            "reconnect_url": f"/api/integrations/oauth/authorize/{iid}",
        })

    return {
        "agent_id": agent_id,
        "agent_name": agent_data.get("name", ""),
        "workspace_id": workspace_id,
        "integrations": integrations,
    }


@router.get("/session/{convo_id}/metrics")
async def get_session_metrics(
    convo_id: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Returns token usage and latency metrics for a playground session."""
    if not convo_id or convo_id.lower() in ("undefined", "null", "none"):
        raise HTTPException(status_code=400, detail="Invalid session_id parameter.")
    
    try:
        # Get conversation to verify workspace
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        convo_snap = convo_ref.get()
        if not convo_snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        convo_data = convo_snap.to_dict()
        if convo_data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        agent_id = convo_data.get("agent_id")
        
        # Fetch token usage records for this conversation
        usage_docs = firestore_client.collection("token_usage").where("conversation_id", "==", convo_id).stream()
        usage_records = [doc.to_dict() for doc in usage_docs]
        
        # Aggregate metrics
        total_input = sum(r.get("input_tokens", 0) for r in usage_records)
        total_output = sum(r.get("output_tokens", 0) for r in usage_records)
        total_tokens = sum(r.get("total_tokens", 0) for r in usage_records)
        total_latency = sum(r.get("latency_ms", 0) for r in usage_records)
        call_count = len(usage_records)
        
        # Estimate cost (rough: $0.0001 per 1K tokens for Gemini Flash)
        estimated_cost = (total_tokens / 1000) * 0.0001
        
        # Get latest timings from traces
        trace_docs = firestore_client.collection("traces").where("conversation_id", "==", convo_id).order_by("request_start", direction="DESCENDING").limit(1).stream()
        latest_trace = None
        for doc in trace_docs:
            latest_trace = doc.to_dict()
            break
        
        timings = latest_trace.get("timings", {}) if latest_trace else {}
        
        return {
            "conversation_id": convo_id,
            "agent_id": agent_id,
            "total_calls": call_count,
            "input_tokens": total_input,
            "output_tokens": total_output,
            "total_tokens": total_tokens,
            "estimated_cost_usd": round(estimated_cost, 6),
            "total_latency_ms": total_latency,
            "avg_latency_ms": round(total_latency / call_count, 2) if call_count > 0 else 0,
            "breakdown": {
                "llm_latency_ms": timings.get("llm_ms", 0),
                "tool_latency_ms": timings.get("tool_execution_ms", 0),
                "rag_latency_ms": timings.get("rag_ms", 0),
                "context_build_ms": timings.get("context_build_ms", 0),
                "intent_classifier_ms": timings.get("intent_classifier_ms", 0),
            },
            "records": usage_records[-10:],  # Last 10 records
        }
    except HTTPException:
        raise
    except Exception as e:
        log_error(f"Failed to fetch session metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch metrics")


@router.get("/metrics/workspace")
async def get_workspace_metrics(
    workspace_id: str = Depends(get_user_workspace_id),
    limit: int = 100,
):
    """Returns aggregated token usage and latency metrics for the workspace."""
    try:
        # Fetch recent token usage records for this workspace
        usage_docs = firestore_client.collection("token_usage").where("workspace_id", "==", workspace_id).order_by("timestamp", direction="DESCENDING").limit(limit).stream()
        usage_records = [doc.to_dict() for doc in usage_docs]
        
        if not usage_records:
            return {
                "workspace_id": workspace_id,
                "total_calls": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "estimated_cost_usd": 0,
                "total_latency_ms": 0,
                "avg_latency_ms": 0,
                "by_model": {},
                "by_agent": {},
            }
        
        # Aggregate metrics
        total_input = sum(r.get("input_tokens", 0) for r in usage_records)
        total_output = sum(r.get("output_tokens", 0) for r in usage_records)
        total_tokens = sum(r.get("total_tokens", 0) for r in usage_records)
        total_latency = sum(r.get("latency_ms", 0) for r in usage_records)
        call_count = len(usage_records)
        
        # By model
        by_model = {}
        for r in usage_records:
            model = r.get("model", "unknown")
            if model not in by_model:
                by_model[model] = {"calls": 0, "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "latency_ms": 0}
            by_model[model]["calls"] += 1
            by_model[model]["input_tokens"] += r.get("input_tokens", 0)
            by_model[model]["output_tokens"] += r.get("output_tokens", 0)
            by_model[model]["total_tokens"] += r.get("total_tokens", 0)
            by_model[model]["latency_ms"] += r.get("latency_ms", 0)
        
        # By agent
        by_agent = {}
        for r in usage_records:
            agent = r.get("agent_id", "unknown")
            if agent not in by_agent:
                by_agent[agent] = {"calls": 0, "total_tokens": 0, "latency_ms": 0}
            by_agent[agent]["calls"] += 1
            by_agent[agent]["total_tokens"] += r.get("total_tokens", 0)
            by_agent[agent]["latency_ms"] += r.get("latency_ms", 0)
        
        estimated_cost = (total_tokens / 1000) * 0.0001
        
        return {
            "workspace_id": workspace_id,
            "total_calls": call_count,
            "input_tokens": total_input,
            "output_tokens": total_output,
            "total_tokens": total_tokens,
            "estimated_cost_usd": round(estimated_cost, 6),
            "total_latency_ms": total_latency,
            "avg_latency_ms": round(total_latency / call_count, 2) if call_count > 0 else 0,
            "by_model": by_model,
            "by_agent": by_agent,
        }
    except Exception as e:
        log_error(f"Failed to fetch workspace metrics: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch metrics")