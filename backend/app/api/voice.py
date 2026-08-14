from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.voice_service import VoiceService
from app.schemas.voice import VoiceProfileResponse, VoiceProfileCreate, VoiceCloneRequest
from typing import List

router = APIRouter()

@router.get("/voices", response_model=List[VoiceProfileResponse])
async def list_voices(workspace_id: str = Depends(get_user_workspace_id)):
    """Exposes all available synthesized and custom-cloned voice profiles."""
    return await VoiceService.list_voices(workspace_id)

@router.post("/voices", response_model=VoiceProfileResponse)
async def create_voice_profile(
    payload: VoiceProfileCreate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Registers a synthesized voice template profile."""
    return await VoiceService.create_voice_profile(workspace_id, payload.model_dump())

@router.post("/voices/clone", response_model=VoiceProfileResponse)
async def clone_voice_profile(
    payload: VoiceCloneRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Creates a custom cloned voice using a speech metadata sample."""
    return await VoiceService.clone_voice_metadata(
        workspace_id=workspace_id,
        name=payload.name,
        sample_url=payload.sample_file_url,
        provider=payload.provider
    )
