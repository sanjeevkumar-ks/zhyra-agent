from typing import Dict, Any, Tuple
import time
from app.database.firestore import firestore_client
from app.integrations.credential_store import load_credentials
from app.utils.logger import log_info, log_error

class PreflightResult:
    def __init__(self, status: str, message: str, details: Dict[str, Any] = None):
        self.status = status  # READY | REAUTH_REQUIRED | API_DISABLED | PERMISSION_DENIED | NOT_CONNECTED | CONFIGURATION_ERROR | PROVIDER_ERROR
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
        integration_id: str
    ) -> PreflightResult:
        """
        Executes preflight validation checks before routing execution calls to integration.
        Checks Firestore status, credentials existence, OAuth scopes, and provider availability.
        """
        # 1. Fetch Agent data & check permissions
        if agent_id != "unknown":
            try:
                agent_ref = firestore_client.collection("agents").document(agent_id)
                agent_snap = agent_ref.get()
                if not agent_snap.exists:
                    return PreflightResult("CONFIGURATION_ERROR", "Agent configuration missing.")
                
                agent_data = agent_snap.to_dict()
                if agent_data.get("workspace_id") != workspace_id:
                    return PreflightResult("PERMISSION_DENIED", "Agent does not belong to this workspace.")

                # Filter integration tools strictly by agent assignment
                agent_tools = agent_data.get("tools", [])
                mapped_names = {
                    "int_gcal": ["google calendar", "calendar", "gcal"],
                    "int_gmail": ["gmail", "email"],
                    "int_whatsapp": ["whatsapp", "whatsapp business"],
                    "int_hubspot": ["hubspot", "crm"],
                    "int_shopify": ["shopify", "commerce", "store"],
                }
                labels = mapped_names.get(integration_id, [integration_id])
                
                if agent_tools:
                    has_permission = False
                    for label in labels:
                        for tool in agent_tools:
                            if label in tool.lower() or tool.lower() in label:
                                has_permission = True
                                break
                    if not has_permission:
                        return PreflightResult("PERMISSION_DENIED", f"Agent does not have permission to execute {integration_id}.")
            except Exception as e:
                log_error(f"Preflight agent check failed for {integration_id}", exc=e)
                return PreflightResult("CONFIGURATION_ERROR", f"Error checking agent permissions: {str(e)}")

        # 2. Check integration connection state in Firestore
        try:
            doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{integration_id}")
            snap = doc_ref.get()
            
            # Fallback stream query if ID mapping differs
            data = None
            if snap.exists:
                data = snap.to_dict()
            else:
                docs = firestore_client.collection("integrations").stream()
                for d in docs:
                    ddata = d.to_dict()
                    if ddata.get("workspace_id") == workspace_id and ddata.get("id") == integration_id:
                        data = ddata
                        break
            
            if not data or not data.get("connected"):
                return PreflightResult("NOT_CONNECTED", f"Integration {integration_id} is not connected.")
        except Exception as e:
            log_error(f"Preflight Firestore status query failed for {integration_id}", exc=e)
            return PreflightResult("CONFIGURATION_ERROR", "Failed to check integration status.")

        # 3. Check credentials existence and load encrypted tokens
        creds = load_credentials(workspace_id, integration_id)
        if not creds:
            return PreflightResult("NOT_CONNECTED", "Credentials missing from store.")

        # 4. Check OAuth expiry and token refresh
        is_oauth = integration_id in {"int_gcal", "int_gmail", "int_slack", "int_hubspot", "int_shopify"}
        if is_oauth:
            # Check refresh token
            if not creds.get("refresh_token") and integration_id != "int_shopify":  # Shopify uses permanent tokens
                return PreflightResult("REAUTH_REQUIRED", "Refresh token missing. Re-authorization required.")

            # Validate scopes if available
            if "scope" in creds:
                scopes = creds.get("scope", "")
                # Google specific scope check
                if integration_id == "int_gcal":
                    required = ["calendar.events", "calendar"]
                    if not any(req in scopes for req in required):
                        return PreflightResult("REAUTH_REQUIRED", "Required Google Calendar OAuth scopes missing.")

            # Check if token needs refresh by performing validation test via provider
            from app.services.integration_service import IntegrationService
            provider = IntegrationService._get_provider(integration_id)
            if not provider:
                return PreflightResult("CONFIGURATION_ERROR", f"No provider found for {integration_id}.")

            is_valid = await provider.validate(data.get("config", {}), creds)
            if not is_valid:
                log_info(f"Token invalid for {integration_id}. Attempting automatic preflight refresh.")
                refreshed = await provider.refresh(workspace_id)
                if not refreshed or not refreshed.get("access_token"):
                    return PreflightResult("REAUTH_REQUIRED", "Token expired. Auto-refresh failed.")
                
                # Reload refreshed tokens
                creds = load_credentials(workspace_id, integration_id)

        # 5. Accessibility validation check (Dry-run list call or test)
        try:
            from app.services.integration_service import IntegrationService
            provider = IntegrationService._get_provider(integration_id)
            
            # Google Calendar-specific checks
            if integration_id == "int_gcal":
                service = provider._get_calendar_service(creds)
                try:
                    # Retrieve primary calendar list to check read/write access and API status
                    service.calendarList().get(calendarId="primary").execute()
                except Exception as api_err:
                    err_msg = str(api_err).lower()
                    if "disabled" in err_msg or "not enabled" in err_msg or "403" in err_msg:
                        return PreflightResult("API_DISABLED", "Google Calendar API is not enabled in the developer console.")
                    elif "invalid credentials" in err_msg or "401" in err_msg:
                        return PreflightResult("REAUTH_REQUIRED", "Access token is invalid or has been revoked.")
                    else:
                        return PreflightResult("PROVIDER_ERROR", f"Google Calendar API error: {str(api_err)}")
        except Exception as e:
            log_error(f"API accessibility verification failed for {integration_id}", exc=e)
            return PreflightResult("PROVIDER_ERROR", f"Failed to access provider API: {str(e)}")

        return PreflightResult("READY", "Integration is ready for execution.")
