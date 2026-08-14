from pydantic import BaseModel, Field
from typing import Optional, List

class FolderCreate(BaseModel):
    name: str

class KnowledgeDocBase(BaseModel):
    title: str
    type: str  # "PDF" | "Doc" | "URL" | "FAQ"
    folder: str = "All Documents"
    size: str = "—"

class KnowledgeDocCreate(KnowledgeDocBase):
    pass

class KnowledgeDocResponse(KnowledgeDocBase):
    id: str
    workspace_id: str
    updated: str
    usage: int = 0
    status: str = "indexing"  # "indexed" | "indexing" | "stale"

    class Config:
        from_attributes = True
