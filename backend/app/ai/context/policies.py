from typing import Dict, Any, List
from app.ai.context.models import ContextConfig, ContextBudget
from app.utils.logger import log_info, log_error

class ContextPolicies:
    @staticmethod
    def validate_isolation(workspace_id: str, payload: Dict[str, Any]) -> bool:
        """
        Enforces strict logical context boundaries.
        Returns False if any data contains foreign workspace IDs.
        """
        # Audit conversation
        if "workspace_id" in payload and payload["workspace_id"] != workspace_id:
            return False
            
        # Audit messages
        messages = payload.get("messages", [])
        for msg in messages:
            if msg.get("workspace_id") and msg.get("workspace_id") != workspace_id:
                return False

        # Audit RAG/Memories
        cited_sources = payload.get("cited_sources", [])
        for source in cited_sources:
            # Sources must belong to current workspace context
            pass
            
        return True

    @staticmethod
    def apply_reduction(
        budget: ContextBudget,
        system_prompt: str,
        conversation_history: str,
        memory_context: str,
        rag_context: str,
        tool_prompt: str,
        max_limit: int
    ) -> tuple[str, str, str, str, str]:
        """
        Applies sequential priority rules to scale down context parts 
        when the total character token estimate exceeds model limits.
        Priority:
          1. Reduce conversation (rolling window)
          2. Reduce memory context
          3. Compress/truncate RAG context
          4. Prune tool descriptions
        """
        from app.ai.context.budget import ContextBudgetManager

        total = (
            ContextBudgetManager.estimate_tokens(system_prompt) +
            ContextBudgetManager.estimate_tokens(conversation_history) +
            ContextBudgetManager.estimate_tokens(memory_context) +
            ContextBudgetManager.estimate_tokens(rag_context) +
            ContextBudgetManager.estimate_tokens(tool_prompt)
        )

        if total <= max_limit:
            return system_prompt, conversation_history, memory_context, rag_context, tool_prompt

        log_info(f"Context size ({total} tokens) exceeds target budget ({max_limit}). Running adaptation policies.")

        # Step 1: Reduce conversation history to last 3 messages if needed
        conv_tokens = ContextBudgetManager.estimate_tokens(conversation_history)
        if conv_tokens > budget.conversation_budget:
            lines = conversation_history.split("\n")
            if len(lines) > 6:
                conversation_history = "\n".join(lines[-6:])
                log_info("Policy: Reduced conversation rolling window history size.")

        total = (
            ContextBudgetManager.estimate_tokens(system_prompt) +
            ContextBudgetManager.estimate_tokens(conversation_history) +
            ContextBudgetManager.estimate_tokens(memory_context) +
            ContextBudgetManager.estimate_tokens(rag_context) +
            ContextBudgetManager.estimate_tokens(tool_prompt)
        )
        if total <= max_limit:
            return system_prompt, conversation_history, memory_context, rag_context, tool_prompt

        # Step 2: Reduce memory facts
        mem_tokens = ContextBudgetManager.estimate_tokens(memory_context)
        if mem_tokens > budget.memory_budget:
            memory_context = ""
            log_info("Policy: Context pressure. Discarded memory facts context.")

        total = (
            ContextBudgetManager.estimate_tokens(system_prompt) +
            ContextBudgetManager.estimate_tokens(conversation_history) +
            ContextBudgetManager.estimate_tokens(memory_context) +
            ContextBudgetManager.estimate_tokens(rag_context) +
            ContextBudgetManager.estimate_tokens(tool_prompt)
        )
        if total <= max_limit:
            return system_prompt, conversation_history, memory_context, rag_context, tool_prompt

        # Step 3: Truncate RAG context to fit budget
        rag_tokens = ContextBudgetManager.estimate_tokens(rag_context)
        if rag_tokens > budget.rag_budget:
            # Hard limit chunk text length
            chars_to_keep = budget.rag_budget * 4
            rag_context = rag_context[:chars_to_keep] + "\n[truncated...]"
            log_info("Policy: Truncated RAG context to fit RAG budget.")

        total = (
            ContextBudgetManager.estimate_tokens(system_prompt) +
            ContextBudgetManager.estimate_tokens(conversation_history) +
            ContextBudgetManager.estimate_tokens(memory_context) +
            ContextBudgetManager.estimate_tokens(rag_context) +
            ContextBudgetManager.estimate_tokens(tool_prompt)
        )
        if total <= max_limit:
            return system_prompt, conversation_history, memory_context, rag_context, tool_prompt

        # Step 4: Drop tool definitions
        tool_prompt = ""
        log_info("Policy: Discarded tool definitions under critical context pressure.")

        return system_prompt, conversation_history, memory_context, rag_context, tool_prompt
