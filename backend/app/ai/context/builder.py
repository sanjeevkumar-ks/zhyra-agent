from typing import List, Dict, Any, Tuple, Optional
from app.ai.context.models import ContextConfig, ContextPacket, IntentType
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
        
        Request-aware optimization:
        - ACTION: minimal history, no RAG, no memory, only relevant tools
        - KNOWLEDGE: relevant history, RAG enabled, memory enabled, knowledge tools
        - CHAT: minimal history, no RAG, no memory, no tools unless explicitly needed
        """
        # Resolve active model to load budget limits
        from app.providers.manager import ProviderManager
        _, provider_settings = await ProviderManager.get_active_provider(workspace_id)
        
        # Override workspace default model if agent specifies one
        overrides = agent_data.get("overrides") or {}
        model_name = overrides.get("model") or provider_settings.get("model", "gemini-3.5-flash")
        
        # Get intent type for request-aware optimization
        intent_type = config.intent_type or "UNKNOWN"
        
        # Apply intent-aware budget adjustments
        adjusted_budget = cls._adjust_budget_for_intent(
            ContextBudgetManager.calculate_budget(model_name, config), 
            config, 
            intent_type
        )
        
        budget = adjusted_budget
        
        # 1. Base system prompt
        agent_name = agent_data.get("name", "Zhyra Agent")
        agent_purpose = agent_data.get("purpose", "Help customers resolve inquiries.")
        system_prompt = overrides.get("system_prompt", "") or f"You are {agent_name}. Purpose: {agent_purpose}."
        
        # 2. Build conversation rolling history (intent-aware)
        convo_id = history[0].get("conversation_id", f"temp_{agent_id}") if history else f"temp_{agent_id}"
        max_history = cls._get_max_history_for_intent(config, intent_type)
        conversation_str, conv_tokens, summary = await ConversationContextBuilder.build(
            workspace_id, convo_id, history, config, budget.conversation_budget, max_history
        )

        # 3. Build relevance-filtered memory context (intent-aware)
        memory_budget = cls._get_memory_budget_for_intent(budget, config, intent_type)
        memory_str, mem_tokens = await MemoryContextBuilder.build(
            workspace_id, agent_name, query, config, memory_budget
        )

        # 4. Build reranked & compressed RAG context (intent-aware)
        rag_budget = cls._get_rag_budget_for_intent(budget, config, intent_type)
        rag_str, rag_tokens, cited = await RetrievalContextBuilder.build(
            workspace_id, agent_data, query, config, rag_budget
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

        log_info(
            f"[ContextBuilder] intent_type={intent_type} "
            f"tokens: sys={est_usage['system_prompt']} conv={est_usage['conversation']} "
            f"mem={est_usage['memory']} rag={est_usage['rag']} tools={est_usage['tools']} "
            f"total={est_usage['total']} budget={budget.total_context_budget}"
        )

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
                "max_history": max_history,
                "active_tools": active_tools,
                "summary_cached": bool(summary),
                "intent_type": intent_type,
            }
        )

    @staticmethod
    def _adjust_budget_for_intent(budget, config: ContextConfig, intent_type: str):
        """Adjust budget allocations based on intent type."""
        # For ACTION: reduce conversation, disable memory and RAG
        # For CHAT: minimal conversation, no memory, no RAG
        # For KNOWLEDGE: standard allocations
        
        if intent_type == "ACTION":
            # Reduce conversation budget for action requests
            budget.conversation_budget = min(budget.conversation_budget, 1500)
            budget.memory_budget = config.action_memory_budget  # ~200 tokens
            budget.rag_budget = config.action_rag_budget  # 0 - disabled
            budget.tool_budget = min(budget.tool_budget, 1000)  # Only relevant tools
            
        elif intent_type == "CHAT":
            # Minimal context for chat
            budget.conversation_budget = min(budget.conversation_budget, 800)
            budget.memory_budget = config.chat_memory_budget  # 0 - disabled
            budget.rag_budget = 0  # Disabled
            budget.tool_budget = 0  # No tools unless explicitly needed
            
        elif intent_type == "KNOWLEDGE":
            # Full RAG, moderate conversation
            budget.conversation_budget = min(budget.conversation_budget, 2000)
            budget.memory_budget = config.knowledge_memory_budget
            budget.rag_budget = min(budget.rag_budget, config.knowledge_rag_budget)
            budget.tool_budget = min(budget.tool_budget, 800)  # Only knowledge tools
            
        # UNKNOWN: use defaults
        return budget

    @staticmethod
    def _get_max_history_for_intent(config: ContextConfig, intent_type: str) -> int:
        """Get max history messages for intent type."""
        if intent_type == "ACTION":
            return config.action_max_history
        elif intent_type == "CHAT":
            return config.chat_max_history
        elif intent_type == "KNOWLEDGE":
            return config.knowledge_max_history
        return config.max_history_messages

    @staticmethod
    def _get_memory_budget_for_intent(budget, config: ContextConfig, intent_type: str) -> int:
        """Get memory budget for intent type."""
        if intent_type == "ACTION":
            return config.action_memory_budget
        elif intent_type == "CHAT":
            return config.chat_memory_budget
        elif intent_type == "KNOWLEDGE":
            return config.knowledge_memory_budget
        return budget.memory_budget

    @staticmethod
    def _get_rag_budget_for_intent(budget, config: ContextConfig, intent_type: str) -> int:
        """Get RAG budget for intent type."""
        if intent_type == "ACTION":
            return config.action_rag_budget
        elif intent_type == "CHAT":
            return 0
        elif intent_type == "KNOWLEDGE":
            return min(budget.rag_budget, config.knowledge_rag_budget)
        return budget.rag_budget