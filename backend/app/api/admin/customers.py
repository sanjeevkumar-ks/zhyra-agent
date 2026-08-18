from fastapi import APIRouter, Depends, HTTPException
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.database.firestore import firestore_client

router = APIRouter()

@router.get("")
@router.get("/")
async def list_customers(current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns list of all customers using Zhyra.
    """
    customers = []
    try:
        user_docs = firestore_client.collection("users").stream()
        for doc in user_docs:
            data = doc.to_dict() or {}
            customers.append({
                "id": doc.id,
                "email": data.get("email") or "",
                "name": data.get("name") or data.get("displayName") or (data.get("email") or "").split("@")[0],
                "workspace_id": data.get("workspace_id") or "",
                "workspace_name": data.get("workspace_name") or "Zhyra Workspace",
                "plan": data.get("plan") or "Scale Plan",
                "status": data.get("status") or "active",
                "created_at": data.get("created_at") or data.get("createdAt") or 0,
                "last_active": data.get("last_active") or data.get("lastLoginAt") or 0,
            })
    except Exception as e:
        print(f"Error fetching customers: {e}")

    return {"customers": customers}

@router.get("/{customer_id}")
async def get_customer_detail(customer_id: str, current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns customer profile detail and workspace summary.
    """
    try:
        doc = firestore_client.collection("users").document(customer_id).get()
        if not doc or not doc.exists:
            raise HTTPException(status_code=404, detail="Customer not found")
        data = doc.to_dict() or {}

        workspace_id = data.get("workspace_id")
        workspace_data = {}
        if workspace_id:
            ws_doc = firestore_client.collection("workspaces").document(workspace_id).get()
            if ws_doc and ws_doc.exists:
                workspace_data = ws_doc.to_dict() or {}

        return {
            "customer": {
                "id": doc.id,
                "email": data.get("email") or "",
                "name": data.get("name") or data.get("displayName") or "",
                "status": data.get("status") or "active",
                "created_at": data.get("created_at") or data.get("createdAt") or 0,
                "last_active": data.get("last_active") or data.get("lastLoginAt") or 0,
            },
            "workspace": {
                "id": workspace_id or "",
                "name": workspace_data.get("name") or data.get("workspace_name") or "Zhyra Workspace",
                "plan": workspace_data.get("plan") or data.get("plan") or "Scale Plan",
                "users_count": workspace_data.get("users_count") or 1,
                "agents_count": workspace_data.get("agents_count") or 0,
                "conversations_count": workspace_data.get("conversations_count") or 0,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
