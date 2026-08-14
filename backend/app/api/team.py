from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.database.firestore import firestore_client
import uuid

router = APIRouter()

@router.get("")
async def list_team_members(
    current_user: AuthUser = Depends(get_current_user),
    workspace_id: str = Depends(get_user_workspace_id)
):
    coll = firestore_client.collection("team")
    docs = coll.stream()
    members = []
    
    for doc in docs:
        data = doc.to_dict()
        if data.get("workspace_id") == workspace_id:
            # Filter out legacy template mock entries
            if "mock" in data.get("name", "").lower() or data.get("email") in ("usr_admin_test@example.com", "mock@example.com"):
                continue
            members.append(data)

    # Ensure current user exists as Owner
    has_owner = any(m.get("permission") == "Owner" for m in members)
    user_member = next((m for m in members if m.get("email") == current_user.email), None)
    
    if user_member:
        if not has_owner or user_member.get("permission") != "Owner":
            user_member["permission"] = "Owner"
            user_member["role"] = "Workspace Owner"
            try:
                firestore_client.collection("team").document(user_member["id"]).update({
                    "permission": "Owner",
                    "role": "Workspace Owner"
                })
            except Exception:
                pass
    else:
        owner_id = f"team_{current_user.uid[:8]}"
        name = current_user.name or "Owner"
        new_owner = {
            "id": owner_id,
            "workspace_id": workspace_id,
            "name": name,
            "email": current_user.email,
            "role": "Workspace Owner",
            "permission": "Owner",
            "initials": name.split(" ")[0][0].upper() if name else "O",
            "gradient": "from-[#2F6BFF] to-[#8B7CF6]",
            "lastActive": "Just now"
        }
        try:
            firestore_client.collection("team").document(owner_id).set(new_owner)
        except Exception:
            pass
        members.append(new_owner)

    return members

@router.post("/invite")
async def invite_team_member(payload: dict, workspace_id: str = Depends(get_user_workspace_id)):
    member_id = f"team_{uuid.uuid4().hex[:8]}"
    name = payload.get("name", "New Teammate")
    doc_ref = firestore_client.collection("team").document(member_id)
    member_data = {
        "id": member_id,
        "workspace_id": workspace_id,
        "name": name,
        "email": payload.get("email", ""),
        "role": payload.get("role", "Developer"),
        "permission": payload.get("permission", "Member"),
        "initials": name.split(" ")[0][0].upper() if name else "T",
        "gradient": "from-[#2F6BFF] to-[#8B7CF6]",
        "lastActive": "Never"
    }
    doc_ref.set(member_data)
    return member_data

@router.delete("/{member_id}")
async def delete_team_member(member_id: str, workspace_id: str = Depends(get_user_workspace_id)):
    doc_ref = firestore_client.collection("team").document(member_id)
    snap = doc_ref.get()
    if not snap.exists or snap.to_dict().get("workspace_id") != workspace_id:
        raise HTTPException(status_code=404, detail="Team member not found.")
    doc_ref.delete()
    return {"detail": "Team member removed."}
