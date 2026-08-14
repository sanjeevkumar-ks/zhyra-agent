from pydantic import BaseModel, Field
from typing import Optional, List

class VoiceProfileBase(BaseModel):
    name: str
    provider: str = "ElevenLabs"  # "ElevenLabs" | "Atlas Voice" | "OpenAI Voice"
    gender: str = "Neutral"  # "Male" | "Female" | "Neutral"
    description: Optional[str] = None
    preview_url: Optional[str] = None

class VoiceProfileCreate(VoiceProfileBase):
    pass

class VoiceCloneRequest(BaseModel):
    name: str
    sample_file_url: str  # metadata file URL
    provider: str = "ElevenLabs"

class VoiceProfileResponse(VoiceProfileBase):
    id: str
    workspace_id: str
    status: str = "ready"  # "ready" | "processing"
    is_custom: bool = False

    class Config:
        from_attributes = True
