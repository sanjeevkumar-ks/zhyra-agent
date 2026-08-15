import json
from typing import AsyncGenerator, List, Dict, Any
import httpx
from app.providers.base_provider import LLMProvider
from app.utils.logger import log_error, log_info

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str = ""):
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def available_models(self) -> List[str]:
        return ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.5-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-pro-latest"]

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

    async def validate_api_key(self) -> bool:
        if not self.api_key or self.api_key.startswith("mock_"):
            return False
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url)
                return res.status_code == 200
        except Exception as e:
            log_error("Failed to validate Gemini API key", exc=e)
            return False

    async def list_models(self) -> List[str]:
        if not self.api_key or self.api_key.startswith("mock_"):
            return self.available_models
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self.api_key}"
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    models = [m["name"].split("/")[-1] for m in data.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
                    return models if models else self.available_models
        except Exception as e:
            log_error("Error listing Gemini models via API", exc=e)
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
        model = model or "gemini-3.5-flash"
        if "/" in model:
            model = model.split("/")[-1]
        
        # Safe fallback if API key is missing or dummy
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("Gemini provider running in mock mode.")
            return f"[Gemini Mock Response - model: {model}]\nBased on your instructions, I qualified the client and scheduled their consultation."

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={self.api_key}"
        
        contents = [{"parts": [{"text": prompt}]}]
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            }
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

        if functions:
            payload["tools"] = [{"functionDeclarations": functions}]

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
                if res.status_code != 200:
                    raise Exception(f"Gemini API returned status {res.status_code}: {res.text}")
                
                data = res.json()
                candidates = data.get("candidates", [])
                if not candidates:
                    return ""
                
                candidate_content = candidates[0].get("content") or {}
                parts = candidate_content.get("parts") or []
                
                for part in parts:
                    if isinstance(part, dict):
                        if "functionCall" in part:
                            fc = part.get("functionCall") or {}
                            fname = fc.get("name") or "GoogleCalendar.createEvent"
                            fargs = fc.get("args") or {}
                            log_info(f"[Gemini Provider] Native functionCall triggered: selected_tool_name={fname} tool_arguments={fargs}")
                            return f'TOOL_CALL:{{"tool": "{fname}", "args": {json.dumps(fargs)}}}'
                        elif "text" in part:
                            return part.get("text") or ""
                return ""
        except Exception as e:
            log_error("Gemini API execution failed", exc=e)
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
        model = model or "gemini-3.5-flash"
        if "/" in model:
            model = model.split("/")[-1]
        
        if not self.api_key or self.api_key.startswith("mock_"):
            log_info("Gemini provider streaming in mock mode.")
            mock_text = f"[Gemini Mock Stream - model: {model}] Processing your agent inquiry..."
            for chunk in mock_text.split(" "):
                yield chunk + " "
            return

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={self.api_key}"
        contents = [{"parts": [{"text": prompt}]}]
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            }
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", url, json=payload, headers={"Content-Type": "application/json"}) as response:
                    if response.status_code != 200:
                        raise Exception(f"Gemini API returned status {response.status_code}")
                    
                    # Gemini returns a stream of JSON arrays representing chunks
                    buffer = ""
                    async for chunk in response.aiter_text():
                        buffer += chunk
                        # Clean and extract content chunks (Google uses a streaming JSON array)
                        # We do a basic check for {"text": "..."} in the text stream for lightweight parser
                        try:
                            # Split by json structures
                            lines = buffer.split("\n")
                            for line in lines[:-1]:
                                if '"text":' in line:
                                    # Simple extract
                                    start = line.find('"text": "') + 9
                                    end = line.rfind('"')
                                    if start > 8 and end > start:
                                        chunk_text = line[start:end].replace("\\n", "\n").replace('\\"', '"')
                                        yield chunk_text
                            buffer = lines[-1]
                        except Exception:
                            pass
        except Exception as e:
            log_error("Gemini API streaming execution failed", exc=e)
            yield f"\n[Streaming error: {str(e)}]"

    async def embeddings(self, text: str) -> List[float]:
        if not self.api_key or self.api_key.startswith("mock_"):
            # Mock 3072 vector
            return [0.1] * 3072
            
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={self.api_key}"
        payload = {
            "model": "models/gemini-embedding-001",
            "content": {"parts": [{"text": text}]}
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return res.json()["embedding"]["values"]
        except Exception as e:
            log_error("Gemini embedding api failed", exc=e)
        return [0.0] * 3072
