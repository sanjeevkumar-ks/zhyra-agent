from fastapi import APIRouter, Depends, HTTPException
from app.providers.manager import ProviderManager
from app.api.workspaces import get_user_workspace_id
from app.database.firestore import firestore_client
from app.utils.encryption import encrypt_value
from pydantic import BaseModel
from typing import List, Dict, Any

router = APIRouter()

class KeyConfigRequest(BaseModel):
    provider: str
    api_key: str

class NvidiaModelEndpointRequest(BaseModel):
    model_name: str
    api_key: str
    base_url: str

class OpenRouterModelRequest(BaseModel):
    model_name: str

@router.get("")
async def list_available_providers(workspace_id: str = Depends(get_user_workspace_id)):
    """Lists static properties and functional capabilities for all supported providers."""
    providers_list = ["gemini", "openai", "claude", "openrouter", "nvidia"]
    response = []
    
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    settings_data = snap.to_dict() if snap.exists else {}
    
    for p_name in providers_list:
        if p_name == "nvidia":
            raw_models = settings_data.get("nvidia", {}).get("models", {})
            models_config = {m_name: {} for m_name in raw_models.keys()}
            inst = ProviderManager.get_provider_instance(p_name, api_key=models_config)
        elif p_name == "openrouter":
            raw_cfg = settings_data.get("openrouter", {})
            config_payload = {
                "api_key": raw_cfg.get("api_key", ""),
                "custom_models": raw_cfg.get("custom_models", [])
            }
            inst = ProviderManager.get_provider_instance(p_name, api_key=config_payload)
        else:
            inst = ProviderManager.get_provider_instance(p_name, api_key="")
            
        response.append({
            "name": inst.name,
            "available_models": inst.available_models,
            "supports_streaming": inst.supports_streaming,
            "supports_vision": inst.supports_vision,
            "supports_function_calling": inst.supports_functions,
            "supports_embeddings": inst.supports_embeddings
        })
        
    return response

@router.get("/config")
async def get_provider_config(workspace_id: str = Depends(get_user_workspace_id)):
    """Retrieves Boolean flags indicating whether keys are saved for each provider."""
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    data = snap.to_dict() if snap.exists else {}
    
    config_flags = {}
    for p in ["gemini", "openai", "claude", "openrouter", "nvidia"]:
        p_config = data.get(p, {})
        has_key = bool(p_config.get("api_key") or p_config.get("models"))
        config_flags[p] = has_key
    return config_flags

