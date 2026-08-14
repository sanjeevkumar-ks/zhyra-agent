from app.database.firestore import firestore_client
from app.database.r2 import storage_client
from fastapi import HTTPException, BackgroundTasks
from app.utils.logger import log_info, log_error
import uuid
import time

class KnowledgeService:
    @staticmethod
    async def list_documents(workspace_id: str, folder: str = None) -> list:
        coll = firestore_client.collection("documents")
        docs = coll.stream()
        results = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                if folder and folder != "All Documents":
                    if data.get("folder") == folder:
                        results.append(data)
                else:
                    results.append(data)
        return results

    @staticmethod
    async def list_folders(workspace_id: str) -> list:
        # Fetch workspace profile to get custom folders
        ws_ref = firestore_client.collection("workspaces").document(workspace_id)
        snap = ws_ref.get()
        if snap.exists:
            folders = snap.to_dict().get("knowledge_folders", [])
            if folders:
                return folders
        # Default folders if empty
        return ["All Documents", "Policies", "Product", "Support Macros", "Legal", "Onboarding"]

    @staticmethod
    async def create_folder(workspace_id: str, folder_name: str) -> list:
        ws_ref = firestore_client.collection("workspaces").document(workspace_id)
        snap = ws_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail="Workspace not found.")
            
        folders = snap.to_dict().get("knowledge_folders", [])
        if not folders:
            folders = ["All Documents", "Policies", "Product", "Support Macros", "Legal", "Onboarding"]
            
        if folder_name not in folders:
            folders.append(folder_name)
            ws_ref.update({"knowledge_folders": folders})
            
        return folders

    @classmethod
    async def upload_document(
        cls,
        workspace_id: str,
        file_name: str,
        file_content: bytes,
        content_type: str,
        folder: str,
        background_tasks: BackgroundTasks
    ) -> dict:
        """
        1. Uploads binary data to R2.
        2. Adds record to Firestore in "indexing" state.
        3. Spawns background worker to extract text, compute embeddings, and insert to Qdrant.
        """
        # 1. Upload to R2 (or local fallback)
        try:
            r2_url = storage_client.upload_file(
                file_content=file_content,
                file_name=f"{workspace_id}/{uuid.uuid4().hex}_{file_name}",
                content_type=content_type
            )
        except Exception as e:
            log_error("File upload to R2 failed", exc=e)
            raise HTTPException(status_code=500, detail="Failed to write document to storage bucket.")

        # 2. Add Firestore record
        doc_id = f"doc_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("documents").document(doc_id)
        
        # Calculate human-readable size
        size_bytes = len(file_content)
        if size_bytes < 1024:
            size_str = f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            size_str = f"{size_bytes / 1024:.1f} KB"
        else:
            size_str = f"{size_bytes / (1024*1024):.1f} MB"

        doc_data = {
            "id": doc_id,
            "workspace_id": workspace_id,
            "title": file_name,
            "type": cls._get_doc_type(file_name, content_type),
            "folder": folder or "All Documents",
            "size": size_str,
            "updated": "Indexing...",
            "usage": 0,
            "status": "indexing",
            "storage_url": r2_url
        }
        
        doc_ref.set(doc_data)
        log_info(f"Metadata document {doc_id} created in Firestore. Triggering indexing background job.")

        # 3. Schedule indexing task in background
        from app.workers.tasks import process_and_index_document
        background_tasks.add_task(
            process_and_index_document,
            workspace_id=workspace_id,
            doc_id=doc_id,
            file_name=file_name,
            file_content=file_content
        )

        return doc_data

    @staticmethod
    def _get_doc_type(file_name: str, content_type: str) -> str:
        name_lower = file_name.lower()
        if name_lower.endswith(".pdf") or "pdf" in content_type:
            return "PDF"
        elif name_lower.endswith(".txt") or "text" in content_type:
            return "Doc"
        elif name_lower.endswith(".html") or "html" in content_type:
            return "URL"
        return "FAQ"

    @staticmethod
    async def delete_document(workspace_id: str, doc_id: str) -> None:
        doc_ref = firestore_client.collection("documents").document(doc_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail="Document not found.")
            
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized.")

        # Delete from R2
        storage_url = data.get("storage_url", "")
        if storage_url:
            try:
                # Extract filename from URL key path
                key = storage_url.split("/")[-1]
                storage_client.delete_file(f"{workspace_id}/{key}")
            except Exception as e:
                log_error(f"Failed to delete file from storage bucket: {storage_url}", exc=e)

        # Delete from Qdrant vectors
        try:
            from app.database.qdrant import qdrant_client
            # Qdrant supports filtering by payload attributes
            collection_name = f"knowledge_{workspace_id}"
            collections = qdrant_client.get_collections().collections
            if any(col.name == collection_name for col in collections):
                # Import filter models from qdrant
                from qdrant_client.http import models as qmodels
                qdrant_client.delete(
                    collection_name=collection_name,
                    points_selector=qmodels.FilterSelector(
                        filter=qmodels.Filter(
                            must=[
                                qmodels.FieldCondition(
                                    key="document_id",
                                    match=qmodels.MatchValue(value=doc_id)
                                )
                            ]
                        )
                    )
                )
                log_info(f"Deleted vector points matching document_id={doc_id} in collection {collection_name}")
        except Exception as e:
            log_error(f"Failed to clear Qdrant vectors for doc {doc_id}", exc=e)

        # Delete from Firestore
        doc_ref.delete()
        log_info(f"Document {doc_id} completely removed from system.")
