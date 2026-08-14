import json
from typing import AsyncGenerator, List, Dict, Any
import httpx
from app.providers.base_provider import LLMProvider
from app.utils.logger import log_error, log_info

class ClaudeProvider(LLMProvider):
    def __init__(self, api_key: str = "", base_url: str = None):
        self.api_key = api_key
        self.base_url = base_url or "https://api.anthropic.com/v1"

    @property
    def name(self) -> str:
        return "claude"

    @property
    def available_models(self) -> List[str]:
        return ["claude-3-5-sonnet-latest", "claude-3-opus-latest", "claude-3-haiku-latest"]

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
        return False

    def _get_headers(self) -> Dict[str, str]:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }

    async def validate_api_key(self) -> bool:
        if not self.api_key or self.api_key.startswith("mock_"):
            return False
        try:
            # We check by making a tiny message request to Anthropic
            url = f"{self.base_url}/messages"
            payload = {
                "model": "claude-3-haiku-20240307",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "Ping"}]
            }
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers())
                # If key is valid, we might get a 200 or 400 (if syntax bad), but a 401/403 means bad key.
                return res.status_code in [200, 400]
        except Exception as e:
            log_error("Failed to validate Claude API key", exc=e)
            return False

    async def list_models(self) -> List[str]:
        # Anthropic doesn't have a reliable open endpoint for model list, return static list
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
        model = model or "claude-3-5-sonnet-latest"
        
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("Claude provider running in mock mode.")
            return f"[Claude Mock Response - model: {model}]\nI have verified your account information and retrieved the details. Let me know what to process next."

        url = f"{self.base_url}/messages"
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, json=payload, headers=self._get_headers())
                if res.status_code != 200:
                    raise Exception(f"Claude API returned status {res.status_code}: {res.text}")
                
                data = res.json()
                return data["content"][0]["text"]
        except Exception as e:
            log_error("Claude API execution failed", exc=e)
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
        model = model or "claude-3-5-sonnet-latest"
        
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("Claude provider streaming in mock mode.")
            mock_text = f"[Claude Mock Stream - model: {model}] Processing request inside agent boundary..."
            for chunk in mock_text.split(" "):
                yield chunk + " "
            return

        url = f"{self.base_url}/messages"
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }
        if system_prompt:
            payload["system"] = system_prompt

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, json=payload, headers=self._get_headers()) as response:
                    if response.status_code != 200:
                        raise Exception(f"Claude API returned status {response.status_code}")
                    
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith("data: "):
                            data_str = line[6:]
                            try:
                                data_json = json.loads(data_str)
                                event_type = data_json.get("type")
                                if event_type == "content_block_delta":
                                    chunk_text = data_json["delta"].get("text", "")
                                    if chunk_text:
                                        yield chunk_text
                            except Exception:
                                pass
        except Exception as e:
            log_error("Claude API streaming execution failed", exc=e)
            yield f"\n[Streaming error: {str(e)}]"

    async def embeddings(self, text: str) -> List[float]:
        # Return mock embedding for compatibility since Claude does not support embeddings
        return [0.0] * 1536
