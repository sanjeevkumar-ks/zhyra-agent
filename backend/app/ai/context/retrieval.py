from typing import List, Tuple
from app.ai.context.models import ContextConfig
from app.ai.context.budget import ContextBudgetManager
from app.ai.retrieval.retriever import AIRetriever
from app.database.qdrant import qdrant_client
from app.providers.manager import ProviderManager
from app.utils.logger import log_info, log_error

class RetrievalContextBuilder:
    @classmethod
    async def build(
        cls,
        workspace_id: str,
        agent_data: dict,
        query: str,
        config: ContextConfig,
        budget_limit: int
    ) -> Tuple[str, int, List[str]]:
        """
        Retrieves, reranks, filters, and compresses RAG document chunks.
        Fits RAG content strictly inside the allocated token budget.
        """
        knowledge_sources = agent_data.get("knowledge_sources", [])
        if not knowledge_sources:
            return "", 0, []
        if not config.rag_enabled:
            # Action/tool requests do not need knowledge retrieval.
            return "", 0, []

        cited = []
        raw_chunks = []

        try:
            # Check whether the vector collection exists BEFORE paying for an
            # embedding call. If there is nothing to search, do not call the
            # embedding API at all.
            collection_name = f"knowledge_{workspace_id}"
            collections = qdrant_client.get_collections().collections
            exists = any(col.name == collection_name for col in collections)

            if not exists:
                return "", 0, []

            col_info = qdrant_client.get_collection(collection_name)
            existing_dim = col_info.config.params.vectors.size

            provider, _ = await ProviderManager.get_active_provider(workspace_id)
            query_vector = await provider.embeddings(query)

            if existing_dim == len(query_vector):
                from qdrant_client.http import models as qmodels

                qdrant_filter = qmodels.Filter(
                    must=[
                        qmodels.FieldCondition(
                            key="document_title",
                            match=qmodels.MatchAny(any=knowledge_sources)
                        )
                    ]
                )

                # Retrieve retrieval_top_k candidate points (e.g. 10)
                search_results = qdrant_client.query_points(
                    collection_name=collection_name,
                    query=query_vector,
                    query_filter=qdrant_filter,
                    limit=config.retrieval_top_k
                )

                # Extract scored candidates
                for hit in search_results.points:
                    payload = hit.payload
                    doc_title = payload.get("document_title", "Doc")
                    score = hit.score or 0.0
                    raw_chunks.append({
                        "title": doc_title,
                        "text": payload.get("text", ""),
                        "score": score
                    })
        except Exception as e:
            log_error("Qdrant query failed in Context Retrieval Builder", exc=e)

        # Fallback Mock RAG is disabled by default: never fabricate knowledge
        # content. If nothing was retrieved, the LLM gets no RAG context (the
        # honest answer is "information not available"), rather than invented
        # citations such as unrelated PDF titles.
        if not raw_chunks and knowledge_sources and config.enable_fallback_mock_rag:
            for source in knowledge_sources[:3]:
                text = ""
                if "Refund" in source:
                    text = "Customers can request a full refund within 14 days of purchase. Refunds take 3-5 business days to process on the original payment method."
                elif "Manual" in source:
                    text = "To access advanced metrics in the dashboard, navigate to Settings > API and generate a new access token."
                else:
                    text = "Standard operational rules apply. Operating hours are 9:00 AM to 5:00 PM EST, Monday through Friday."

                raw_chunks.append({
                    "title": source,
                    "text": text,
                    "score": 0.85
                })

        # Filter by threshold & sort by score
        filtered_chunks = [
            c for c in raw_chunks 
            if c["score"] >= config.similarity_threshold
        ]
        filtered_chunks.sort(key=lambda x: x["score"], reverse=True)

        # Select Top K (final_top_k)
        selected_chunks = filtered_chunks[:config.rag_top_k]

        # Compress text if enabled
        from app.ai.context.compressor import ContextCompressor
        max_tokens = min(config.max_rag_tokens, budget_limit)
        
        final_pieces = []
        accumulated_tokens = 0

        for chunk in selected_chunks:
            title = chunk["title"]
            text_to_use = chunk["text"]
            
            if config.compress_rag:
                text_to_use = ContextCompressor.compress_chunk(text_to_use, query)

            formatted = f"Source: {title}\nContent: {text_to_use}"
            tokens = ContextBudgetManager.estimate_tokens(formatted)

            if accumulated_tokens + tokens > max_tokens:
                # Truncate remaining if necessary or break
                break

            final_pieces.append(formatted)
            accumulated_tokens += tokens
            if title not in cited:
                cited.append(title)

        context_str = "\n\n".join(final_pieces)
        return context_str, accumulated_tokens, cited
