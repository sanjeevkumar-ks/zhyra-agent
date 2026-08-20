import time
from typing import Dict, Any, Tuple, Optional
from app.database.firestore import firestore_client
from app.integrations.credential_store import load_credentials, save_credentials
from app.utils.logger import log_info, log_error

INTEGRATION_MAP = {
    "google_calendar": "int_gcal", "googlecalendar": "int_gcal", "calendar": "int_gcal", "int_gcal": "int_gcal",
    "gmail": "int_gmail", "email": "int_gmail", "int_gmail": "int_gmail",
    "google_drive": "int_gdrive", "googledrive": "int_gdrive", "drive": "int_gdrive", "int_gdrive": "int_gdrive",
    "google_meet": "int_gmeet", "googlemeet": "int_gmeet", "meet": "int_gmeet", "int_gmeet": "int_gmeet",
    "slack": "int_slack", "int_slack": "int_slack",
    "whatsapp": "int_whatsapp", "int_whatsapp": "int_whatsapp",
    "hubspot": "int_hubspot", "int_hubspot": "int_hubspot",
    "shopify": "int_shopify", "int_shopify": "int_shopify",
    "razorpay": "int_razorpay", "int_razorpay": "int_razorpay",
    "google_maps": "int_google_maps", "googlemaps": "int_google_maps", "maps": "int_google_maps", "int_google_maps": "int_google_maps",
    "elevenlabs": "int_elevenlabs", "int_elevenlabs": "int_elevenlabs",
    "rest_api": "int_rest_api", "customapi": "int_rest_api", "int_rest_api": "int_rest_api"
}

