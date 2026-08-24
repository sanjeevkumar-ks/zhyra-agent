from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import time
import json

from app.api.workspaces import get_user_workspace_id
from app.database.firestore import firestore_client
from app.services.conversation_service import ConversationService
from app.services.playground_service import PlaygroundService
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


class EvaluateRequest(BaseModel):
    prompt_text: str
    ai_reply: dict


class SavedTestCreate(BaseModel):
    agent_id: str
    name: str
    mode: str = "simulation"
    input: str
    expected_behavior: Optional[str] = None


def _load_agent(workspace_id: str, agent_id: str) -> dict:
    """Loads an agent and verifies it belongs to the authenticated workspace."""
    agent_ref = firestore_client.collection("agents").document(agent_id)
    agent_snap = agent_ref.get()
    agent_data = None
    if agent_snap.exists:
        agent_data = agent_snap.to_dict()
    else:
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


@router.get("/sessions")
async def list_playground_sessions(
    agent_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Lists all playground test sessions for the authenticated workspace."""
    return await ConversationService.list_conversations(
        workspace_id=workspace_id,
        environment="playground",
        agent_id=agent_id,
        limit=limit
    )


@router.post("/session")
async def create_playground_session(
    payload: PlaygroundSessionCreate,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """
    Creates a fresh test session (conversation) for the real agent.

    The workspace and agent are always resolved from the authenticated user.
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
        environment="playground",
    )

    return {
        "session_id": convo["id"],
        "conversation_id": convo["id"],
        "workspace_id": workspace_id,
        "agent_id": payload.agent_id,
        "agent_name": agent_data.get("name", ""),
        "mode": mode,
        "is_test": True,
        "environment": "playground",
    }


@router.get("/session/{convo_id}")
async def get_playground_session(
    convo_id: str,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Fetches the full test session transcript and evaluation."""
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
    """Streams response tokens and structured execution events for a test run."""
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


@router.post("/session/{convo_id}/evaluate")
async def evaluate_playground_session(
    convo_id: str,
    payload: EvaluateRequest,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Runs structural evaluation and hallucination detection on a test run."""
    return await PlaygroundService.evaluate_test_run(
        workspace_id=workspace_id,
        session_id=convo_id,
        prompt_text=payload.prompt_text,
        ai_reply=payload.ai_reply,
    )


@router.get("/edge-cases")
async def generate_edge_cases(
    agent_id: str = Query(...),
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Generates capability-based runnable edge case tests for an agent."""
    return await PlaygroundService.generate_edge_cases(workspace_id, agent_id)


@router.get("/saved-tests")
async def get_saved_tests(
    agent_id: Optional[str] = Query(None),
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Lists saved test scenarios for the workspace."""
    return await PlaygroundService.get_saved_tests(workspace_id, agent_id)


@router.post("/saved-tests")
async def save_test_scenario(
    payload: SavedTestCreate,
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Saves a reusable test scenario."""
    return await PlaygroundService.save_test_scenario(workspace_id, payload.dict())


@router.post("/regression")
async def run_regression_suite(
    agent_id: str = Query(...),
    workspace_id: str = Depends(get_user_workspace_id),
):
    """Runs batch evaluation suite over saved test scenarios."""
    return await PlaygroundService.run_regression_suite(workspace_id, agent_id)
