from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class MessageBase(BaseModel):
    sender_type: str = Field(..., description="'customer' | 'agent' | 'human'")
    text: str
    time: Optional[str] = None  # e.g., "10:02" or ISO string

class MessageCreate(BaseModel):
    text: str

class MessageResponse(MessageBase):
    id: str
    blocks: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    tool_calls: Optional[List[Dict[str, Any]]] = Field(default_factory=list)

class ConversationBase(BaseModel):
    customer: str
    initials: Optional[str] = None
    channel: str = "Web Chat"
    agent_id: str
    agent_name: str
    status: str = "active"  # "resolved" | "active" | "escalated"
    is_test: bool = False

class ConversationCreate(BaseModel):
    customer: str
    agent_id: str
    channel: Optional[str] = "Web Chat"
    is_test: Optional[bool] = False

class ConversationUpdate(BaseModel):
    status: Optional[str] = None
    unread: Optional[bool] = None
    escalation_reason: Optional[str] = None

class ConversationResponse(ConversationBase):
    id: str
    workspace_id: str
    preview: str
    time: str  # e.g., "2m" or timestamp
    unread: bool = False
    messages: List[MessageResponse] = Field(default_factory=list)
    intent: str = "General inquiry"
    confidence: int = 100
    knowledge_used: List[str] = Field(default_factory=list)
    memory_recalled: List[str] = Field(default_factory=list)
    actions: List[str] = Field(default_factory=list)
    escalation_reason: Optional[str] = None
    integration_used: Optional[str] = None
    execution_status: Optional[str] = None

    class Config:
        from_attributes = True
