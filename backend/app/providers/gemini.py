import json
import time
from typing import AsyncGenerator, List, Dict, Any, Optional
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

    def _has_real_key(self) -> bool:
        return bool(self.api_key) and not self.api_key.startswith("mock_")

    async def validate_api_key(self) -> bool:
        if not self._has_real_key():
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
        if not self._has_real_key():
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

    def _extract_parts(self, data: dict) -> List[Dict[str, Any]]:
        """Extract all content parts from a Gemini response candidate."""
        candidates = data.get("candidates", [])
        if not candidates:
            return []
        candidate_content = candidates[0].get("content") or {}
        return candidate_content.get("parts") or []

    def _parts_to_text(self, parts: List[Dict[str, Any]]) -> str:
        texts = []
        for part in parts:
            if isinstance(part, dict):
                if "text" in part and part.get("text"):
                    texts.append(part["text"])
        return "".join(texts)

    def _parts_to_function_calls(self, parts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        calls = []
        for part in parts:
            if isinstance(part, dict) and "functionCall" in part:
                fc = part.get("functionCall") or {}
                calls.append(fc)
        return calls

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

        # Safe fallback if API key is missing or dummy. Never fabricate a success
        # for a real-world action here — that decision lives in the executor.
        if not self._has_real_key():
            log_info("Gemini provider running without API key. Returning neutral message.")
            return ("I'm ready to help. (Gemini API key is not configured for this workspace — "
                    "set up the LLM provider key to enable agent responses.)")

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
                parts = self._extract_parts(data)

                # Native function calls take priority over text. Convert to the
                # legacy TOOL_CALL text so the compat parser still works for
                # providers that only speak text.
                calls = self._parts_to_function_calls(parts)
                if calls:
                    fc = calls[0]
                    fname = fc.get("name") or "GoogleCalendar.create_event"
                    fargs = fc.get("args") or {}
                    log_info(f"[Gemini Provider] Native functionCall triggered: selected_tool_name={fname} tool_arguments={fargs}")
                    return f'TOOL_CALL:{{"tool": "{fname}", "args": {json.dumps(fargs)}}}'

                return self._parts_to_text(parts)
        except Exception as e:
            log_error("Gemini API execution failed", exc=e)
            raise e

    async def generate_structured(
        self,
        prompt: str,
        system_prompt: str = None,
        model: str = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        functions: List[Dict[str, Any]] = None,
        tool_call_id_prefix: str = "call_",
    ) -> Any:
        """Returns a ``StructuredLLMResponse`` using Gemini native functionCall parts."""
        from app.ai.tools.models import StructuredLLMResponse, ToolCall

        model = model or "gemini-3.5-flash"
        if "/" in model:
            model = model.split("/")[-1]

        if not self._has_real_key():
            return StructuredLLMResponse(
                text="I'm ready to help. (Gemini API key is not configured for this workspace.)",
                model=model,
                provider=self.name,
            )

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

        start = time.time()
        try:
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
                if res.status_code != 200:
                    raise Exception(f"Gemini API returned status {res.status_code}: {res.text}")

                data = res.json()
                candidates = data.get("candidates") or []
                if not candidates:
                    # Blocked response (safety) or no candidates at all. NEVER a
                    # silent empty result: surface why the turn produced nothing.
                    finish_reason = "EMPTY_CANDIDATES"
                    block_reason = (data.get("promptFeedback") or {}).get("blockReason", "")
                    if block_reason:
                        finish_reason = f"BLOCKED:{block_reason}"
                    log_info(
                        f"[Gemini Provider] empty/blocked structured response "
                        f"model={model} finish_reason={finish_reason} candidates=0"
                    )
                    return StructuredLLMResponse(
                        text="",
                        tool_calls=[],
                        model=model,
                        provider=self.name,
                        finish_reason=finish_reason,
                        provider_error=f"The model returned an empty response (finish_reason={finish_reason}).",
                    )

                finish_reason = (candidates[0].get("finishReason") or "STOP") if candidates else ""
                parts = self._extract_parts(data)
                calls = self._parts_to_function_calls(parts)
                text = self._parts_to_text(parts)

                tool_calls: List[ToolCall] = []
                for idx, fc in enumerate(calls):
                    fname = fc.get("name") or ""
                    fargs = fc.get("args") or {}
                    # Some Gemini versions return args as a list of key/value pairs
                    if isinstance(fargs, list):
                        merged = {}
                        for item in fargs:
                            if isinstance(item, dict):
                                merged[item.get("key")] = item.get("value")
                            elif isinstance(item, list) and len(item) == 2:
                                merged[item[0]] = item[1]
                        fargs = merged
                    log_info(f"[Gemini Provider] Structured functionCall: name={fname} args={fargs}")
                    tool_calls.append(ToolCall(
                        id=f"{tool_call_id_prefix}{idx}",
                        name=fname,
                        action="execute",
                        args=fargs,
                        raw_name=fname,
                    ))

                latency_ms = int((time.time() - start) * 1000)
                return StructuredLLMResponse(
                    text=text or "",
                    tool_calls=tool_calls,
                    model=model,
                    provider=self.name,
                    latency_ms=latency_ms,
                    finish_reason=finish_reason,
                )
        except Exception as e:
            log_error("Gemini structured generation failed", exc=e)
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

        if not self._has_real_key():
            log_info("Gemini provider streaming without API key. Yielding neutral message.")
            yield "I'm ready to help. (Gemini API key is not configured for this workspace.)"
            return

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={self.api_key}"
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
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream("POST", url, json=payload, headers={"Content-Type": "application/json"}) as response:
                    if response.status_code != 200:
                        raise Exception(f"Gemini API returned status {response.status_code}")
                    async for chunk in response.aiter_text():
                        # Gemini SSE format: "data: {json}\n\n" per chunk
                        for line in chunk.splitlines():
                            line = line.strip()
                            if not line.startswith("data:"):
                                continue
                            raw = line[len("data:"):].strip()
                            if not raw:
                                continue
                            try:
                                item = json.loads(raw)
                            except Exception:
                                continue
                            parts = self._extract_parts(item)
                            if not parts:
                                continue
                            text_part = self._parts_to_text(parts)
                            if text_part:
                                yield text_part
        except Exception as e:
            log_error("Gemini API streaming execution failed", exc=e)
            yield f"\n[Streaming error: {str(e)}]"

    async def embeddings(self, text: str) -> List[float]:
        if not self._has_real_key():
            # Mock 3072 vector for offline dev
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