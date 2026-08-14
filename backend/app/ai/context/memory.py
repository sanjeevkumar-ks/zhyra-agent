from typing import List, Tuple
from app.ai.context.models import ContextConfig
from app.ai.context.budget import ContextBudgetManager
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

class MemoryContextBuilder:
    @classmethod
    async def build(
        cls,
        workspace_id: str,
        agent_name: str,
        query: str,
        config: ContextConfig,
        budget_limit: int
    ) -> Tuple[str, int]:
        """
        Retrieves workspace/agent memories relevant to the user query.
        Filters out low-relevance items and fits within budget.
        """
        memories = await cls._fetch_all_memories(workspace_id, agent_name)
        if not memories:
            return "", 0

        # Score memories by relevance
        scored = []
        for mem in memories:
            score = cls._calculate_relevance(query, mem)
            if score >= config.similarity_threshold or not query:
                scored.append((mem, score))

        # If query is very specific and we have matches, sort by score
        if query:
            scored.sort(key=lambda x: x[1], reverse=True)

        selected = []
        accumulated_tokens = 0
        max_tokens = min(config.max_memory_tokens, budget_limit)

        for mem, score in scored:
            tokens = ContextBudgetManager.estimate_tokens(mem)
            if accumulated_tokens + tokens > max_tokens:
                break
            selected.append(mem)
            accumulated_tokens += tokens

        if not selected:
            # If no memory matched similarity, but general ones are protected, return top general memory
            protected_mems = [m for m in memories if "protected" in m.lower()]
            if protected_mems:
                tokens = ContextBudgetManager.estimate_tokens(protected_mems[0])
                if tokens <= max_tokens:
                    return f"Recalled Fact: {protected_mems[0]}", tokens

            return "", 0

        memory_str = "\n".join([f"- {m}" for m in selected])
        return f"Recalled Memories/Facts:\n{memory_str}", accumulated_tokens

    @staticmethod
    async def _fetch_all_memories(workspace_id: str, agent_name: str) -> List[str]:
        """Queries memories collection in Firestore."""
        try:
            coll = firestore_client.collection("memories")
            docs = coll.stream()
            memories = []
            for doc in docs:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    # Match by agent name if defined, otherwise include general memories
                    if not agent_name or not data.get("agent") or data.get("agent").lower() == agent_name.lower():
                        memories.append(data.get("detail", data.get("title", "")))
            return memories
        except Exception as e:
            log_error("Failed to query memories for builder", exc=e)
            return []

    @staticmethod
    def _calculate_relevance(query: str, text: str) -> float:
        """Computes basic word-overlap overlap coefficient score between query and memory text."""
        if not query or not text:
            return 0.0
        
        # Normalize and split into words
        q_words = {w.strip("?,.!-()\"'") for w in query.lower().split() if len(w) > 2}
        t_words = {w.strip("?,.!-()\"'") for w in text.lower().split() if len(w) > 2}
        
        if not q_words or not t_words:
            return 0.0
            
        overlap = q_words.intersection(t_words)
        # Jaccard index similarity score
        return len(overlap) / len(q_words.union(t_words))
