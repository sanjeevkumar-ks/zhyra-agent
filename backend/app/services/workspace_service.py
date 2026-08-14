from app.database.firestore import firestore_client
from fastapi import HTTPException
from app.utils.logger import log_info, log_error

class WorkspaceService:
    @staticmethod
    async def get_workspace(workspace_id: str) -> dict:
        doc_ref = firestore_client.collection("workspaces").document(workspace_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Workspace {workspace_id} not found.")
        return snap.to_dict()

    @staticmethod
    async def update_workspace(workspace_id: str, update_data: dict) -> dict:
        doc_ref = firestore_client.collection("workspaces").document(workspace_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Workspace {workspace_id} not found.")
        
        # Filter out None values
        filtered_updates = {k: v for k, v in update_data.items() if v is not None}
        if filtered_updates:
            doc_ref.update(filtered_updates)
            log_info(f"Workspace {workspace_id} updated details: {list(filtered_updates.keys())}")
            
        return (doc_ref.get()).to_dict()

    @staticmethod
    async def update_ai_config(workspace_id: str, config_data: dict) -> dict:
        doc_ref = firestore_client.collection("workspaces").document(workspace_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Workspace {workspace_id} not found.")
        
        # Maps front-end input fields to Firestore fields
        updates = {
            "default_provider": config_data.get("default_provider"),
            "default_model": config_data.get("default_model"),
            "temperature": config_data.get("temperature"),
            "max_output_tokens": config_data.get("max_output_tokens"),
            "streaming_enabled": config_data.get("streaming_enabled")
        }
        filtered_updates = {k: v for k, v in updates.items() if v is not None}
        if filtered_updates:
            doc_ref.update(filtered_updates)
            log_info(f"Workspace {workspace_id} AI configuration updated.")
            
        return (doc_ref.get()).to_dict()
