from typing import List, Dict, Any, Optional
from app.ai.context.models import ContextConfig, ContextPacket
from app.ai.context.builder import ContextBuilder

class ContextEngine:
    @classmethod
    async def build(
        cls,
        workspace_id: str,
        agent_id: str,
        agent_data: Dict[str, Any],
        query: str,
        history: List[Dict[str, Any]],
        config_override: Optional[Dict[str, Any]] = None
    ) -> ContextPacket:
        """
        Public entry point to build token-optimized and context-bounded agent payloads.
        Integrates rolling conversation summarization, memory filtering, RAG, and tool routing.
        """
        # Load agent config overrides or resolve sensible defaults
        config_payload = dict(agent_data.get("context_config") or {})
        if config_override:
            config_payload.update(config_override)

        config = ContextConfig(**config_payload)

        # Build context packet
        packet = await ContextBuilder.assemble_context(
            workspace_id=workspace_id,
            agent_id=agent_id,
            agent_data=agent_data,
            query=query,
            history=history,
            config=config
        )

        return packet
