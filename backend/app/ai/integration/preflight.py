from typing import Dict, Any
from app.integrations.resolver import IntegrationResolver
from app.utils.logger import log_info, log_error

class PreflightResult:
    def __init__(self, status: str, message: str, details: Dict[str, Any] = None):
        self.status = status  # READY | NOT_ASSIGNED_TO_AGENT | NOT_CONNECTED | REAUTH_REQUIRED | TOKEN_EXPIRED | TOKEN_REFRESH_FAILED | API_DISABLED | PROVIDER_ERROR
        self.message = message
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "message": self.message,
            "details": self.details
        }

class IntegrationPreflight:
    @classmethod
    async def check(
        cls,
        workspace_id: str,
        agent_id: str,
        integration_id: str,
        lightweight: bool = True
    ) -> PreflightResult:
        """
        Non-blocking preflight validation check.
        Uses centralized IntegrationResolver to verify agent tool assignment,
        workspace connection, and token validity without blocking LLM retrieval.
        Lightweight by default: no network validation or token refresh.
        """
        try:
            status_code, message, details = await IntegrationResolver.resolve_integration_connection(
                workspace_id=workspace_id,
                agent_id=agent_id,
                provider_or_tool=integration_id,
                lightweight=lightweight
            )

            if status_code == "CONNECTED":
                return PreflightResult("READY", "Integration is connected and ready.", details)
            elif status_code == "NOT_ASSIGNED_TO_AGENT":
                return PreflightResult("NOT_ASSIGNED_TO_AGENT", message, details)
            elif status_code in ["TOKEN_EXPIRED", "TOKEN_REFRESH_FAILED"]:
                return PreflightResult("REAUTH_REQUIRED", message, details)
            elif status_code == "DISCONNECTED":
                return PreflightResult("NOT_CONNECTED", message, details)
            else:
                return PreflightResult("PROVIDER_ERROR", message, details)

        except Exception as e:
            log_error(f"Preflight check failed for integration {integration_id}", exc=e)
            return PreflightResult("PROVIDER_ERROR", f"Preflight error: {str(e)}")