@router.post("/keys")
async def save_provider_key(
    payload: KeyConfigRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Encrypts and persists the API key configuration for a specific provider in Firestore."""
    provider_name = payload.provider.lower()
    if provider_name not in ["gemini", "openai", "claude", "openrouter", "nvidia"]:
        raise HTTPException(status_code=400, detail="Unsupported AI provider name.")
        
    encrypted_key = encrypt_value(payload.api_key)
    
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    existing_data = snap.to_dict() if snap.exists else {}
    
    provider_config = existing_data.get(provider_name, {})
    provider_config["api_key"] = encrypted_key
    
    existing_data[provider_name] = provider_config
    settings_ref.set(existing_data, merge=True)
    
    return {"status": "success", "message": f"Successfully updated key configuration for {payload.provider}."}

@router.post("/test-connection")
async def test_provider_connection(
    payload: KeyConfigRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Validates the input API key with the provider. Bypasses check for mock credentials."""
    provider_name = payload.provider.lower()
    if provider_name not in ["gemini", "openai", "claude", "openrouter", "nvidia"]:
        raise HTTPException(status_code=400, detail="Unsupported AI provider name.")
        
    if payload.api_key.startswith("mock_") or payload.api_key == "default-key" or payload.api_key == "test-key":
        return {"status": "success", "message": "Connection validation bypassed for mock credentials."}
        
    try:
        inst = ProviderManager.get_provider_instance(provider_name, api_key=payload.api_key)
        is_valid = await inst.validate_api_key()
        if is_valid:
            return {"status": "success", "message": "Connection check passed successfully."}
        else:
            return {"status": "error", "message": "The API key was rejected by the provider validation check."}
    except Exception as e:
        return {"status": "error", "message": f"Validation failed: {str(e)}"}

@router.get("/nvidia/models")
async def list_nvidia_models(workspace_id: str = Depends(get_user_workspace_id)):
    """Lists configured NVIDIA model endpoints with masked API keys."""
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    data = snap.to_dict() if snap.exists else {}
    
    nvidia_config = data.get("nvidia", {})
    raw_models = nvidia_config.get("models", {})
    
    result = []
    for model_name, m_cfg in raw_models.items():
        result.append({
            "model_name": model_name,
            "base_url": m_cfg.get("base_url", "https://integrate.api.nvidia.com/v1"),
            "api_key": "••••••••••••••••" if m_cfg.get("api_key") else ""
        })
    return result

@router.post("/nvidia/models")
async def save_nvidia_model(
    payload: NvidiaModelEndpointRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Encrypts and registers a model-specific endpoint configuration for NVIDIA."""
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    existing_data = snap.to_dict() if snap.exists else {}
    
    nvidia_config = existing_data.get("nvidia", {})
    raw_models = nvidia_config.get("models", {})
    
    encrypted_key = encrypt_value(payload.api_key)
    
    raw_models[payload.model_name] = {
        "api_key": encrypted_key,
        "base_url": payload.base_url
    }
    
    nvidia_config["models"] = raw_models
    existing_data["nvidia"] = nvidia_config
    
    settings_ref.set(existing_data, merge=True)
    return {"status": "success", "message": f"Successfully configured NVIDIA model endpoint for {payload.model_name}."}

@router.delete("/nvidia/models/{model_name:path}")
async def delete_nvidia_model(
    model_name: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Deletes a model-specific configuration mapping from the NVIDIA provider config."""
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="AI Provider settings not found.")
    
    existing_data = snap.to_dict()
    nvidia_config = existing_data.get("nvidia", {})
    raw_models = nvidia_config.get("models", {})
    
    if model_name not in raw_models:
        raise HTTPException(status_code=404, detail=f"NVIDIA Model {model_name} not configured.")
        
    del raw_models[model_name]
    nvidia_config["models"] = raw_models
    existing_data["nvidia"] = nvidia_config
    
    settings_ref.set(existing_data, merge=True)
    return {"status": "success", "message": f"Successfully deleted model endpoint for {model_name}."}

@router.get("/openrouter/models")
async def list_openrouter_custom_models(workspace_id: str = Depends(get_user_workspace_id)):
    """Lists configured custom OpenRouter models."""
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    data = snap.to_dict() if snap.exists else {}
    
    or_config = data.get("openrouter", {})
    return or_config.get("custom_models", [])

@router.post("/openrouter/models")
async def add_openrouter_custom_model(
    payload: OpenRouterModelRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Registers a custom model for OpenRouter in settings."""
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    existing_data = snap.to_dict() if snap.exists else {}
    
    or_config = existing_data.get("openrouter", {})
    custom_models = or_config.get("custom_models", [])
    
    if payload.model_name not in custom_models:
        custom_models.append(payload.model_name)
        
    or_config["custom_models"] = custom_models
    existing_data["openrouter"] = or_config
    
    settings_ref.set(existing_data, merge=True)
    return {"status": "success", "message": f"Successfully registered OpenRouter custom model: {payload.model_name}"}

@router.delete("/openrouter/models/{model_name:path}")
async def delete_openrouter_custom_model(
    model_name: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Deletes a custom model name from the OpenRouter configuration settings."""
    settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
    snap = settings_ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="AI Provider settings not found.")
        
    existing_data = snap.to_dict()
    or_config = existing_data.get("openrouter", {})
    custom_models = or_config.get("custom_models", [])
    
    if model_name not in custom_models:
        raise HTTPException(status_code=404, detail=f"Custom model {model_name} not found.")
        
    custom_models.remove(model_name)
    or_config["custom_models"] = custom_models
    existing_data["openrouter"] = or_config
    
    settings_ref.set(existing_data, merge=True)
    return {"status": "success", "message": f"Successfully removed custom model: {model_name} from OpenRouter."}

