import json
from typing import AsyncGenerator, List, Dict, Any
import httpx
from app.providers.base_provider import LLMProvider
from app.utils.logger import log_error, log_info

class NvidiaProvider(LLMProvider):
    def __init__(self, models_config: dict = None, api_key: str = "", base_url: str = ""):
        self.models_config = models_config or {}
        self.fallback_api_key = api_key
        self.fallback_base_url = base_url or "https://integrate.api.nvidia.com/v1"

    @property
    def name(self) -> str:
        return "nvidia"

    @property
    def available_models(self) -> List[str]:
        if self.models_config:
            return list(self.models_config.keys())
        return [
            "meta/llama-3.1-70b-instruct",
            "nvidia/llama-3.1-405b-instruct",
            "meta/llama3-70b-instruct"
        ]

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_vision(self) -> bool:
        return False

    @property
    def supports_functions(self) -> bool:
        return False

    @property
    def supports_embeddings(self) -> bool:
        return True

    def _get_config_for_model(self, model: str = None) -> tuple[str, str]:
        """Resolves the api_key and base_url for a given model, falling back to defaults."""
        api_key = ""
        base_url = ""

        if model and model in self.models_config:
            cfg = self.models_config[model]
            api_key = cfg.get("api_key", "")
            base_url = cfg.get("base_url", "")
        
        if not api_key:
            api_key = self.fallback_api_key
        if not base_url:
            base_url = self.fallback_base_url or "https://integrate.api.nvidia.com/v1"
            
        # Clean the base URL to prevent path errors (like double /chat/completions or missing /v1)
        base_url = base_url.strip()
        if "chat/completions" in base_url:
            base_url = base_url.split("chat/completions")[0]
        base_url = base_url.rstrip("/")
        
        # If the URL does not contain /v1 (and is not empty), append it to prevent routing 404s
        if base_url and not base_url.endswith("/v1") and "/v1" not in base_url:
            base_url = f"{base_url}/v1"
            
        return api_key, base_url

    def _get_headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    async def validate_api_key(self) -> bool:
        api_key, base_url = self._get_config_for_model()
        if not api_key or api_key.startswith("mock_"):
            return False
        
        try:
            url = f"{base_url.rstrip('/')}/chat/completions"
            model_name = self.available_models[0]
            payload = {
                "model": model_name,
                "messages": [{"role": "user", "content": "ping"}],
                "max_tokens": 1
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers(api_key))
                return res.status_code == 200
        except Exception as e:
            log_error("Failed to validate NVIDIA API key", exc=e)
            return False

    async def list_models(self) -> List[str]:
        return self.available_models

    async def generate_text(
        self,
        prompt: str,
        system_prompt: str = None,
        model: str = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        functions: List[Dict[str, Any]] = None
    ) -> str:
        target_model = model or self.available_models[0]
        api_key, base_url = self._get_config_for_model(target_model)

        if not api_key or api_key.startswith("mock_"):
            log_info(f"NVIDIA provider running in mock mode for model {target_model}.")
            return f"[NVIDIA Mock Response - model: {target_model}]\nI am ready to process queries. How can I assist you?"

        url = f"{base_url.rstrip('/')}/chat/completions"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": target_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers(api_key))
                if res.status_code != 200:
                    raise Exception(f"NVIDIA API returned status {res.status_code}: {res.text}")
                
                data = res.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            log_error(f"NVIDIA API execution failed for model {target_model}", exc=e)
            raise e

    async def stream_text(
        self,
        prompt: str,
        system_prompt: str = None,
        model: str = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        functions: List[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        target_model = model or self.available_models[0]
        api_key, base_url = self._get_config_for_model(target_model)

        if not api_key or api_key.startswith("mock_"):
            log_info(f"NVIDIA provider streaming in mock mode for model {target_model}.")
            mock_text = f"[NVIDIA Mock Stream - model: {target_model}] Resolving response data from model endpoint..."
            for chunk in mock_text.split(" "):
                yield chunk + " "
            return

        url = f"{base_url.rstrip('/')}/chat/completions"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": target_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, json=payload, headers=self._get_headers(api_key)) as response:
                    if response.status_code != 200:
                        err_body = await response.aread()
                        err_msg = err_body.decode('utf-8', errors='ignore')
                        raise Exception(f"NVIDIA API returned status {response.status_code}: {err_msg}")
                    
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:]
                            if data_str == "[DONE]":
                                break
                            try:
                                data_json = json.loads(data_str)
                                chunk_content = data_json["choices"][0]["delta"].get("content", "")
                                if chunk_content:
                                    yield chunk_content
                            except Exception:
                                pass
        except Exception as e:
            log_error(f"NVIDIA API streaming execution failed for model {target_model}", exc=e)
            yield f"\n[Streaming error: {str(e)}]"

    async def embeddings(self, text: str) -> List[float]:
        api_key, base_url = self._get_config_for_model()
        if not api_key or api_key.startswith("mock_"):
            return [0.08] * 1024

        url = f"{base_url.rstrip('/')}/embeddings"
        payload = {
            "input": [text],
            "model": "nvidia/embeddings-nv-embed-qa-4",
            "encoding_format": "float"
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers(api_key))
                if res.status_code == 200:
                    return res.json()["data"][0]["embedding"]
        except Exception as e:
            log_error("NVIDIA embedding API failed, using 1024-dim fallback", exc=e)
        return [0.0] * 1024