class IntegrationResolver:
    @classmethod
    async def resolve_integration_connection(
        cls,
        workspace_id: str,
        agent_id: str,
        provider_or_tool: str,
        lightweight: bool = True
    ) -> Tuple[str, str, Dict[str, Any]]:
        """
        Centralized connection resolution.

        In lightweight mode (default for the runtime path) this is a pure
        Firestore read: it NEVER makes a network call, never validates the
        token against Google, and never attempts a token refresh. Token
        validation and refresh happen only at actual tool execution time, so
        per-request LLM latency is not eaten by OAuth calls.

        Returns:
            Tuple of (status_code, user_facing_message, details_dict)
            
            Status codes:
              - CONNECTED
              - DISCONNECTED
              - TOKEN_EXPIRED
              - TOKEN_REFRESH_FAILED
              - MISSING_SCOPE
              - NOT_ASSIGNED_TO_AGENT
              - PROVIDER_DISABLED
              - API_ERROR
              - RATE_LIMITED
        """
        integration_id = INTEGRATION_MAP.get(provider_or_tool.lower().replace(" ", "").replace("_", ""), provider_or_tool)

        # 1. Check Agent Tool Assignment
        if agent_id and agent_id not in ["unknown", "default"]:
            try:
                agent_ref = firestore_client.collection("agents").document(agent_id)
                agent_snap = agent_ref.get()
                agent_data = None
                if agent_snap.exists:
                    agent_data = agent_snap.to_dict() or {}
                else:
                    try:
                        docs = firestore_client.collection("agents").stream()
                        for d in docs:
                            ddata = d.to_dict() or {}
                            if ddata.get("id") == agent_id or d.id == agent_id:
                                agent_data = ddata
                                break
                    except Exception:
                        pass

                if agent_data:
                    agent_tools = agent_data.get("tools", [])

                    # Parse tool representations (strings or dicts)
                    assigned = False
                    if not agent_tools:
                        # If agent has no tools specified, allow default connected tools
                        assigned = True
                    else:
                        for t in agent_tools:
                            tool_identifier = ""
                            if isinstance(t, str):
                                tool_identifier = t.lower()
                            elif isinstance(t, dict):
                                tool_identifier = (t.get("id") or t.get("name") or "").lower()

                            # Match against integration ID, provider name, or shorthand
                            if integration_id.lower() in tool_identifier or tool_identifier in integration_id.lower():
                                assigned = True
                                break
                            
                            # Additional shorthand matching (e.g. "calendar" matches "int_gcal")
                            if integration_id == "int_gcal" and ("calendar" in tool_identifier or "gcal" in tool_identifier or "event" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_gmail" and ("gmail" in tool_identifier or "email" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_gdrive" and ("drive" in tool_identifier or "gdrive" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_gmeet" and ("meet" in tool_identifier or "gmeet" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_slack" and "slack" in tool_identifier:
                                assigned = True
                                break
                            if integration_id == "int_whatsapp" and ("whatsapp" in tool_identifier or "whats app" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_hubspot" and ("hubspot" in tool_identifier or "crm" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_razorpay" and "razorpay" in tool_identifier:
                                assigned = True
                                break
                            if integration_id == "int_shopify" and ("shopify" in tool_identifier or "store" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_google_maps" and ("maps" in tool_identifier or "google maps" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_elevenlabs" and ("elevenlabs" in tool_identifier or "voice" in tool_identifier):
                                assigned = True
                                break
                            if integration_id == "int_rest_api" and ("rest" in tool_identifier or "custom api" in tool_identifier):
                                assigned = True
                                break

                    if not assigned:
                        provider_title = provider_or_tool.replace("_", " ").title()
                        return (
                            "NOT_ASSIGNED_TO_AGENT",
                            f"{provider_title} is connected to your workspace, but this agent doesn't have access to it.",
                            {"integration_id": integration_id, "workspace_id": workspace_id, "agent_id": agent_id}
                        )
            except Exception as e:
                log_error(f"Error checking agent tools assignment: {e}")

        # 2. Check Workspace Integration Connection Document
        try:
            doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{integration_id}")
            snap = doc_ref.get()
            data = snap.to_dict() if snap.exists else None

            if not data:
                # Stream fallback
                docs = firestore_client.collection("integrations").stream()
                for d in docs:
                    ddata = d.to_dict()
                    if ddata.get("workspace_id") == workspace_id and ddata.get("id") == integration_id:
                        data = ddata
                        break

            if not data or not data.get("connected"):
                provider_title = provider_or_tool.replace("_", " ").title()
                return (
                    "DISCONNECTED",
                    f"{provider_title} is not connected to your workspace.",
                    {"integration_id": integration_id, "workspace_id": workspace_id}
                )
        except Exception as e:
            log_error(f"Error querying workspace integration state for {integration_id}: {e}")
            return (
                "DISCONNECTED",
                f"Failed to resolve connection state for {provider_or_tool}.",
                {"error": str(e)}
            )

        # 3. Check Stored Credentials
        creds = load_credentials(workspace_id, integration_id)
        if not creds:
            provider_title = provider_or_tool.replace("_", " ").title()
            return (
                "DISCONNECTED",
                f"Authorization credentials missing for {provider_title}.",
                {"integration_id": integration_id}
            )

        # 4. OAuth Scope and Expiry Check (for Google OAuth services)
        #    In lightweight mode: only check presence of a refresh/access token.
        #    No network validation, no refresh attempt (that happens at execution).
        if integration_id in {"int_gcal", "int_gmail", "int_gdrive", "int_gmeet"}:
            refresh_token = creds.get("refresh_token")
            access_token = creds.get("access_token")

            if not refresh_token and not access_token:
                return (
                    "TOKEN_EXPIRED",
                    "Google Calendar authorization has expired. Please reconnect your account.",
                    {"integration_id": integration_id}
                )

            if lightweight:
                # Presence is enough for the runtime path. Execution will refresh.
                return (
                    "CONNECTED",
                    f"{provider_or_tool} is connected and ready.",
                    {"integration_id": integration_id, "workspace_id": workspace_id, "token_state": "present"}
                )

            # Non-lightweight (explicit status checks): decide if a refresh is
            # actually needed using expiry metadata, and only then refresh once.
            from app.integrations.oauth_helpers import (
                google_access_token_valid,
                refresh_google_token,
                GoogleOAuthRefreshError,
            )

            if google_access_token_valid(creds):
                return (
                    "CONNECTED",
                    f"{provider_or_tool} is connected and ready.",
                    {"integration_id": integration_id, "workspace_id": workspace_id, "token_state": "valid"}
                )

            if not refresh_token:
                return (
                    "TOKEN_EXPIRED",
                    "Google Calendar authorization has expired. Please reconnect your account.",
                    {"integration_id": integration_id, "token_state": "expired_no_refresh"}
                )

            try:
                log_info(f"[Resolver] Access token expired/mismatched for {integration_id}. Refreshing once for workspace {workspace_id}...")
                new_tokens = await refresh_google_token(refresh_token)
                if new_tokens and new_tokens.get("access_token"):
                    creds["access_token"] = new_tokens["access_token"]
                    if new_tokens.get("expires_at"):
                        creds["expires_at"] = new_tokens["expires_at"]
                    if new_tokens.get("client_id"):
                        creds["client_id"] = new_tokens["client_id"]
                    save_credentials(workspace_id, integration_id, creds)
                    log_info(f"[Resolver] Token successfully refreshed and saved for {integration_id}")
                    return (
                        "CONNECTED",
                        f"{provider_or_tool} is connected and ready.",
                        {"integration_id": integration_id, "workspace_id": workspace_id, "token_state": "refreshed"}
                    )
            except GoogleOAuthRefreshError as oauth_err:
                log_error(f"[Resolver] Permanent OAuth failure for {integration_id}: {oauth_err.code}")
                return (
                    "TOKEN_REFRESH_FAILED",
                    "Google Calendar authorization needs to be reconnected. The stored OAuth connection is no longer valid "
                    f"({oauth_err.code}).",
                    {"integration_id": integration_id, "error_code": oauth_err.code}
                )
            except Exception as ref_err:
                log_error(f"[Resolver] Automatic token refresh failed for {integration_id}", exc=ref_err)
                return (
                    "TOKEN_REFRESH_FAILED",
                    "Google Calendar authorization needs to be refreshed.",
                    {"integration_id": integration_id, "error": str(ref_err)}
                )

            return (
                "TOKEN_REFRESH_FAILED",
                "Google Calendar authorization needs to be refreshed.",
                {"integration_id": integration_id}
            )
