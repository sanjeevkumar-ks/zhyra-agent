from typing import Dict, Any
from app.ai.context.models import ContextConfig, ContextBudget
from app.utils.logger import log_info

class ContextBudgetManager:
    # Model context window registry (in tokens)
    MODEL_LIMITS: Dict[str, int] = {
        # Gemini models
        "gemini-2.5-flash": 1048576,
        "gemini-2.5-pro": 2097152,
        "gemini-3.5-flash": 1048576,
        "gemini-3.6-flash": 1048576,
        "gemini-flash-latest": 1048576,
        "gemini-pro-latest": 2097152,
        # OpenAI models
        "gpt-4o": 128000,
        "gpt-4o-mini": 128000,
        "gpt-4": 8192,
        "gpt-3.5-turbo": 16385,
        # Claude models
        "claude-3-5-sonnet": 200000,
        "claude-3-opus": 200000,
        "claude-3-haiku": 200000,
        # Default fallback
        "default": 32000
    }

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Estimates token count for string payload using standard character division."""
        if not text:
            return 0
        return len(text) // 4

    @classmethod
    def calculate_budget(cls, model_name: str, config: ContextConfig) -> ContextBudget:
        """
        Calculates context allocation boundaries adapted dynamically 
        based on the selected model's capability limits.
        """
        # Resolve limit
        model_name_lower = model_name.lower()
        limit = cls.MODEL_LIMITS.get("default")
        for m, val in cls.MODEL_LIMITS.items():
            if m in model_name_lower:
                limit = val
                break

        # Reserve output tokens
        reserved_output = 1500
        available_context = max(4000, limit - reserved_output)

        # Scale target budget to fit within available context if needed
        target_total = min(config.total_context_budget, available_context)

        # Allocation weights / priorities
        system_prompt_budget = int(target_total * 0.15)  # 15%
        conversation_budget = int(target_total * 0.25)   # 25%
        memory_budget = int(target_total * 0.12)         # 12%
        rag_budget = int(target_total * 0.33)            # 33%
        tool_budget = int(target_total * 0.15)           # 15%

        budget = ContextBudget(
            total_context_budget=target_total,
            system_prompt_budget=system_prompt_budget,
            conversation_budget=conversation_budget,
            memory_budget=memory_budget,
            rag_budget=rag_budget,
            tool_budget=tool_budget,
            response_budget=reserved_output
        )

        log_info(
            f"Context budget calculated for model '{model_name}' (limit: {limit}): "
            f"Total budget: {target_total} tokens. Allocations: sys={system_prompt_budget}, "
            f"conv={conversation_budget}, mem={memory_budget}, rag={rag_budget}, tool={tool_budget}"
        )
        return budget
