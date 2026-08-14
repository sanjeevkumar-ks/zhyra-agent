import json
from typing import AsyncGenerator, List, Dict, Any
import httpx
from app.providers.base_provider import LLMProvider
from app.utils.logger import log_error, log_info

class OpenRouterProvider(LLMProvider):
    def __init__(self, api_key: str = "", base_url: str = None, custom_models: List[str] = None):
        self.api_key = api_key
        self.base_url = base_url or "https://openrouter.ai/api/v1"
        self._custom_models = custom_models or []

    @property
    def name(self) -> str:
        return "openrouter"

    @property
    def available_models(self) -> List[str]:
        # Merge standard default models with user-defined custom models
        defaults = [
            "meta-llama/llama-3-8b-instruct:free",
            "mistralai/mistral-7b-instruct:free",
            "gryphe/mythomax-l2-13b",
            "openai/gpt-4o"
        ]
        # Append unique custom models
        for m in self._custom_models:
            if m not in defaults:
                defaults.append(m)
        return defaults

    @property
    def supports_streaming(self) -> bool:
        return True

    @property
    def supports_vision(self) -> bool:
        return True

    @property
    def supports_functions(self) -> bool:
        return True

    @property
    def supports_embeddings(self) -> bool:
        # OpenRouter supports completion endpoints, not standard embedding pipelines
        return False

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Atlas AI OS"
        }

    async def validate_api_key(self) -> bool:
        if not self.api_key or self.api_key.startswith("mock_"):
            return False
        try:
            url = f"{self.base_url}/auth/key"
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, headers=self._get_headers())
                return res.status_code == 200
        except Exception as e:
            log_error("Failed to validate OpenRouter API key", exc=e)
            return False

    async def list_models(self) -> List[str]:
        if not self.api_key or self.api_key.startswith("mock_"):
            return self.available_models
        try:
            url = f"{self.base_url}/models"
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, headers=self._get_headers())
                if res.status_code == 200:
                    data = res.json()
                    models = [m["id"] for m in data.get("data", [])]
                    return models if models else self.available_models
        except Exception as e:
            log_error("Error listing OpenRouter models", exc=e)
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
        model = model or "meta-llama/llama-3-8b-instruct:free"
        
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("OpenRouter provider running in mock mode.")
            return f"[OpenRouter Mock Response - model: {model}]\nHi! This is a mock response from OpenRouter routing engine."

        url = f"{self.base_url}/chat/completions"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers())
                if res.status_code != 200:
                    raise Exception(f"OpenRouter API returned status {res.status_code}: {res.text}")
                
                data = res.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            log_error("OpenRouter API execution failed", exc=e)
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
        model = model or "meta-llama/llama-3-8b-instruct:free"
        
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("OpenRouter provider streaming in mock mode.")
            mock_text = f"[OpenRouter Mock Stream - model: {model}] Querying OpenRouter network..."
            for chunk in mock_text.split(" "):
                yield chunk + " "
            return

        url = f"{self.base_url}/chat/completions"
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, json=payload, headers=self._get_headers()) as response:
                    if response.status_code != 200:
                        raise Exception(f"OpenRouter API returned status {response.status_code}")
                    
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
            log_error("OpenRouter API streaming execution failed", exc=e)
            yield f"\n[Streaming error: {str(e)}]"

    async def embeddings(self, text: str) -> List[float]:
        return [0.0] * 1536
