from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ResponseBlock(BaseModel):
    type: str = Field(..., description="Block types: text, calendar_event, email, integration_status, integration_error, confirmation, action_required, citation")
    data: Dict[str, Any] = Field(default_factory=dict)

class StructuredAgentResponse(BaseModel):
    status: str = Field(default="success", description="success | error")
    message: str = Field(..., description="Natural language final response from LLM")
    blocks: List[ResponseBlock] = Field(default_factory=list)
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list)
    integration_used: Optional[str] = None
    execution_status: str = Field(default="completed", description="completed | failed | reauth_required | api_disabled | permission_denied | not_connected")
