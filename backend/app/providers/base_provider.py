from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Dict, Any, Optional

class LLMProviderError(Exception):
    """Raised when an LLM provider request fails, has invalid/missing credentials, or returns an error response."""
    def __init__(self, message: str, code: str = "LLM_PROVIDER_ERROR"):
        super().__init__(message)
        self.code = code


class EmbeddingProviderUnavailableError(Exception):
    """Raised when embeddings API credentials are not configured or embedding call fails."""
    def __init__(self, message: str = "EMBEDDING_PROVIDER_UNAVAILABLE"):
        super().__init__(message)
        self.code = "EMBEDDING_PROVIDER_UNAVAILABLE"


class LLMProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """The identifier name of the provider (e.g. 'gemini', 'openai')."""
        pass

    @property
    @abstractmethod
    def available_models(self) -> List[str]:
        """Static list of models supported by default."""
        pass

    @property
    @abstractmethod
    def supports_streaming(self) -> bool:
        pass

    @property
    @abstractmethod
    def supports_vision(self) -> bool:
        pass

    @property
    @abstractmethod
    def supports_functions(self) -> bool:
        pass

    @property
    def supports_structured_tool_calls(self) -> bool:
        """Whether the provider natively returns structured tool calls.

        Defaults to ``supports_functions``. Override where the provider returns
        tool calls as structured objects rather than text.
        """
        return self.supports_functions

    @property
    @abstractmethod
    def supports_embeddings(self) -> bool:
        pass

    @abstractmethod
    async def validate_api_key(self) -> bool:
        """Tests the credentials by sending a minimal test query or fetching models list."""
        pass

    @abstractmethod
    async def list_models(self) -> List[str]:
        """Fetches dynamic available models list from provider or returns available_models."""
        pass

    @abstractmethod
    async def generate_text(
        self,
        prompt: str,
        system_prompt: str = None,
        model: str = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        functions: List[Dict[str, Any]] = None
    ) -> str:
        """Sends a standard text generation request."""
        pass

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
        """Generates a structured response with native tool calls.

        Returns a ``StructuredLLMResponse`` with free text and/or ``ToolCall``
        objects. Providers that do not implement native structured calling fall
        back to :meth:`generate_text` plus the text ``TOOL_CALL`` compat parser.
        """
        from app.ai.tools.models import StructuredLLMResponse, ToolCall
        from app.services.conversation_service import ConversationService

        text = await self.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            functions=functions,
        )
        parsed = ConversationService._parse_tool_call(text or "")
        if parsed:
            return StructuredLLMResponse(
                text="",
                tool_calls=[ToolCall(
                    id=f"{tool_call_id_prefix}tc",
                    name=parsed.get("tool") or "",
                    action=parsed.get("method") or "execute",
                    args=parsed.get("args") or {},
                    raw_name=parsed.get("tool") or "",
                )],
                model=model or "",
            )
        return StructuredLLMResponse(text=text or "", model=model or "")

    @abstractmethod
    async def stream_text(
        self,
        prompt: str,
        system_prompt: str = None,
        model: str = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        functions: List[Dict[str, Any]] = None
    ) -> AsyncGenerator[str, None]:
        """Streams text generation chunks back to the client."""
        pass

    @abstractmethod
    async def embeddings(self, text: str) -> List[float]:
        """Generates text vector embeddings (dimensions match provider specs)."""
        pass
