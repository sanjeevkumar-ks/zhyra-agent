from typing import List, Tuple
from app.database.qdrant import qdrant_client
from app.providers.manager import ProviderManager
from app.utils.logger import log_info, log_error

class AIRetriever:
    @classmethod
    async def retrieve_context(cls, workspace_id: str, agent_data: dict, query: str) -> Tuple[str, List[str]]:
        """
        Retrieves relevant document chunks from Qdrant using embeddings.
        Falls back to mock RAG context if search fails or is empty, matching existing behavior.
        """
        knowledge_sources = agent_data.get("knowledge_sources", [])
        if not knowledge_sources:
            return "No documents uploaded for this agent.", []

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
            
            if exists:
                col_info = qdrant_client.get_collection(collection_name)
                existing_dim = col_info.config.params.vectors.size
                
                if existing_dim == len(query_vector):
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
                else:
                    log_error(f"Dimension mismatch in Qdrant collection '{collection_name}' (expected: {len(query_vector)}, collection size: {existing_dim}).")
        except Exception as e:
            log_error("Qdrant retriever semantic search failed. Falling back to mock RAG context.", exc=e)
            
        # Fallback Mock RAG if no chunks retrieved but sources assigned
        if not chunks and knowledge_sources:
            for source in knowledge_sources[:2]:
                if "Refund" in source:
                    chunks.append(f"Source: {source}\nContent: Customers can request a full refund within 14 days of purchase. Refunds take 3-5 business days to process on the original payment method.")
                elif "Manual" in source:
                    chunks.append(f"Source: {source}\nContent: To access advanced metrics in the dashboard, navigate to Settings > API and generate a new access token.")
                else:
                    chunks.append(f"Source: {source}\nContent: Standard operational rules apply. Operating hours are 9:00 AM to 5:00 PM EST, Monday through Friday.")
                cited.append(source)

        context_str = "\n\n".join(chunks)
        return context_str, cited
