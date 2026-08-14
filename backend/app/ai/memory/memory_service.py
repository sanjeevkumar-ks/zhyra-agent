from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

class MemoryService:
    @staticmethod
    async def get_agent_memories(workspace_id: str, agent_name: str) -> list[str]:
        """
        Retrieves agent memory facts from Firestore memories collection.
        """
        try:
            coll = firestore_client.collection("memories")
            docs = coll.stream()
            memories = []
            for doc in docs:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    # Match by agent name if specified, otherwise include general memories
                    if not agent_name or not data.get("agent") or data.get("agent").lower() == agent_name.lower():
                        memories.append(data.get("detail", data.get("title", "")))
            return memories
        except Exception as e:
            log_error("Failed to retrieve agent memories", exc=e)
            return []

    @staticmethod
    def get_short_term_context(messages: list, limit: int = 5) -> str:
        """
        Formats recent messages for model context history.
        """
        history_summary = ""
        for h in messages[-limit:]:
            sender = h.get("sender_type", "customer").capitalize()
            text = h.get("text", "")
            history_summary += f"{sender}: {text}\n"
        return history_summary
