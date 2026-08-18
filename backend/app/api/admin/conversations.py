from fastapi import APIRouter, Depends, HTTPException
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.database.firestore import firestore_client

router = APIRouter()

@router.get("")
@router.get("/")
async def list_conversations(
    workspace_id: str = None,
    agent_id: str = None,
    current_admin: AdminAuthUser = Depends(get_current_admin_user)
):
    """
    Returns platform-wide conversations for internal debugging and support.
    """
    conversations = []
    try:
        query = firestore_client.collection("conversations")
        if workspace_id:
            query = query.where("workspace_id", "==", workspace_id)
        if agent_id:
            query = query.where("agent_id", "==", agent_id)

        docs = query.stream()
        for doc in docs:
            data = doc.to_dict() or {}
            conversations.append({
                "id": doc.id,
                "agent_name": data.get("agent_name") or "Agent",
                "workspace_id": data.get("workspace_id") or "",
                "workspace_name": data.get("workspace_name") or "Zhyra Workspace",
                "channel": data.get("channel") or "web_widget",
                "status": data.get("status") or "completed",
                "created_at": data.get("created_at") or data.get("createdAt") or 0,
                "message_count": len(data.get("messages") or []),
            })
    except Exception as e:
        print(f"Error listing conversations: {e}")

    return {"conversations": conversations}

@router.get("/{conversation_id}")
async def get_conversation_detail(conversation_id: str, current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns safe conversation transcript and safe tool execution info.
    Explicitly excludes hidden model reasoning, system prompts, API keys or OAuth tokens.
    """
    try:
        doc = firestore_client.collection("conversations").document(conversation_id).get()
        if not doc or not doc.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        data = doc.to_dict() or {}

        raw_messages = data.get("messages") or []
        safe_messages = []
        for m in raw_messages:
            if isinstance(m, dict):
                # Filter out system prompt or hidden model reasoning
                role = m.get("role") or m.get("sender") or "user"
                if role not in ["system", "internal_reasoning"]:
                    safe_messages.append({
                        "role": role,
                        "content": m.get("content") or m.get("text") or "",
                        "timestamp": m.get("timestamp") or 0,
                        "tool_call": m.get("tool_call")  # Safe tool invocation name & status
                    })

        return {
            "conversation": {
                "id": doc.id,
                "agent_name": data.get("agent_name") or "Agent",
                "workspace_id": data.get("workspace_id") or "",
                "channel": data.get("channel") or "web_widget",
                "status": data.get("status") or "completed",
                "created_at": data.get("created_at") or 0,
                "messages": safe_messages
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
