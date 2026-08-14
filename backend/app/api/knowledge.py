from fastapi import APIRouter, Depends, UploadFile, File, Form, BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.knowledge_service import KnowledgeService
from app.schemas.knowledge import KnowledgeDocResponse, FolderCreate
from typing import List, Optional
import os

router = APIRouter()

@router.get("/documents", response_model=List[KnowledgeDocResponse])
async def list_documents(
    folder: Optional[str] = Query(None),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Lists knowledge documents, optionally filtered by folder name."""
    return await KnowledgeService.list_documents(workspace_id, folder)

@router.post("/documents", response_model=KnowledgeDocResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder: str = Form("All Documents"),
    workspace_id: str = Depends(get_user_workspace_id)
):
    """
    Uploads a document file (PDF, TXT, HTML) to R2 and kicks off 
    the text extraction & embedding chunking process in the background.
    """
    file_content = await file.read()
    return await KnowledgeService.upload_document(
        workspace_id=workspace_id,
        file_name=file.filename,
        file_content=file_content,
        content_type=file.content_type,
        folder=folder,
        background_tasks=background_tasks
    )

@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Deletes a document from storage, Firestore registry, and Qdrant vectors."""
    await KnowledgeService.delete_document(workspace_id, doc_id)
    return {"detail": f"Document {doc_id} successfully deleted."}

@router.get("/folders", response_model=List[str])
async def list_folders(workspace_id: str = Depends(get_user_workspace_id)):
    """Lists folders configured in this workspace."""
    return await KnowledgeService.list_folders(workspace_id)

@router.post("/folders", response_model=List[str])
async def create_folder(
    payload: FolderCreate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Registers a new custom folder path inside the knowledge base."""
    return await KnowledgeService.create_folder(workspace_id, payload.name)


# Fallback asset endpoint to serve local R2 files (PDFs, Audio previews) in dev
from app.database.r2 import LOCAL_STORAGE_DIR

@router.get("/static/{file_name}", tags=["Static Assets"])
async def serve_static_file(file_name: str):
    """Exposes files saved in local storage fallback directory (e.g. for previews)."""
    target_path = os.path.join(LOCAL_STORAGE_DIR, os.path.basename(file_name))
    
    # Also support a folder for previews
    preview_path = os.path.join(LOCAL_STORAGE_DIR, "previews", os.path.basename(file_name))
    
    if os.path.exists(target_path):
        return FileResponse(target_path)
    elif os.path.exists(preview_path):
        return FileResponse(preview_path)
        
    # Check if they request mock audio files, write placeholder to prevent browser errors
    if file_name.endswith(".mp3"):
        os.makedirs(os.path.join(LOCAL_STORAGE_DIR, "previews"), exist_ok=True)
        # Create empty mp3 file just to bypass browser errors
        with open(preview_path, "wb") as f:
            f.write(b"")
        return FileResponse(preview_path)
        
    raise HTTPException(status_code=404, detail="Requested file not found in local storage.")
