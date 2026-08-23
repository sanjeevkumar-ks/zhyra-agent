from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal

IntentType = Literal["ACTION", "KNOWLEDGE", "CHAT", "UNKNOWN"]

class ContextConfig(BaseModel):
    max_history_messages: int = Field(default=8, description="Rolling conversation history limit")
    summarize_after_tokens: int = Field(default=3000, description="Trigger Rolling Conversation Summary when history exceeds this token limit")
    max_memory_tokens: int = Field(default=1000, description="Maximum tokens allowed for memory facts")
    max_rag_tokens: int = Field(default=2500, description="Maximum tokens allowed for RAG documents")
    rag_top_k: int = Field(default=4, description="Final number of RAG chunks to send")
    retrieval_top_k: int = Field(default=10, description="Initial candidates retrieved before reranking")
    max_tool_tokens: int = Field(default=1500, description="Maximum tokens allowed for tool definitions")
    total_context_budget: int = Field(default=8000, description="Total target context budget limit")
    similarity_threshold: float = Field(default=0.6, description="Similarity threshold for RAG and memory retrieval")
    compress_rag: bool = Field(default=True, description="Enable sentence-level text compression on RAG chunks")
    rag_enabled: bool = Field(default=True, description="Set False to skip RAG retrieval entirely (e.g. action/tool requests)")
    enable_fallback_mock_rag: bool = Field(default=False, description="Never fabricate RAG content when nothing was retrieved")
    
    # Intent-aware context reduction
    intent_type: Optional[IntentType] = Field(default=None, description="Request intent type for context optimization")
    action_max_history: int = Field(default=4, description="Max history messages for ACTION requests")
    chat_max_history: int = Field(default=3, description="Max history messages for CHAT requests")
    knowledge_max_history: int = Field(default=6, description="Max history messages for KNOWLEDGE requests")
    action_memory_budget: int = Field(default=200, description="Memory budget for ACTION requests")
    chat_memory_budget: int = Field(default=0, description="Memory budget for CHAT requests (disabled)")
    knowledge_memory_budget: int = Field(default=800, description="Memory budget for KNOWLEDGE requests")
    action_rag_budget: int = Field(default=0, description="RAG budget for ACTION requests (disabled)")
    knowledge_rag_budget: int = Field(default=2500, description="RAG budget for KNOWLEDGE requests")

class ContextBudget(BaseModel):
    total_context_budget: int
    system_prompt_budget: int
    conversation_budget: int
    memory_budget: int
    rag_budget: int
    tool_budget: int
    response_budget: int

class ContextPacket(BaseModel):
    system_prompt: str
    conversation_history: str
    memory_context: str
    rag_context: str
    tool_prompt: str
    cited_sources: List[str] = []
    token_usage_estimate: Dict[str, int] = {}
    config_applied: Dict[str, Any] = {}

class TokenUsageRecord(BaseModel):
    workspace_id: str
    agent_id: str
    conversation_id: str
    model: str
    provider: str
    system_prompt_tokens: int = 0
    conversation_tokens: int = 0
    memory_tokens: int = 0
    rag_tokens: int = 0
    tool_definition_tokens: int = 0
    tool_result_tokens: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    latency_ms: int = 0
    timestamp: float = 0.0
