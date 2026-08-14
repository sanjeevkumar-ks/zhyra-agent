from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.conversation_service import ConversationService
from app.schemas.conversations import ConversationResponse, ConversationCreate, MessageCreate
from typing import List

router = APIRouter()

@router.get("", response_model=List[ConversationResponse])
async def list_conversations(workspace_id: str = Depends(get_user_workspace_id)):
    """Exposes chat session list sorted by latest response."""
    return await ConversationService.list_conversations(workspace_id)

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
        is_test=bool(payload.is_test)
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
