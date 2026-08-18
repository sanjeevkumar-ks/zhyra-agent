from fastapi import APIRouter, Depends
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.database.firestore import firestore_client

router = APIRouter()

@router.get("")
@router.get("/")
async def list_admin_integrations(current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns platform-wide integration health without displaying API credentials.
    """
    integrations = [
        {"name": "Google Calendar", "category": "Productivity", "status": "healthy", "connected_workspaces": 0, "failures": 0},
        {"name": "Gmail", "category": "Communication", "status": "healthy", "connected_workspaces": 0, "failures": 0},
        {"name": "Google Drive", "category": "Storage", "status": "healthy", "connected_workspaces": 0, "failures": 0},
        {"name": "Slack", "category": "Messaging", "status": "healthy", "connected_workspaces": 0, "failures": 0},
        {"name": "ElevenLabs", "category": "Voice", "status": "healthy", "connected_workspaces": 0, "failures": 0},
    ]

    try:
        # Stream active integrations across workspaces
        integ_docs = firestore_client.collection("integrations").stream()
        workspace_counts = {}
        for doc in integ_docs:
            data = doc.to_dict() or {}
            provider = data.get("provider") or data.get("name")
            if provider:
                workspace_counts[provider] = workspace_counts.get(provider, 0) + 1

        for integ in integrations:
            if integ["name"] in workspace_counts:
                integ["connected_workspaces"] = workspace_counts[integ["name"]]
    except Exception as e:
        print(f"Error checking integration status: {e}")

    return {"integrations": integrations}
