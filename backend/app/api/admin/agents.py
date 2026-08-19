from fastapi import APIRouter, Depends, HTTPException
from app.api.admin.guard import get_current_admin_user, AdminAuthUser
from app.database.firestore import firestore_client

router = APIRouter()

@router.get("")
@router.get("/")
async def list_agents(current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns list of all AI agents across all workspaces from backend DB.
    Zero mock names.
    """
    agents = []
    try:
        agent_docs = firestore_client.collection("agents").stream()
        for doc in agent_docs:
            data = doc.to_dict() or {}
            agents.append({
                "id": doc.id,
                "name": data.get("name") or "Unnamed Agent",
                "role": data.get("role") or data.get("purpose") or "AI Employee",
                "workspace_id": data.get("workspace_id") or "",
                "workspace_name": data.get("workspace_name") or "Zhyra Workspace",
                "status": data.get("status") or "active",
                "voice_enabled": bool(data.get("voice")),
                "tools_count": len(data.get("tools") or []),
                "last_active": data.get("updated_at") or data.get("createdAt") or 0,
            })
    except Exception as e:
        print(f"Error listing agents: {e}")

    return {"agents": agents}

@router.get("/{agent_id}")
async def get_agent_detail(agent_id: str, current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Returns agent configuration summary safely (never exposing API keys or tokens).
    """
    try:
        doc = firestore_client.collection("agents").document(agent_id).get()
        if not doc or not doc.exists:
            raise HTTPException(status_code=404, detail="Agent not found")
        data = doc.to_dict() or {}

        # Strip any raw API keys or tokens before returning
        safe_tools = []
        for t in data.get("tools") or []:
            if isinstance(t, dict):
                safe_t = {k: v for k, v in t.items() if "key" not in k.lower() and "token" not in k.lower() and "secret" not in k.lower()}
                safe_tools.append(safe_t)
            else:
                safe_tools.append(t)

        return {
            "agent": {
                "id": doc.id,
                "name": data.get("name") or "Unnamed Agent",
                "role": data.get("role") or "AI Employee",
                "workspace_id": data.get("workspace_id") or "",
                "status": data.get("status") or "active",
                "voice": data.get("voice") or {},
                "tools": safe_tools,
                "knowledge_sources": data.get("knowledge_sources") or [],
                "created_at": data.get("createdAt") or 0,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/debug/agent/{agent_id}/tools")
async def debug_agent_tools(agent_id: str, current_admin: AdminAuthUser = Depends(get_current_admin_user)):
    """
    Admin debug endpoint returning tool assignments, connection states, and actions.
    NEVER returns raw credentials or tokens.
    """
    from app.integrations.resolver import IntegrationResolver

    doc = firestore_client.collection("agents").document(agent_id).get()
    if not doc or not doc.exists:
        raise HTTPException(status_code=404, detail="Agent not found")
    data = doc.to_dict() or {}
    workspace_id = data.get("workspace_id", "")

    tool_actions_map = {
        "google_calendar": ["list_events", "create_event", "update_event", "delete_event"],
        "int_gcal": ["list_events", "create_event", "update_event", "delete_event"],
        "gmail": ["send_email", "search_emails", "read_email"],
        "int_gmail": ["send_email", "search_emails", "read_email"],
        "slack": ["send_message", "list_channels"],
        "int_slack": ["send_message", "list_channels"],
        "shopify": ["get_order", "list_products"],
        "int_shopify": ["get_order", "list_products"],
        "hubspot": ["get_contact", "create_contact"],
        "int_hubspot": ["get_contact", "create_contact"]
    }

    tools_debug = []
    agent_tools = data.get("tools") or []

    for t_id, actions in tool_actions_map.items():
        if t_id.startswith("int_"):
            clean_name = t_id.replace("int_gcal", "google_calendar").replace("int_gmail", "gmail").replace("int_slack", "slack").replace("int_shopify", "shopify").replace("int_hubspot", "hubspot")
            status_code, message, _ = await IntegrationResolver.resolve_integration_connection(
                workspace_id=workspace_id,
                agent_id=agent_id,
                provider_or_tool=t_id
            )

            is_assigned = (status_code != "NOT_ASSIGNED_TO_AGENT")
            tools_debug.append({
                "name": clean_name,
                "assigned": is_assigned,
                "connection_status": status_code.lower(),
                "message": message,
                "actions": actions
            })

    gcal_status, gcal_msg, _ = await IntegrationResolver.resolve_integration_connection(
        workspace_id=workspace_id,
        agent_id=agent_id,
        provider_or_tool="int_gcal"
    )

    gcal_meta = {
        "assigned": gcal_status != "NOT_ASSIGNED_TO_AGENT",
        "connected": gcal_status == "CONNECTED",
        "status": gcal_status.lower()
    }

    return {
        "agent_id": agent_id,
        "workspace_id": workspace_id,
        "google_calendar": gcal_meta,
        "tools": tools_debug
    }
