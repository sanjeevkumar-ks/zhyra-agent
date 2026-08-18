from fastapi import APIRouter, Depends, HTTPException
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.database.firestore import firestore_client

router = APIRouter()

@router.get("")
@router.get("/")
async def list_issues(current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns platform-wide issues and escalations affecting customers.
    """
    issues = []
    try:
        docs = firestore_client.collection("issues").stream()
        for doc in docs:
            data = doc.to_dict() or {}
            issues.append({
                "id": doc.id,
                "title": data.get("title") or data.get("issue") or "Integration Failure",
                "severity": data.get("severity") or "medium",
                "status": data.get("status") or "open",
                "workspace_id": data.get("workspace_id") or "",
                "workspace_name": data.get("workspace_name") or "Platform",
                "agent_name": data.get("agent_name") or "Agent",
                "occurrences": data.get("occurrences") or 1,
                "timestamp": data.get("timestamp") or data.get("createdAt") or 0,
            })
    except Exception as e:
        print(f"Error listing issues: {e}")

    return {"issues": issues}

@router.get("/{issue_id}")
async def get_issue_detail(issue_id: str, current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns issue detail and resolution options.
    """
    try:
        doc = firestore_client.collection("issues").document(issue_id).get()
        if not doc or not doc.exists:
            raise HTTPException(status_code=404, detail="Issue not found")
        data = doc.to_dict() or {}

        return {
            "issue": {
                "id": doc.id,
                "title": data.get("title") or "Integration Failure",
                "severity": data.get("severity") or "medium",
                "status": data.get("status") or "open",
                "workspace_name": data.get("workspace_name") or "Platform",
                "agent_name": data.get("agent_name") or "Agent",
                "integration": data.get("integration") or "Service",
                "occurrences": data.get("occurrences") or 1,
                "first_detected": data.get("first_detected") or data.get("createdAt") or 0,
                "last_detected": data.get("last_detected") or data.get("timestamp") or 0,
                "error_details": data.get("error_details") or "Authentication token expired or rejected.",
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
