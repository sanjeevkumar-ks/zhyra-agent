"""
Structured tool-calling contract for the Zhyra agent runtime.

The production execution protocol is based on *structured* tool calls, never
text parsing. An LLM emits a list of ``ToolCall`` objects. The backend resolves
each call against the deterministic tool registry, executes the registered
executor, and records a ``ToolExecutionRecord`` with an explicit state and a
verified external resource ID.

Only a record in ``SUCCEEDED`` state with an external resource ID may be shown
to the user as a successful action.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ToolCall(BaseModel):
    """A structured tool invocation emitted by the LLM."""

    id: str = Field(..., description="Unique tool call ID for deduplication and trace correlation.")
    name: str = Field(..., description="Canonical tool key, e.g. 'google_calendar.create_event'.")
    action: str = Field("execute", description="Resolved action on the integration, e.g. 'create_event'.")
    integration_id: str = Field("", description="Resolved integration ID, e.g. 'int_gcal'.")
    args: Dict[str, Any] = Field(default_factory=dict)
    raw_name: str = Field("", description="Original tool name as emitted by the LLM (for aliasing).")


class ToolExecutionRecord(BaseModel):
    """Immutable audit record of a single tool execution."""

    id: str
    tool_call_id: str = ""
    workspace_id: str = ""
    agent_id: str = ""
    conversation_id: str = ""
    tool: str = ""
    action: str = ""
    integration_id: str = ""
    status: str = "PENDING"  # PENDING | EXECUTING | SUCCEEDED | FAILED
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    duration_ms: Optional[int] = None
    external_resource_id: Optional[str] = None
    error_code: Optional[str] = None
    message: str = ""
    data: Dict[str, Any] = Field(default_factory=dict)
    simulated: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()

    def to_user_payload(self) -> Dict[str, Any]:
        """Safe, user-facing event payload (never includes credentials)."""
        return {
            "id": self.id,
            "tool_call_id": self.tool_call_id,
            "tool": self.tool,
            "action": self.action,
            "integration_id": self.integration_id,
            "status": self.status,
            "external_resource_id": self.external_resource_id,
            "error_code": self.error_code,
            "message": self.message,
            "data": self.data,
            "duration_ms": self.duration_ms,
            "simulated": self.simulated,
        }


class StructuredLLMResponse(BaseModel):
    """Result of a single LLM turn: either free text, tool calls, or both."""

    text: str = ""
    tool_calls: List[ToolCall] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0
    model: str = ""
    provider: str = ""