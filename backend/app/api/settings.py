from fastapi import APIRouter, Depends
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.settings_service import SettingsService
from app.schemas.settings import ProviderConfigResponse, ProviderConfigUpdate, TestConnectionResponse
from typing import List

router = APIRouter()

@router.get("/providers", response_model=List[ProviderConfigResponse])
async def get_providers(workspace_id: str = Depends(get_user_workspace_id)):
    """Retrieves all provider states (logo links, connection statuses, masked keys)."""
    return await SettingsService.get_provider_settings(workspace_id)

@router.post("/providers/{provider_name}/test-save", response_model=TestConnectionResponse)
async def test_and_save_provider(
    provider_name: str,
    payload: ProviderConfigUpdate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """
    Validates API key credentials by calling provider endpoints, 
    and commits them to Firestore settings ONLY if validation passes.
    """
    return await SettingsService.test_and_save_provider(
        workspace_id=workspace_id,
        provider_name=provider_name,
        config_data=payload.model_dump()
    )
