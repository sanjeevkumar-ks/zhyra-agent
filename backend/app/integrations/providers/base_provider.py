from abc import ABC, abstractmethod
from typing import Any

class BaseIntegrationProvider(ABC):
    @abstractmethod
    async def connect(self, workspace_id: str, payload: dict) -> dict:
        """Establishes and saves the connection settings."""
        pass

    @abstractmethod
    async def disconnect(self, workspace_id: str) -> None:
        """Cleans up and deletes connection credentials."""
        pass

    @abstractmethod
    async def validate(self, config: dict, credentials: dict) -> bool:
        """Validates configuration and credentials."""
        pass

    @abstractmethod
    async def refresh(self, workspace_id: str) -> dict:
        """Refreshes tokens if expired (mainly for OAuth)."""
        pass

    @abstractmethod
    async def execute(self, workspace_id: str, method: str, args: dict) -> Any:
        """Executes a capability action of the integration and returns structured output."""
        pass

    @abstractmethod
    def capabilities(self) -> list:
        """Returns the list of supported capabilities."""
        pass
