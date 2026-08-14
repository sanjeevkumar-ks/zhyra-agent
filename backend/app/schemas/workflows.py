from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class WorkflowNode(BaseModel):
    id: str
    type: str
    label: str
    desc: Optional[str] = ""
    x: float
    y: float
    trigger_condition: Optional[str] = "Always run"
    tool: Optional[str] = ""
    fallback: Optional[str] = ""

class WorkflowEdge(BaseModel):
    source: str
    target: str

class WorkflowCreate(BaseModel):
    name: str
    nodes: List[WorkflowNode] = Field(default_factory=list)
    edges: List[WorkflowEdge] = Field(default_factory=list)
    default_for_all_agents: Optional[bool] = False

class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    nodes: Optional[List[WorkflowNode]] = None
    edges: Optional[List[WorkflowEdge]] = None
    default_for_all_agents: Optional[bool] = None

class WorkflowResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    nodes: List[WorkflowNode]
    edges: List[WorkflowEdge]
    default_for_all_agents: bool = False

    class Config:
        from_attributes = True
