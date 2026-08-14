from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Dict, Any

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
