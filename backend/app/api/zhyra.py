from fastapi import APIRouter, Depends, HTTPException, Request
import time
import uuid
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.database.firestore import firestore_client
from app.services.conversation_service import ConversationService
from app.ai.runtime.agent_runtime import AgentRuntime
from app.utils.logger import log_info, log_error

router = APIRouter()

@router.get("/session")
async def get_zhyra_session(workspace_id: str = Depends(get_user_workspace_id)):
    """Resolves or initializes a persistent Ask Zhyra chat session for the workspace."""
    try:
        # 1. Resolve Zhyra Master Agent ID
        agents_coll = firestore_client.collection("agents")
        agents = agents_coll.stream()
        zhyra_id = None
        for doc in agents:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id and data.get("agent_type") == "master":
                zhyra_id = data.get("id")
                break
                
        if not zhyra_id:
            from app.services.agent_service import AgentService
            zhyra_data = await AgentService.provision_zhyra_master_agent(workspace_id)
            zhyra_id = zhyra_data["id"]

        # 2. Find any existing AskZhyra channel conversation
        convos_coll = firestore_client.collection("conversations")
        convos = convos_coll.stream()
        target_convo = None
        for doc in convos:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id and data.get("channel") == "AskZhyra":
                target_convo = data
                break

        # 3. Create if missing
        if not target_convo:
            target_convo = await ConversationService.create_conversation(
                workspace_id=workspace_id,
                agent_id=zhyra_id,
                customer="Workspace Owner",
                channel="AskZhyra",
                is_test=False,
                environment="zhyra"
            )

        # Map to client-friendly format
        client_messages = []
        for msg in target_convo.get("messages", []):
            role = "user" if msg.get("sender_type") == "customer" else "assistant"
            client_messages.append({
                "id": msg.get("id", f"msg_{uuid.uuid4().hex[:8]}"),
                "role": role,
                "content": msg.get("text", ""),
                "actions": msg.get("actions", []),
                "blocks": msg.get("blocks", [])
            })

        return {
            "conversation_id": target_convo["id"],
            "messages": client_messages
        }
    except Exception as e:
        log_error("Failed to get Zhyra chat session", exc=e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat")
async def zhyra_chat(
    payload: dict,
    workspace_id: str = Depends(get_user_workspace_id),
    current_user: AuthUser = Depends(get_current_user)
):
    """Primary chat endpoint for the AskZhyra widget."""
    text = payload.get("message", "").strip()
    convo_id = payload.get("conversation_id")
    
    if not text:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    try:
        # 1. Resolve Zhyra Master Agent ID
        agents_coll = firestore_client.collection("agents")
        agents = agents_coll.stream()
        zhyra_id = None
        zhyra_data = None
        for doc in agents:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id and data.get("agent_type") == "master":
                zhyra_id = data.get("id")
                zhyra_data = data
                break
                
        if not zhyra_id:
            from app.services.agent_service import AgentService
            zhyra_data = await AgentService.provision_zhyra_master_agent(workspace_id)
            zhyra_id = zhyra_data["id"]

        # 2. Verify or create conversation reference
        convo_ref = None
        if convo_id:
            convo_ref = firestore_client.collection("conversations").document(convo_id)
            convo_snap = convo_ref.get()
            if not convo_snap.exists or convo_snap.to_dict().get("workspace_id") != workspace_id:
                convo_ref = None

        if not convo_ref:
            convo = await ConversationService.create_conversation(
                workspace_id=workspace_id,
                agent_id=zhyra_id,
                customer="Workspace Owner",
                channel="AskZhyra",
                is_test=False,
                environment="zhyra"
            )
            convo_id = convo["id"]
            convo_ref = firestore_client.collection("conversations").document(convo_id)

        convo_data = convo_ref.get().to_dict()
        messages = convo_data.get("messages", [])

        # 3. Log user message to Firestore
        user_msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        user_msg = {
            "id": user_msg_id,
            "sender_type": "customer",
            "text": text,
            "time": time.strftime("%H:%M")
        }
        messages.append(user_msg)

        convo_ref.update({
            "messages": messages,
            "preview": text[:60] + ("..." if len(text) > 60 else ""),
            "unread": False
        })

        # 4. Invoke AgentRuntime for Master Agent
        result = await AgentRuntime.execute(
            workspace_id=workspace_id,
            agent_id=zhyra_id,
            query=text,
            history=messages[:-1],  # History excludes the current message
            conversation_id=convo_id,
            user_id=current_user.uid
        )

        # 5. Log Zhyra reply to Firestore
        agent_msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        agent_msg = {
            "id": agent_msg_id,
            "sender_type": "agent",
            "text": result.get("text", ""),
            "blocks": result.get("blocks", []),
            "actions": result.get("actions", []),
            "tool_calls": result.get("tool_calls", []),
            "time": time.strftime("%H:%M")
        }
        messages.append(agent_msg)

        convo_ref.update({
            "messages": messages,
            "preview": result.get("text", "")[:60] + ("..." if len(result.get("text", "")) > 60 else ""),
            "intent": result.get("intent", "General inquiry"),
            "confidence": result.get("confidence", 95),
            "knowledge_used": result.get("knowledge_used", []),
            "memory_recalled": result.get("memory_recalled", []),
            "actions": result.get("actions", []),
            "status": result.get("status", "active"),
            "execution_status": result.get("execution_status", "completed")
        })

        return {
            "conversation_id": convo_id,
            "reply": result.get("text", ""),
            "blocks": result.get("blocks", []),
            "actions": result.get("actions", []),
            "tool_events": result.get("tool_events", []),
            "terminal_state": result.get("terminal_state", "COMPLETED")
        }
    except Exception as e:
        log_error("Error in Zhyra chat endpoint", exc=e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/query")
async def zhyra_legacy_query(
    payload: dict,
    workspace_id: str = Depends(get_user_workspace_id),
    current_user: AuthUser = Depends(get_current_user)
):
    """Backward compatibility wrapper for /api/assistant/query."""
    res = await zhyra_chat(payload, workspace_id, current_user)
    return {
        "reply": res["reply"],
        "actions": res["actions"]
    }
