from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.conversation_service import ConversationService
from app.schemas.conversations import (
    ConversationResponse,
    ConversationCreate,
    MessageCreate,
    TakeoverRequest,
    AssignRequest,
)
from typing import List, Optional

router = APIRouter()

@router.get("", response_model=List[ConversationResponse])
async def list_conversations(
    environment: str = Query("production", description="'production' | 'playground'"),
    agent_id: Optional[str] = Query(None, description="Filter by agent ID"),
    channel: Optional[str] = Query(None, description="Filter by channel"),
    status: Optional[str] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search query"),
    limit: int = Query(50, ge=1, le=200),
    cursor: Optional[str] = Query(None),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Exposes chat session list filtered by environment and workspace."""
    return await ConversationService.list_conversations(
        workspace_id=workspace_id,
        environment=environment,
        agent_id=agent_id,
        channel=channel,
        status=status,
        search=search,
        limit=limit,
        cursor=cursor
    )

@router.get("/{convo_id}", response_model=ConversationResponse)
async def get_conversation(
    convo_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Retrieves full conversation transcript and citations."""
    return await ConversationService.get_conversation(workspace_id, convo_id)

@router.post("", response_model=ConversationResponse)
async def create_conversation(
    payload: ConversationCreate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Spins up a chat target between customer and agent."""
    return await ConversationService.create_conversation(
        workspace_id=workspace_id,
        agent_id=payload.agent_id,
        customer=payload.customer,
        channel=payload.channel,
        is_test=bool(payload.is_test),
        environment=payload.environment
    )

@router.post("/{convo_id}/takeover", response_model=ConversationResponse)
async def take_over_conversation(
    convo_id: str,
    payload: Optional[TakeoverRequest] = None,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Pauses AI response automation and hands over control to a human support agent."""
    user_name = payload.user_name if payload else "Human Support Agent"
    return await ConversationService.take_over_conversation(
        workspace_id=workspace_id,
        convo_id=convo_id,
        user_name=user_name
    )

@router.post("/{convo_id}/reopen", response_model=ConversationResponse)
async def reopen_conversation(
    convo_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Resumes AI response automation for the conversation."""
    return await ConversationService.reopen_conversation(
        workspace_id=workspace_id,
        convo_id=convo_id
    )

@router.post("/{convo_id}/resolve", response_model=ConversationResponse)
async def resolve_conversation(
    convo_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Marks conversation as resolved."""
    return await ConversationService.resolve_conversation(
        workspace_id=workspace_id,
        convo_id=convo_id
    )

@router.post("/{convo_id}/assign", response_model=ConversationResponse)
async def assign_conversation(
    convo_id: str,
    payload: AssignRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Assigns conversation to a team member or support agent."""
    return await ConversationService.assign_conversation(
        workspace_id=workspace_id,
        convo_id=convo_id,
        assignee=payload.assignee
    )

@router.post("/{convo_id}/messages", response_model=ConversationResponse)
async def post_message(
    convo_id: str,
    payload: MessageCreate,
    sender_type: str = Query("customer", description="'customer' | 'human' | 'agent'"),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """
    Submits a new chat line. If submitted by 'customer', runs 
    the RAG pipeline and retrieves the agent response.
    """
    return await ConversationService.post_message(
        workspace_id=workspace_id,
        convo_id=convo_id,
        sender_type=sender_type,
        text=payload.text
    )

@router.get("/{convo_id}/stream")
async def stream_agent_reply(
    convo_id: str,
    prompt_text: str = Query(..., description="The user's query"),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Streams response tokens back in real-time using Server-Sent Events (SSE)."""
    async def sse_generator():
        try:
            async for chunk in ConversationService.stream_agent_chunks(
                workspace_id=workspace_id,
                convo_id=convo_id,
                text=prompt_text
            ):
                yield f"data: {chunk}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: [Error: {str(e)}]\n\n"

    return StreamingResponse(sse_generator(), media_type="text/event-stream")
