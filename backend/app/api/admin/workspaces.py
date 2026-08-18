from fastapi import APIRouter, Depends, HTTPException
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.database.firestore import firestore_client

router = APIRouter()

@router.get("")
@router.get("/")
async def list_workspaces(current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns list of all customer workspaces across Zhyra.
    """
    workspaces = []
    try:
        ws_docs = firestore_client.collection("workspaces").stream()
        for doc in ws_docs:
            data = doc.to_dict() or {}
            workspaces.append({
                "id": doc.id,
                "name": data.get("name") or "Zhyra Workspace",
                "owner_email": data.get("owner_email") or data.get("owner") or "Owner",
                "plan": data.get("plan") or "Scale Plan",
                "status": data.get("status") or "active",
                "agents_count": data.get("agents_count") or 0,
                "users_count": data.get("users_count") or 1,
                "last_activity": data.get("updated_at") or data.get("createdAt") or 0,
            })
    except Exception as e:
        print(f"Error fetching workspaces: {e}")

    return {"workspaces": workspaces}

@router.get("/{workspace_id}")
async def get_workspace_detail(workspace_id: str, current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns read-only internal admin detail for a specific workspace.
    """
    try:
        doc = firestore_client.collection("workspaces").document(workspace_id).get()
        if not doc or not doc.exists:
            raise HTTPException(status_code=404, detail="Workspace not found")
        data = doc.to_dict() or {}

        return {
            "workspace": {
                "id": doc.id,
                "name": data.get("name") or "Zhyra Workspace",
                "owner_email": data.get("owner_email") or "",
                "plan": data.get("plan") or "Scale Plan",
                "status": data.get("status") or "active",
                "industry": data.get("industry") or "",
                "timezone": data.get("timezone") or "UTC",
                "created_at": data.get("createdAt") or 0,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
