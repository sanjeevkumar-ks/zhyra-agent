import json
from typing import AsyncGenerator, List, Dict, Any
import httpx
from app.providers.base_provider import LLMProvider
from app.utils.logger import log_error, log_info

class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str = "", org_id: str = None, base_url: str = None):
        self.api_key = api_key
        self.org_id = org_id
        self.base_url = base_url or "https://api.openai.com/v1"

    @property
    def name(self) -> str:
        return "openai"

    @property
    def available_models(self) -> List[str]:
        return ["gpt-4o", "gpt-4o-mini", "o1-mini", "gpt-4-turbo"]

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
        return True

    def _get_headers(self) -> Dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        if self.org_id:
            headers["OpenAI-Organization"] = self.org_id
        return headers

    async def validate_api_key(self) -> bool:
        if not self.api_key or self.api_key.startswith("mock_"):
            return False
        try:
            url = f"{self.base_url}/models"
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, headers=self._get_headers())
                return res.status_code == 200
        except Exception as e:
            log_error("Failed to validate OpenAI API key", exc=e)
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
                    models = [m["id"] for m in data.get("data", []) if m["id"].startswith("gpt") or m["id"].startswith("o1")]
                    return models if models else self.available_models
        except Exception as e:
            log_error("Error listing OpenAI models", exc=e)
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
        model = model or "gpt-4o-mini"
        
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("OpenAI provider running in mock mode.")
            return f"[OpenAI Mock Response - model: {model}]\nHow can I help you support your clients today? I have access to your macros and Stripe portal."

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
                    raise Exception(f"OpenAI API returned status {res.status_code}: {res.text}")
                
                data = res.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            log_error("OpenAI API execution failed", exc=e)
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
        model = model or "gpt-4o-mini"
        
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("OpenAI provider streaming in mock mode.")
            mock_text = f"[OpenAI Mock Stream - model: {model}] Initiating connection stream for support query..."
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
                        raise Exception(f"OpenAI API returned status {response.status_code}")
                    
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
            log_error("OpenAI API streaming execution failed", exc=e)
            yield f"\n[Streaming error: {str(e)}]"

    async def embeddings(self, text: str) -> List[float]:
        if not self.api_key or self.api_key.startswith("mock_"):
            return [0.15] * 1536
            
        url = f"{self.base_url}/embeddings"
        payload = {
            "model": "text-embedding-3-small",
            "input": text
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers())
                if res.status_code == 200:
                    return res.json()["data"][0]["embedding"]
        except Exception as e:
            log_error("OpenAI embedding api failed", exc=e)
        return [0.0] * 1536
