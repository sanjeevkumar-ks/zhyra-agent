import os
from qdrant_client import QdrantClient
from qdrant_client.http.models import Distance, VectorParams
from app.utils.logger import log_info, log_error

# Load environment configuration
QDRANT_HOST = os.getenv("QDRANT_HOST", "")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")

qdrant_client = None
is_qdrant_mock = False

try:
    if QDRANT_HOST and QDRANT_HOST.lower() not in ("none", "localhost", "127.0.0.1", ""):
        if QDRANT_HOST.startswith("http://") or QDRANT_HOST.startswith("https://"):
            qdrant_client = QdrantClient(
                url=QDRANT_HOST,
                api_key=QDRANT_API_KEY if QDRANT_API_KEY else None,
                timeout=3.0
            )
        else:
            qdrant_client = QdrantClient(
                host=QDRANT_HOST,
                port=QDRANT_PORT,
                api_key=QDRANT_API_KEY if QDRANT_API_KEY else None,
                timeout=3.0
            )
        # Test connection by listing collections
        qdrant_client.get_collections()
        log_info(f"Successfully connected to Qdrant vector database at {QDRANT_HOST}")
    else:
        raise ValueError("QDRANT_HOST is not configured with a remote cluster.")
except Exception as e:
    log_error("Failed to connect to external Qdrant server, falling back to local in-memory vector DB", exc=e)
    # Zero-config in-memory database
    qdrant_client = QdrantClient(":memory:")
    is_qdrant_mock = True
    log_info("Qdrant in-memory client initialized (local testing mode).")

def ensure_collection(collection_name: str, vector_size: int = 1536):
    """Ensures a collection exists in Qdrant with the appropriate vector dimension."""
    try:
        collections = qdrant_client.get_collections().collections
        exists = any(col.name == collection_name for col in collections)
        
        recreate = False
        if exists:
            col_info = qdrant_client.get_collection(collection_name)
            existing_dim = col_info.config.params.vectors.size
            if existing_dim != vector_size:
                log_info(f"Vector dimension mismatch (existing: {existing_dim}, new: {vector_size}). Recreating collection: '{collection_name}'")
                qdrant_client.delete_collection(collection_name)
                recreate = True
                
        if not exists or recreate:
            qdrant_client.create_collection(
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            log_info(f"Created Qdrant vector collection: '{collection_name}' (dim: {vector_size})")
            
        # Ensure payload index on 'document_title' exists for keyword filtering
        try:
            from qdrant_client.http import models as qmodels
            col_info = qdrant_client.get_collection(collection_name)
            if "document_title" not in col_info.payload_schema:
                qdrant_client.create_payload_index(
                    collection_name=collection_name,
                    field_name="document_title",
                    field_schema=qmodels.PayloadSchemaType.KEYWORD
                )
                log_info(f"Created keyword payload index on 'document_title' for collection '{collection_name}'")
        except Exception as e:
            log_error(f"Failed ensuring payload index for '{collection_name}'", exc=e)
            
    except Exception as e:
        log_error(f"Error validating/creating Qdrant collection: {collection_name}", exc=e)

def get_qdrant():
    """Dependency injection helper for Qdrant operations."""
    return qdrant_client
