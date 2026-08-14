from typing import List, Dict, Any, Tuple
from app.ai.context.models import ContextConfig, ContextPacket
from app.ai.context.budget import ContextBudgetManager
from app.ai.context.conversation import ConversationContextBuilder
from app.ai.context.memory import MemoryContextBuilder
from app.ai.context.retrieval import RetrievalContextBuilder
from app.ai.context.tools import ToolContextBuilder
from app.ai.context.policies import ContextPolicies
from app.utils.logger import log_info

class ContextBuilder:
    @classmethod
    async def assemble_context(
        cls,
        workspace_id: str,
        agent_id: str,
        agent_data: Dict[str, Any],
        query: str,
        history: List[Dict[str, Any]],
        config: ContextConfig
    ) -> ContextPacket:
        """
        Orchestrates building all components of the context window.
        Validates token counts, runs policies, and fits inside target budgets.
        """
        # Resolve active model to load budget limits
        from app.providers.manager import ProviderManager
        _, provider_settings = await ProviderManager.get_active_provider(workspace_id)
        
        # Override workspace default model if agent specifies one
        overrides = agent_data.get("overrides") or {}
        model_name = overrides.get("model") or provider_settings.get("model", "gemini-3.5-flash")
        
        # Calculate budget allocations
        budget = ContextBudgetManager.calculate_budget(model_name, config)

        # 1. Base system prompt
        agent_name = agent_data.get("name", "Zhyra Agent")
        agent_purpose = agent_data.get("purpose", "Help customers resolve inquiries.")
        system_prompt = overrides.get("system_prompt", "") or f"You are {agent_name}. Purpose: {agent_purpose}."
        
        # 2. Build conversation rolling history
        convo_id = history[0].get("conversation_id", f"temp_{agent_id}") if history else f"temp_{agent_id}"
        conversation_str, conv_tokens, summary = await ConversationContextBuilder.build(
            workspace_id, convo_id, history, config, budget.conversation_budget
        )

        # 3. Build relevance-filtered memory context
        memory_str, mem_tokens = await MemoryContextBuilder.build(
            workspace_id, agent_name, query, config, budget.memory_budget
        )

        # 4. Build reranked & compressed RAG context
        rag_str, rag_tokens, cited = await RetrievalContextBuilder.build(
            workspace_id, agent_data, query, config, budget.rag_budget
        )

        # 5. Build intent-routed tool prompts
        agent_tools = agent_data.get("tools") or []
        tool_str, tool_tokens, active_tools = await ToolContextBuilder.build(
            workspace_id, agent_tools, query, config, budget.tool_budget
        )

        # Apply context reduction policies if total estimated tokens exceed limits
        system_prompt, conversation_str, memory_str, rag_str, tool_str = ContextPolicies.apply_reduction(
            budget=budget,
            system_prompt=system_prompt,
            conversation_history=conversation_str,
            memory_context=memory_str,
            rag_context=rag_str,
            tool_prompt=tool_str,
            max_limit=budget.total_context_budget
        )

        # Recalculate actual sizes post-adaptation
        est_usage = {
            "system_prompt": ContextBudgetManager.estimate_tokens(system_prompt),
            "conversation": ContextBudgetManager.estimate_tokens(conversation_str),
            "memory": ContextBudgetManager.estimate_tokens(memory_str),
            "rag": ContextBudgetManager.estimate_tokens(rag_str),
            "tools": ContextBudgetManager.estimate_tokens(tool_str),
            "total": 0
        }
        est_usage["total"] = sum(est_usage.values())

        return ContextPacket(
            system_prompt=system_prompt,
            conversation_history=conversation_str,
            memory_context=memory_str,
            rag_context=rag_str,
            tool_prompt=tool_str,
            cited_sources=cited,
            token_usage_estimate=est_usage,
            config_applied={
                "model": model_name,
                "max_history": config.max_history_messages,
                "active_tools": active_tools,
                "summary_cached": bool(summary)
            }
        )
