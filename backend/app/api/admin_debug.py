from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
from app.database.firestore import firestore_client
from app.ai.tools import tool_registry
from app.ai.integration.dynamic_registry import DynamicToolRegistry
from app.utils.logger import log_error

router = APIRouter()


@router.get("/debug/agent/{agent_id}/tools")
async def debug_agent_tools(agent_id: str) -> Dict[str, Any]:
    """
    Admin debugging endpoint: resolves which integrations are connected,
    which tools this agent is assigned, which canonical tool keys are ready,
    and the exact function schemas that would be sent to the LLM.
    """
    try:
        agent_ref = firestore_client.collection("agents").document(agent_id)
        agent_snap = agent_ref.get()
        if not agent_snap.exists:
            raise HTTPException(status_code=404, detail="Agent not found.")
        agent_data = agent_snap.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        log_error(f"Failed to load agent for debug: {agent_id}", exc=e)
        raise HTTPException(status_code=500, detail="Failed to load agent.")

    agent_tools = agent_data.get("tools") or []
    workspace_id = agent_data.get("workspace_id", "")

    # Connected integrations in the workspace
    connected_ids = []
    try:
        docs = firestore_client.collection("integrations").stream()
        for doc in docs:
            data = doc.to_dict() or {}
            if data.get("workspace_id") == workspace_id and data.get("connected"):
                connected_ids.append(data.get("id"))
    except Exception as e:
        log_error(f"Failed to list integrations for debug: {agent_id}", exc=e)

    # Assigned integrations via agent tools list
    assigned_ids = DynamicToolRegistry._get_assigned_ids(agent_id)

    # Lightweight preflight resolution (no network)
    from app.ai.integration.preflight import IntegrationPreflight
    connection_status: Dict[str, Any] = {}
    for iid in sorted(set(connected_ids)):
        preflight = await IntegrationPreflight.check(workspace_id, agent_id, iid, lightweight=True)
        connection_status[iid] = preflight.to_dict()

    ready_ids = [iid for iid in connected_ids if iid in assigned_ids]
    schemas = tool_registry.get_schemas_for_integrations(ready_ids)

    return {
        "agent_id": agent_id,
        "workspace_id": workspace_id,
        "agent_tools_raw": agent_tools,
        "connected_integrations": sorted(set(connected_ids)),
        "assigned_integrations": sorted(set(assigned_ids)),
        "ready_integrations": sorted(ready_ids),
        "ready_tool_keys": tool_registry.get_ready_tool_keys(ready_ids),
        "llm_function_schemas": schemas,
        "connection_status": connection_status,
    }