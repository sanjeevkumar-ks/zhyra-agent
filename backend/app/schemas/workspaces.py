from pydantic import BaseModel, Field
from typing import Optional, List

class WorkspaceBase(BaseModel):
    name: str = Field(..., description="Name of the workspace (e.g. 'Aurora Clinic')")
    industry: Optional[str] = "Technology"
    timezone: Optional[str] = "UTC"
    language: Optional[str] = "English (US)"
    default_escalation_contact: Optional[str] = None

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None
    default_escalation_contact: Optional[str] = None

class WorkspaceAIConfig(BaseModel):
    default_provider: str = "gemini"
    default_model: str = "gemini-3.5-flash"
    temperature: float = 0.7
    max_output_tokens: int = 1000
    streaming_enabled: bool = True

class WorkspaceResponse(WorkspaceBase):
    id: str
    owner_id: str
    default_provider: str = "gemini"
    default_model: str = "gemini-3.5-flash"
    temperature: float = 0.7
    max_output_tokens: int = 1000
    streaming_enabled: bool = True

    class Config:
        from_attributes = True
