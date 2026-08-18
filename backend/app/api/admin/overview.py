import time
from fastapi import APIRouter, Depends
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.database.firestore import firestore_client

router = APIRouter()

@router.get("/overview")
async def get_admin_overview(current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns real platform-wide metrics and needs attention issues for Zhyra Admin.
    """
    total_customers = 0
    total_workspaces = 0
    total_agents = 0
    conversations_today = 0
    needs_attention = []

    try:
        # Customers count from users collection
        user_docs = list(firestore_client.collection("users").stream())
        total_customers = len(user_docs)

        # Workspaces count
        ws_docs = list(firestore_client.collection("workspaces").stream())
        total_workspaces = len(ws_docs)

        # Agents count
        agent_docs = list(firestore_client.collection("agents").stream())
        total_agents = len(agent_docs)

        # Conversations today count
        now = time.time()
        start_of_today = now - (now % 86400)
        convo_docs = list(firestore_client.collection("conversations").stream())
        for c in convo_docs:
            cdata = c.to_dict() or {}
            created = cdata.get("created_at") or cdata.get("createdAt") or 0
            if created >= start_of_today:
                conversations_today += 1

        # Fetch open issues for needs attention
        issue_docs = list(firestore_client.collection("issues").stream())
        for idoc in issue_docs:
            idata = idoc.to_dict() or {}
            if idata.get("status") in ["open", "investigating"]:
                needs_attention.append({
                    "id": idoc.id,
                    "severity": idata.get("severity", "medium"),
                    "title": idata.get("title") or idata.get("issue") or "Integration Event",
                    "workspace": idata.get("workspace_name") or idata.get("workspace_id") or "Platform",
                    "agent": idata.get("agent_name") or "Agent",
                    "timestamp": idata.get("timestamp") or idata.get("createdAt") or now,
                    "status": idata.get("status", "open")
                })
    except Exception as e:
        print(f"Error fetching admin overview: {e}")

    return {
        "metrics": {
            "total_customers": total_customers,
            "active_workspaces": total_workspaces,
            "active_agents": total_agents,
            "conversations_today": conversations_today,
        },
        "needs_attention": needs_attention
    }
