from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class IntegrationBase(BaseModel):
    name: str
    category: str  # "Scheduling" | "Messaging" | "CRM" | "Payments" | "Knowledge"
    description: Optional[str] = None

class IntegrationConnectRequest(BaseModel):
    credentials: Dict[str, Any]
    configuration: Optional[Dict[str, Any]] = None
    synced_agents: List[str] = Field(default_factory=list)
    connected_account: Optional[str] = None

class IntegrationResponse(IntegrationBase):
    id: str
    workspace_id: str
    connected: bool = False
    synced_agents: List[str] = Field(default_factory=list)
    last_sync: str = "Never"
    health: int = 0  # 0-100 score
    config: Optional[Dict[str, Any]] = Field(default_factory=dict)
    connected_account: Optional[str] = None

class IntegrationHealthResponse(BaseModel):
    healthy: bool
    status: str
    last_check: str
