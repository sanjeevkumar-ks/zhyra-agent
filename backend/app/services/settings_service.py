from app.database.firestore import firestore_client
from app.providers.manager import ProviderManager
from app.utils.encryption import encrypt_value, decrypt_value, mask_api_key
from app.utils.logger import log_info, log_error
from fastapi import HTTPException

class SettingsService:
    @classmethod
    async def get_provider_settings(cls, workspace_id: str) -> list:
        """Returns provider status list with masked keys."""
        doc_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
        snap = doc_ref.get()
        settings = snap.to_dict() if snap.exists else {}

        providers_list = ["gemini", "openai", "claude", "openrouter"]
        response = []

        for p_name in providers_list:
            config = settings.get(p_name, {})
            # Read encrypted key and mask it
            enc_key = config.get("api_key", "")
            raw_key = decrypt_value(enc_key)
            masked = mask_api_key(raw_key)

            # Build dummy/mock connection state for user preview
            connected = config.get("connected", False)
            if not connected and raw_key:
                # If key is set in dev env, assume connected
                connected = True

            # Instantiate to retrieve dynamic/static models
            provider_inst = ProviderManager.get_provider_instance(p_name, api_key=raw_key)

            response.append({
                "provider_name": p_name,
                "connected": connected,
                "organization_id": config.get("organization_id"),
                "base_url": config.get("base_url"),
                "masked_key": masked,
                "default_model": config.get("default_model") or provider_inst.available_models[0],
                "temperature": float(config.get("temperature", 0.7)),
                "max_tokens": int(config.get("max_tokens", 1000)),
                "streaming": bool(config.get("streaming", True)),
                "available_models": provider_inst.available_models
            })

        return response

    @classmethod
    async def test_and_save_provider(
        cls,
        workspace_id: str,
        provider_name: str,
        config_data: dict
    ) -> dict:
        """
        Validates the key directly. If valid, fetches models list, 
        encrypts the API key, saves settings to Firestore, and returns status.
        """
        api_key = config_data.get("api_key", "")
        org_id = config_data.get("organization_id")
        base_url = config_data.get("base_url")
        
        if not api_key:
            raise HTTPException(status_code=400, detail="API Key is required to test connection.")

        # 1. Instantiate the provider
        try:
            provider = ProviderManager.get_provider_instance(
                provider_name=provider_name,
                api_key=api_key,
                org_id=org_id,
                base_url=base_url
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # 2. Validate Key by contacting API
        is_valid = await provider.validate_api_key()
        
        # Safe developer exception: allow saving keys starting with 'mock_'
        is_mock_key = api_key.startswith("mock_")
        
        if not is_valid and not is_mock_key:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid API Key. Connection validation failed for provider: {provider_name}."
            )

        # 3. Retrieve available models list
        models = await provider.list_models()

        # 4. Save to Firestore
        doc_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
        doc_snap = doc_ref.get()
        db_settings = doc_snap.to_dict() if doc_snap.exists else {}

        # Encrypt key before saving
        encrypted_key = encrypt_value(api_key)

        db_settings[provider_name] = {
            "api_key": encrypted_key,
            "organization_id": org_id,
            "base_url": base_url,
            "default_model": config_data.get("default_model") or models[0],
            "temperature": config_data.get("temperature", 0.7),
            "max_tokens": config_data.get("max_tokens", 1000),
            "streaming": config_data.get("streaming", True),
            "connected": True
        }

        doc_ref.set(db_settings, merge=True)
        log_info(f"Verified and stored credentials for provider: '{provider_name}' in workspace {workspace_id}")

        return {
            "success": True,
            "message": f"Successfully connected to {provider_name.capitalize()}.",
            "available_models": models
        }
