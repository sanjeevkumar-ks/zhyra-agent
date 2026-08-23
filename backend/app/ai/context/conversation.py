from typing import List, Dict, Any, Tuple
from app.ai.context.models import ContextConfig
from app.ai.context.budget import ContextBudgetManager
from app.database.firestore import firestore_client
from app.providers.manager import ProviderManager
from app.utils.logger import log_info, log_error

class ConversationContextBuilder:
    @classmethod
    async def build(
        cls,
        workspace_id: str,
        conversation_id: str,
        history: List[Dict[str, Any]],
        config: ContextConfig,
        budget_limit: int,
        max_history: int = None
    ) -> Tuple[str, int, str]:
        """
        Builds a rolling window conversation context. 
        Summarizes older parts if they exceed thresholds.
        """
        if not history:
            return "", 0, ""

        max_msgs = max_history or config.max_history_messages
        recent_msgs = history[-max_msgs:]
        older_msgs = history[:-max_msgs]

        # Calculate tokens for full history vs recent history
        recent_str = cls._format_history(recent_msgs)
        recent_tokens = ContextBudgetManager.estimate_tokens(recent_str)

        # Get existing summary from Firestore
        existing_summary = ""
        try:
            convo_ref = firestore_client.collection("conversations").document(conversation_id)
            convo_snap = convo_ref.get()
            if convo_snap.exists:
                existing_summary = convo_snap.to_dict().get("conversation_summary", "")
        except Exception as e:
            log_error(f"Failed to fetch conversation summary for {conversation_id}", exc=e)

        # Check if we need to summarize
        full_str = cls._format_history(history)
        full_tokens = ContextBudgetManager.estimate_tokens(full_str)

        summary_to_use = existing_summary

        if full_tokens > config.summarize_after_tokens and older_msgs:
            # Check if there are new unsufficed messages to summarize
            # For efficiency, only run LLM summarization if the older messages have grown
            older_str = cls._format_history(older_msgs)
            older_tokens = ContextBudgetManager.estimate_tokens(older_str)
            
            # If we don't have a summary, or the older portion grew significantly (e.g. by > 200 tokens)
            existing_summary_tokens = ContextBudgetManager.estimate_tokens(existing_summary)
            if not existing_summary or (older_tokens - existing_summary_tokens > 200):
                new_summary = await cls._generate_summary(workspace_id, existing_summary, older_msgs)
                if new_summary:
                    summary_to_use = new_summary
                    # Save summary back to conversation document
                    try:
                        convo_ref = firestore_client.collection("conversations").document(conversation_id)
                        convo_ref.update({"conversation_summary": summary_to_use})
                        log_info(f"Updated conversation summary for {conversation_id}")
                    except Exception as e:
                        log_error(f"Failed to save summary for {conversation_id}", exc=e)

        # Build final context combining summary & recent messages
        final_history_str = ""
        if summary_to_use:
            final_history_str += f"Conversation Summary so far:\n{summary_to_use}\n\nRecent messages:\n"
        
        final_history_str += recent_str

        # Ensure we fit under the budget limit
        final_tokens = ContextBudgetManager.estimate_tokens(final_history_str)
        if final_tokens > budget_limit:
            # If still over budget, aggressively reduce rolling window size
            for i in range(1, max_msgs):
                shrunk_msgs = history[-(max_msgs - i):]
                shrunk_str = cls._format_history(shrunk_msgs)
                shrunk_final_str = ""
                if summary_to_use:
                    shrunk_final_str += f"Conversation Summary so far:\n{summary_to_use}\n\nRecent messages:\n"
                shrunk_final_str += shrunk_str
                
                shrunk_tokens = ContextBudgetManager.estimate_tokens(shrunk_final_str)
                if shrunk_tokens <= budget_limit:
                    return shrunk_final_str, shrunk_tokens, summary_to_use

        return final_history_str, final_tokens, summary_to_use

    @staticmethod
    def _format_history(messages: List[Dict[str, Any]]) -> str:
        res = ""
        for msg in messages:
            sender = msg.get("sender_type", "customer").capitalize()
            text = msg.get("text", "")
            res += f"{sender}: {text}\n"
        return res

    @staticmethod
    async def _generate_summary(workspace_id: str, current_summary: str, messages: List[Dict[str, Any]]) -> str:
        """Invokes LLM to compile compact rolling conversation summary."""
        try:
            history_text = ConversationContextBuilder._format_history(messages)
            prompt = (
                "Provide a concise, factual summary of the following conversation history. "
                "Focus on customer concerns, key decisions made, items scheduled, or orders discussed. "
                "Keep the summary short (maximum 2-3 sentences).\n\n"
            )
            if current_summary:
                prompt += f"Previous Summary:\n{current_summary}\n\n"
            
            prompt += f"New Conversation portion:\n{history_text}\n\nConcise Summary:"
            
            summary = await ProviderManager.generate_response(
                workspace_id=workspace_id,
                prompt=prompt,
                system_prompt="You are a context optimization summarization engine. Be concise and factual.",
                agent_override={"temperature": 0.3}
            )
            return summary.strip()
        except Exception as e:
            log_error("Rolling conversation summarization failed", exc=e)
            return current_summary
