from fastapi import APIRouter, Depends
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.agent_service import AgentService
from app.schemas.agents import AgentResponse, AgentCreate, AgentUpdate
from typing import List

router = APIRouter()

@router.get("", response_model=List[AgentResponse])
async def list_agents(workspace_id: str = Depends(get_user_workspace_id)):
    """Lists all AI agents running in active workspace."""
    return await AgentService.list_agents(workspace_id)

@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Retrieves config properties for a specific AI agent."""
    return await AgentService.get_agent(workspace_id, agent_id)

@router.post("", response_model=AgentResponse)
async def create_agent(
    payload: AgentCreate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Registers a new AI agent with custom directives."""
    return await AgentService.create_agent(workspace_id, payload.model_dump())

@router.put("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    payload: AgentUpdate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Updates AI employee metrics, goals, tools, or model overrides."""
    return await AgentService.update_agent(workspace_id, agent_id, payload.model_dump())

@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Deletes an agent configuration."""
    await AgentService.delete_agent(workspace_id, agent_id)
    return {"detail": f"Successfully deleted agent {agent_id}"}
