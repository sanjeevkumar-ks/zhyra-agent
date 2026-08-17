from pydantic import BaseModel, Field
from typing import List, Optional

class AgentOverride(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    system_prompt: Optional[str] = None
    response_style: Optional[str] = None

class VoiceConfig(BaseModel):
    enabled: bool = False
    provider: Optional[str] = "elevenlabs"
    voice_id: Optional[str] = None
    voice_name: Optional[str] = None

class AgentBase(BaseModel):
    name: str
    purpose: str
    avatar_gradient: Optional[str] = "from-[#2F6BFF] to-[#8B7CF6]"
    initials: Optional[str] = "AI"
    status: str = "active"  # "active" | "paused"
    capabilities: List[str] = Field(default_factory=list)
    channels: List[str] = Field(default_factory=list)
    personality: Optional[str] = None
    role: Optional[str] = None
    goals: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    knowledge_sources: List[str] = Field(default_factory=list)
    voice_id: Optional[str] = None
    voice_config: Optional[VoiceConfig] = None
    workflow_id: Optional[str] = None
    
    # Overrides
    overrides: Optional[AgentOverride] = Field(default_factory=AgentOverride)

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    purpose: Optional[str] = None
    avatar_gradient: Optional[str] = None
    initials: Optional[str] = None
    status: Optional[str] = None
    capabilities: Optional[List[str]] = None
    channels: Optional[List[str]] = None
    personality: Optional[str] = None
    role: Optional[str] = None
    goals: Optional[List[str]] = None
    tools: Optional[List[str]] = None
    knowledge_sources: Optional[List[str]] = None
    overrides: Optional[AgentOverride] = None
    voice_id: Optional[str] = None
    voice_config: Optional[VoiceConfig] = None
    workflow_id: Optional[str] = None

class AgentResponse(AgentBase):
    id: str
    workspace_id: str
    conversations_today: int = 0
    resolution_rate: int = 100
    health: int = 100
    recent_improvement: Optional[str] = "Initialized."

    class Config:
        from_attributes = True
