from typing import List, Tuple
from app.database.qdrant import qdrant_client
from app.providers.manager import ProviderManager
from app.utils.logger import log_info, log_error
from app.providers.base_provider import EmbeddingProviderUnavailableError

class AIRetriever:
    @classmethod
    async def retrieve_context(cls, workspace_id: str, agent_data: dict, query: str) -> Tuple[str, List[str]]:
        """
        Retrieves relevant document chunks from Qdrant using embeddings.
        NO mock fallback - returns empty context if retrieval fails, letting the agent
        honestly state that knowledge is unavailable.
        """
        knowledge_sources = agent_data.get("knowledge_sources", [])
        if not knowledge_sources:
            return "", []

        cited = []
        chunks = []
        
        try:
            # Get workspace specific provider embeddings
            provider, _ = await ProviderManager.get_active_provider(workspace_id)
            query_vector = await provider.embeddings(query)
            
            collection_name = f"knowledge_{workspace_id}"
            
            # Check if collection exists
            collections = qdrant_client.get_collections().collections
            exists = any(col.name == collection_name for col in collections)
            
            if not exists:
                log_info(f"Knowledge collection '{collection_name}' does not exist for workspace {workspace_id}")
                return "", []
            
            col_info = qdrant_client.get_collection(collection_name)
            existing_dim = col_info.config.params.vectors.size
            
            if existing_dim != len(query_vector):
                log_error(f"Dimension mismatch in Qdrant collection '{collection_name}' (expected: {len(query_vector)}, collection size: {existing_dim}).")
                return "", []
            
            from qdrant_client.http import models as qmodels
            
            # Pre-filter matches inside Qdrant to only search within the agent's assigned knowledge sources
            qdrant_filter = qmodels.Filter(
                must=[
                    qmodels.FieldCondition(
                        key="document_title",
                        match=qmodels.MatchAny(any=knowledge_sources)
                    )
                ]
            )
            
            search_results = qdrant_client.query_points(
                collection_name=collection_name,
                query=query_vector,
                query_filter=qdrant_filter,
                limit=5
            )
            
            for hit in search_results.points:
                payload = hit.payload
                doc_title = payload.get("document_title", "Doc")
                chunks.append(f"Source: {doc_title}\nContent: {payload.get('text', '')}")
                if doc_title not in cited:
                    cited.append(doc_title)
                    
        except EmbeddingProviderUnavailableError:
            log_error("Embedding provider unavailable for knowledge retrieval")
            return "", []
        except Exception as e:
            log_error("Qdrant retriever semantic search failed", exc=e)
            return "", []

        if not chunks:
            log_info(f"No relevant knowledge chunks found for query: '{query[:50]}...' (agent has {len(knowledge_sources)} sources)")
            return "", []

        context_str = "\n\n".join(chunks)
        return context_str, cited
