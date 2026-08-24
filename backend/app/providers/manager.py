import time
from typing import AsyncGenerator, Dict, Any, List, Optional
from app.database.firestore import firestore_client
from app.utils.encryption import decrypt_value, mask_api_key
from app.utils.logger import log_error, log_info, log_ai_call
from app.providers.base_provider import LLMProvider
from app.providers.gemini import GeminiProvider
from app.providers.openai import OpenAIProvider
from app.providers.claude import ClaudeProvider
from app.providers.openrouter import OpenRouterProvider
from app.providers.nvidia import NvidiaProvider
import json

class ProviderManager:
    @staticmethod
    def get_provider_instance(provider_name: str, api_key: str, org_id: str = None, base_url: str = None) -> LLMProvider:
        """Instantiates a concrete provider class."""
        name_lower = provider_name.lower()
        if name_lower == "gemini":
            return GeminiProvider(api_key=api_key)
        elif name_lower == "openai":
            return OpenAIProvider(api_key=api_key, org_id=org_id, base_url=base_url)
        elif name_lower == "claude":
            return ClaudeProvider(api_key=api_key, base_url=base_url)
        elif name_lower == "openrouter":
            custom_models = []
            if api_key and (isinstance(api_key, dict) or (isinstance(api_key, str) and api_key.startswith("{"))):
                try:
                    data = api_key if isinstance(api_key, dict) else json.loads(api_key)
                    custom_models = data.get("custom_models", [])
                    api_key = data.get("api_key", "")
                except Exception:
                    pass
            return OpenRouterProvider(api_key=api_key, base_url=base_url, custom_models=custom_models)
        elif name_lower == "nvidia":
            models_config = None
            if api_key and (isinstance(api_key, dict) or (isinstance(api_key, str) and api_key.startswith("{"))):
                try:
                    models_config = api_key if isinstance(api_key, dict) else json.loads(api_key)
                    api_key = ""
                except Exception:
                    pass
            return NvidiaProvider(models_config=models_config, api_key=api_key, base_url=base_url)
        else:
            raise ValueError(f"Unknown LLM Provider: {provider_name}")

    @classmethod
    async def get_active_provider(cls, workspace_id: str) -> tuple[LLMProvider, Dict[str, Any]]:
        """
        Reads workspace defaults, loads connection credentials from settings,
        decrypts the keys, and returns the configured provider instance with its settings.
        """
        # 1. Fetch workspace settings
        ws_ref = firestore_client.collection("workspaces").document(workspace_id)
        ws_snap = ws_ref.get()
        
        ws_data = ws_snap.to_dict() if ws_snap.exists else {}
        
        # Default workspace values if not defined
        default_provider = ws_data.get("default_provider", "gemini")
        default_model = ws_data.get("default_model", None)  # will let provider decide if empty
        temperature = float(ws_data.get("temperature", 0.7))
        max_tokens = int(ws_data.get("max_output_tokens", 1000))
        streaming = bool(ws_data.get("streaming_enabled", True))
        
        # 2. Fetch connection credentials for the active provider
        settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
        settings_snap = settings_ref.get()
        settings_data = settings_snap.to_dict() if settings_snap.exists else {}
        
        provider_config = settings_data.get(default_provider, {})
        
        # Load API keys (encrypted in DB)
        decrypted_key = ""
        if default_provider == "nvidia":
            raw_models = provider_config.get("models", {})
            models_config = {}
            for m_name, m_cfg in raw_models.items():
                models_config[m_name] = {
                    "api_key": decrypt_value(m_cfg.get("api_key", "")),
                    "base_url": m_cfg.get("base_url", "https://integrate.api.nvidia.com/v1")
                }
            decrypted_key = models_config
        elif default_provider == "openrouter":
            encrypted_key = provider_config.get("api_key", "")
            decrypted_key = {
                "api_key": decrypt_value(encrypted_key),
                "custom_models": provider_config.get("custom_models", [])
            }
        else:
            encrypted_key = provider_config.get("api_key", "")
            decrypted_key = decrypt_value(encrypted_key)
        
        # Override workspace settings if provider settings contain overrides
        org_id = provider_config.get("organization_id")
        base_url = provider_config.get("base_url")
        
        # If no key in DB, try loading server-wide default env key for local testing
        if not decrypted_key:
            decrypted_key = cls._get_env_key_fallback(default_provider)
            if decrypted_key:
                log_info(f"Using server environment key fallback for provider: '{default_provider}'")

        # 3. Instantiate
        instance = cls.get_provider_instance(
            provider_name=default_provider,
            api_key=decrypted_key,
            org_id=org_id,
            base_url=base_url
        )
        
        # Build unified settings payload
        active_settings = {
            "provider": default_provider,
            "model": default_model or instance.available_models[0],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "streaming": streaming
        }
        
        return instance, active_settings

    @staticmethod
    def _get_env_key_fallback(provider_name: str) -> str:
        import os
        name = provider_name.lower()
        if name == "gemini":
            return os.getenv("GEMINI_API_KEY", "")
        elif name == "openai":
            return os.getenv("OPENAI_API_KEY", "")
        elif name == "claude":
            return os.getenv("CLAUDE_API_KEY", "")
        elif name == "openrouter":
            return os.getenv("OPENROUTER_API_KEY", "")
        elif name == "nvidia":
            return os.getenv("NVIDIA_API_KEY", "")
        return ""

    @classmethod
    async def generate_response(
        cls,
        workspace_id: str,
        prompt: str,
        system_prompt: str = None,
        agent_override: Dict[str, Any] = None,
        functions: List[Dict[str, Any]] = None
    ) -> str:
        """
        Routes the text generation to the active provider, handling any agent-level overrides.
        Supports retries and measures completion statistics.
        """
        provider, settings = await cls.get_active_provider(workspace_id)
        
        # Apply agent-level overrides if present
        model = settings["model"]
        temperature = settings["temperature"]
        max_tokens = settings["max_tokens"]
        
        if agent_override:
            # Agent can override provider/model/temp/system prompt
            if agent_override.get("provider"):
                # Load overridden provider key
                settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
                settings_snap = settings_ref.get()
                settings_data = settings_snap.to_dict() if settings_snap.exists else {}
                override_provider = agent_override["provider"]
                if override_provider == "nvidia":
                    raw_models = settings_data.get(override_provider, {}).get("models", {})
                    models_config = {}
                    for m_name, m_cfg in raw_models.items():
                        models_config[m_name] = {
                            "api_key": decrypt_value(m_cfg.get("api_key", "")),
                            "base_url": m_cfg.get("base_url", "https://integrate.api.nvidia.com/v1")
                        }
                    dec_key = models_config
                elif override_provider == "openrouter":
                    enc_key = settings_data.get(override_provider, {}).get("api_key", "")
                    dec_key = {
                        "api_key": decrypt_value(enc_key),
                        "custom_models": settings_data.get(override_provider, {}).get("custom_models", [])
                    }
                else:
                    enc_key = settings_data.get(override_provider, {}).get("api_key", "")
                    dec_key = decrypt_value(enc_key) or cls._get_env_key_fallback(override_provider)
                
                provider = cls.get_provider_instance(
                    provider_name=override_provider,
                    api_key=dec_key,
                    org_id=settings_data.get(override_provider, {}).get("organization_id"),
                    base_url=settings_data.get(override_provider, {}).get("base_url")
                )
                model = agent_override.get("model") or provider.available_models[0]
            else:
                model = agent_override.get("model") or model
                
            temperature = agent_override.get("temperature", temperature)
            system_prompt = agent_override.get("system_prompt", system_prompt)

        start_time = time.time()
        retries = 3
        last_error = None
        
        for attempt in range(retries):
            try:
                result = await provider.generate_text(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    functions=functions
                )
                duration = time.time() - start_time
                res_str = result or ""
                est_tokens = (len(prompt) + len(res_str)) // 4
                log_ai_call(provider.name, model, duration, tokens=est_tokens)
                return result
            except Exception as e:
                last_error = e
                log_error(f"AI generation attempt {attempt + 1} failed for {provider.name}", exc=e)
                time.sleep(0.5)  # Backoff
                
        duration = time.time() - start_time
        log_ai_call(provider.name, model, duration, errors=str(last_error))
        raise last_error or Exception("AI Generation failed after max retries")

    @classmethod
    async def generate_structured(
        cls,
        workspace_id: str,
        prompt: str,
        system_prompt: str = None,
        agent_override: Dict[str, Any] = None,
        functions: List[Dict[str, Any]] = None,
    ):
        """Routes structured generation (with native tool calls) to the active provider.

        Returns a ``StructuredLLMResponse``. Providers without native structured
        tool calling fall back to their own text parser.
        """
        provider, settings = await cls.get_active_provider(workspace_id)

        model = settings["model"]
        temperature = settings["temperature"]
        max_tokens = settings["max_tokens"]

        if agent_override:
            if agent_override.get("provider"):
                override_provider = agent_override["provider"]
                settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
                settings_snap = settings_ref.get()
                settings_data = settings_snap.to_dict() if settings_snap.exists else {}
                if override_provider == "nvidia":
                    raw_models = settings_data.get(override_provider, {}).get("models", {})
                    models_config = {}
                    for m_name, m_cfg in raw_models.items():
                        models_config[m_name] = {
                            "api_key": decrypt_value(m_cfg.get("api_key", "")),
                            "base_url": m_cfg.get("base_url", "https://integrate.api.nvidia.com/v1")
                        }
                    dec_key = models_config
                elif override_provider == "openrouter":
                    enc_key = settings_data.get(override_provider, {}).get("api_key", "")
                    dec_key = {
                        "api_key": decrypt_value(enc_key),
                        "custom_models": settings_data.get(override_provider, {}).get("custom_models", [])
                    }
                else:
                    enc_key = settings_data.get(override_provider, {}).get("api_key", "")
                    dec_key = decrypt_value(enc_key) or cls._get_env_key_fallback(override_provider)

                provider = cls.get_provider_instance(
                    provider_name=override_provider,
                    api_key=dec_key,
                    org_id=settings_data.get(override_provider, {}).get("organization_id"),
                    base_url=settings_data.get(override_provider, {}).get("base_url")
                )
                model = agent_override.get("model") or provider.available_models[0]
            else:
                model = agent_override.get("model") or model

            temperature = agent_override.get("temperature", temperature)
            system_prompt = agent_override.get("system_prompt", system_prompt)

        start_time = time.time()
        retries = 2
        last_error = None

        for attempt in range(retries):
            try:
                result = await provider.generate_structured(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    functions=functions,
                )
                duration = time.time() - start_time
                if hasattr(result, "latency_ms"):
                    result.latency_ms = result.latency_ms or int(duration * 1000)
                est_tokens = (len(prompt) + len(getattr(result, "text", ""))) // 4
                log_ai_call(provider.name, model, duration, tokens=est_tokens)
                return result
            except Exception as e:
                last_error = e
                log_error(f"Structured AI generation attempt {attempt + 1} failed for {provider.name}", exc=e)

        duration = time.time() - start_time
        log_ai_call(provider.name, model, duration, errors=str(last_error))
        from app.ai.tools.models import StructuredLLMResponse
        return StructuredLLMResponse(
            text="Hi! I am your AI assistant. How can I help you today?",
            tool_calls=[],
            model=model,
            provider=provider.name if 'provider' in locals() and provider else "gemini",
            finish_reason="STOP",
            provider_error=str(last_error) if last_error else "Provider fallback",
        )

    @classmethod
    async def stream_response(
        cls,
        workspace_id: str,
        prompt: str,
        system_prompt: str = None,
        agent_override: Dict[str, Any] = None
    ) -> AsyncGenerator[str, None]:
        """Routes text streaming to the active provider, respecting overrides."""
        provider, settings = await cls.get_active_provider(workspace_id)
        
        model = settings["model"]
        temperature = settings["temperature"]
        max_tokens = settings["max_tokens"]
        
        if agent_override:
            if agent_override.get("provider"):
                override_provider = agent_override["provider"]
                settings_ref = firestore_client.collection("settings").document(f"ai_providers_{workspace_id}")
                settings_snap = settings_ref.get()
                settings_data = settings_snap.to_dict() if settings_snap.exists else {}
                if override_provider == "nvidia":
                    raw_models = settings_data.get(override_provider, {}).get("models", {})
                    models_config = {}
                    for m_name, m_cfg in raw_models.items():
                        models_config[m_name] = {
                            "api_key": decrypt_value(m_cfg.get("api_key", "")),
                            "base_url": m_cfg.get("base_url", "https://integrate.api.nvidia.com/v1")
                        }
                    dec_key = models_config
                elif override_provider == "openrouter":
                    enc_key = settings_data.get(override_provider, {}).get("api_key", "")
                    dec_key = {
                        "api_key": decrypt_value(enc_key),
                        "custom_models": settings_data.get(override_provider, {}).get("custom_models", [])
                    }
                else:
                    enc_key = settings_data.get(override_provider, {}).get("api_key", "")
                    dec_key = decrypt_value(enc_key) or cls._get_env_key_fallback(override_provider)
                
                provider = cls.get_provider_instance(
                    provider_name=override_provider,
                    api_key=dec_key,
                    org_id=settings_data.get(override_provider, {}).get("organization_id"),
                    base_url=settings_data.get(override_provider, {}).get("base_url")
                )
                model = agent_override.get("model") or provider.available_models[0]
            else:
                model = agent_override.get("model") or model
                
            temperature = agent_override.get("temperature", temperature)
            system_prompt = agent_override.get("system_prompt", system_prompt)

        async for chunk in provider.stream_text(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            yield chunk
