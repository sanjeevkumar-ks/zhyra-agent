from fastapi import APIRouter, Depends, Query
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.workflow_service import WorkflowService
from app.schemas.workflows import WorkflowResponse, WorkflowCreate, WorkflowUpdate
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()

class AssignPayload(BaseModel):
    agent_id: str

class GeneratePayload(BaseModel):
    prompt: str

@router.get("", response_model=List[WorkflowResponse])
async def list_workflows(workspace_id: str = Depends(get_user_workspace_id)):
    """Lists all workflows created in the active workspace."""
    return await WorkflowService.list_workflows(workspace_id)

@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Retrieves configuration properties for a specific workflow."""
    return await WorkflowService.get_workflow(workspace_id, workflow_id)

@router.post("", response_model=WorkflowResponse)
async def create_workflow(
    payload: WorkflowCreate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Registers a new workflow."""
    return await WorkflowService.create_workflow(workspace_id, payload.model_dump())

@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: str,
    payload: WorkflowUpdate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Updates a workflow's nodes, edges, or settings."""
    return await WorkflowService.update_workflow(workspace_id, workflow_id, payload.model_dump())

@router.delete("/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Deletes a workflow."""
    await WorkflowService.delete_workflow(workspace_id, workflow_id)
    return {"detail": f"Successfully deleted workflow {workflow_id}"}

@router.post("/{workflow_id}/assign")
async def assign_workflow(
    workflow_id: str,
    payload: AssignPayload,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Assigns a workflow to an agent."""
    return await WorkflowService.assign_workflow_to_agent(workspace_id, payload.agent_id, workflow_id)

@router.post("/generate")
async def generate_workflow(
    payload: GeneratePayload,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Generates workflow structure from a natural language prompt."""
    return await WorkflowService.generate_workflow(workspace_id, payload.prompt)
