from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.database.firestore import firestore_client
import uuid

router = APIRouter()

@router.get("")
async def list_memories(workspace_id: str = Depends(get_user_workspace_id)):
    coll = firestore_client.collection("memories")
    docs = coll.stream()
    results = []
    for doc in docs:
        data = doc.to_dict()
        if data.get("workspace_id") == workspace_id:
            results.append(data)
    return results

@router.post("")
async def create_memory(payload: dict, workspace_id: str = Depends(get_user_workspace_id)):
    mem_id = f"mem_{uuid.uuid4().hex[:8]}"
    doc_ref = firestore_client.collection("memories").document(mem_id)
    mem_data = {
        "id": mem_id,
        "workspace_id": workspace_id,
        "title": payload.get("title", "New Fact"),
        "detail": payload.get("detail", ""),
        "type": payload.get("type", "short-term"),
        "time": "Just now",
        "agent": payload.get("agent", "Nova"),
        "protected": payload.get("protected", False)
    }
    doc_ref.set(mem_data)
    return mem_data

@router.put("/{mem_id}")
async def update_memory(mem_id: str, payload: dict, workspace_id: str = Depends(get_user_workspace_id)):
    doc_ref = firestore_client.collection("memories").document(mem_id)
    snap = doc_ref.get()
    if not snap.exists or snap.to_dict().get("workspace_id") != workspace_id:
        raise HTTPException(status_code=404, detail="Memory fact not found.")
    
    update_data = {k: v for k, v in payload.items() if v is not None}
    if update_data:
        doc_ref.update(update_data)
    return doc_ref.get().to_dict()

@router.delete("/{mem_id}")
async def delete_memory(mem_id: str, workspace_id: str = Depends(get_user_workspace_id)):
    doc_ref = firestore_client.collection("memories").document(mem_id)
    snap = doc_ref.get()
    if not snap.exists or snap.to_dict().get("workspace_id") != workspace_id:
        raise HTTPException(status_code=404, detail="Memory fact not found.")
    doc_ref.delete()
    return {"detail": "Memory fact deleted."}
