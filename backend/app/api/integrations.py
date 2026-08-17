from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse, JSONResponse
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.services.integration_service import IntegrationService
from app.schemas.integrations import IntegrationResponse, IntegrationConnectRequest, IntegrationHealthResponse
from typing import List
import os

router = APIRouter()

FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")

# ─── Existing Routes (unchanged contracts) ────────────────────────────────────

@router.get("", response_model=List[IntegrationResponse])
async def list_integrations(workspace_id: str = Depends(get_user_workspace_id)):
    """Exposes all supported integrations and connection status states."""
    try:
        return await IntegrationService.list_integrations(workspace_id)
    except Exception as e:
        from app.utils.logger import log_error
        log_error("Failed to list integrations", exc=e)
        return JSONResponse(status_code=500, content={"detail": f"Failed to list integrations: {str(e)}"})

@router.get("/{integration_id}", response_model=IntegrationResponse)
async def get_integration(
    integration_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Fetches single integration state by ID."""
    try:
        integrations = await IntegrationService.list_integrations(workspace_id)
        for item in integrations:
            if item.get("id") == integration_id:
                return item
        return JSONResponse(status_code=404, content={"detail": f"Integration {integration_id} not found"})
    except Exception as e:
        from app.utils.logger import log_error
        log_error(f"Failed to fetch integration {integration_id}", exc=e)
        return JSONResponse(status_code=500, content={"detail": f"Failed to fetch integration: {str(e)}"})

@router.post("/{integration_id}/connect", response_model=IntegrationResponse)
async def connect_integration(
    integration_id: str,
    payload: IntegrationConnectRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Establishes a sync target with external tools using connection credentials."""
    try:
        return await IntegrationService.connect_integration(
            workspace_id=workspace_id,
            integration_id=integration_id,
            payload=payload.model_dump()
        )
    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"detail": e.detail})
    except Exception as e:
        from app.utils.logger import log_error
        log_error(f"Failed to connect integration {integration_id}", exc=e)
        return JSONResponse(status_code=500, content={"detail": f"Failed to connect integration: {str(e)}"})

@router.post("/{integration_id}/test")
async def test_integration_credentials(
    integration_id: str,
    payload: IntegrationConnectRequest,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Tests connection credentials against the provider API before connecting."""
    try:
        provider = IntegrationService._get_provider(integration_id)
        config = payload.configuration or {}
        credentials = payload.credentials or {}
        is_valid = await provider.validate(config, credentials)
        return {"success": True, "valid": is_valid, "message": "Credentials verified successfully."}
    except HTTPException as e:
        return JSONResponse(status_code=e.status_code, content={"success": False, "detail": e.detail})
    except Exception as e:
        from app.utils.logger import log_error
        log_error(f"Failed to test integration credentials for {integration_id}", exc=e)
        return JSONResponse(status_code=400, content={"success": False, "detail": f"Credential verification failed: {str(e)}"})

@router.delete("/{integration_id}")
async def disconnect_integration(
    integration_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Disconnects workspace integration parameters."""
    try:
        await IntegrationService.disconnect_integration(workspace_id, integration_id)
        return {"detail": f"Successfully disconnected integration {integration_id}"}
    except Exception as e:
        from app.utils.logger import log_error
        log_error(f"Failed to disconnect integration {integration_id}", exc=e)
        return JSONResponse(status_code=500, content={"detail": f"Failed to disconnect integration: {str(e)}"})

@router.get("/{integration_id}/health", response_model=IntegrationHealthResponse)
async def verify_integration_health(
    integration_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Queries external endpoints to run real-time integration connection health diagnostics."""
    try:
        return await IntegrationService.check_health(workspace_id, integration_id)
    except Exception as e:
        from app.utils.logger import log_error
        log_error(f"Failed health check for {integration_id}", exc=e)
        return JSONResponse(status_code=500, content={"healthy": False, "status": "error", "last_check": "Just now"})

# ─── New OAuth Routes ─────────────────────────────────────────────────────────

@router.get("/oauth/authorize/{integration_id}")
async def get_oauth_authorize_url(
    integration_id: str,
    request: Request,
    workspace_id: str = Depends(get_user_workspace_id),
    shop: str = Query(default="", description="Required for Shopify OAuth: your myshopify.com domain")
):
    """
    Returns an OAuth authorization URL for the given integration.
    The frontend should open this URL in a popup or redirect the browser to it.
    
    Supported: int_gcal, int_gmail, int_gdrive, int_gmeet, int_slack, int_hubspot, int_shopify
    """
    from app.integrations.oauth_helpers import (
        generate_google_oauth_url,
        generate_slack_oauth_url,
        generate_hubspot_oauth_url,
        generate_shopify_oauth_url,
    )

    google_integrations = {"int_gcal", "int_gmail", "int_gdrive", "int_gmeet"}

    try:
        if integration_id in google_integrations:
            oauth_url, state = generate_google_oauth_url(workspace_id, integration_id, request)
        elif integration_id == "int_slack":
            oauth_url, state = generate_slack_oauth_url(workspace_id, integration_id)
        elif integration_id == "int_hubspot":
            oauth_url, state = generate_hubspot_oauth_url(workspace_id, integration_id)
        elif integration_id == "int_shopify":
            if not shop:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "shop parameter is required for Shopify OAuth (e.g., my-store.myshopify.com)"}
                )
            oauth_url, state = generate_shopify_oauth_url(workspace_id, integration_id, shop)
        else:
            return JSONResponse(
                status_code=400,
                content={"detail": f"Integration {integration_id} does not support OAuth. Use API key connection instead."}
            )

        return {"oauth_url": oauth_url, "state": state}

    except ValueError as e:
        return JSONResponse(status_code=400, content={"detail": str(e)})
    except Exception as e:
        from app.utils.logger import log_error
        log_error(f"Failed to generate OAuth URL for {integration_id}", exc=e)
        return JSONResponse(status_code=500, content={"detail": "Failed to generate OAuth authorization URL."})


@router.get("/oauth/callback/{provider}")
async def oauth_callback(
    provider: str,
    request: Request,
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
    shop: str = Query(default=""),
):
    """
    OAuth 2.0 callback handler. Provider redirects here after user grants permission.
    Exchanges auth code for tokens, stores them encrypted, then redirects to frontend.
    
    Providers: google, slack, hubspot, shopify
    """
    from app.integrations.oauth_helpers import (
        exchange_google_code,
        exchange_slack_code,
        exchange_hubspot_code,
        exchange_shopify_code,
    )
    from app.integrations.credential_store import save_credentials
    from app.services.integration_service import IntegrationService
    from app.utils.logger import log_info, log_error
    import time

    # Handle user-denied errors
    if error:
        redirect_url = f"{FRONTEND_BASE_URL}/integrations?oauth_error={error}"
        return RedirectResponse(url=redirect_url)

    if not code or not state:
        redirect_url = f"{FRONTEND_BASE_URL}/integrations?oauth_error=missing_params"
        return RedirectResponse(url=redirect_url)

    try:
        # Exchange code for tokens
        if provider == "google":
            token_data = await exchange_google_code(code, state)
        elif provider == "slack":
            token_data = await exchange_slack_code(code, state)
        elif provider == "hubspot":
            token_data = await exchange_hubspot_code(code, state)
        elif provider == "shopify":
            token_data = await exchange_shopify_code(code, state)
        else:
            redirect_url = f"{FRONTEND_BASE_URL}/integrations?oauth_error=unknown_provider"
            return RedirectResponse(url=redirect_url)

        workspace_id = token_data.pop("workspace_id", "")
        integration_id = token_data.pop("integration_id", "")

        if not workspace_id or not integration_id:
            redirect_url = f"{FRONTEND_BASE_URL}/integrations?oauth_error=invalid_state"
            return RedirectResponse(url=redirect_url)

        # Save encrypted credentials
        save_credentials(workspace_id, integration_id, token_data)

        # Determine connected_account label
        connected_account = (
            token_data.get("email")
            or token_data.get("team_name")
            or token_data.get("portal_id")
            or token_data.get("shop")
            or f"{provider}_connected"
        )

        # Perform preflight validation check to set ready status
        from app.ai.integration.preflight import IntegrationPreflight
        preflight = await IntegrationPreflight.check(workspace_id, "unknown", integration_id)

        # Mark integration as connected in Firestore
        await IntegrationService.connect_integration(
            workspace_id=workspace_id,
            integration_id=integration_id,
            payload={
                "credentials": {},  # Credentials already stored separately
                "configuration": {},
                "synced_agents": [],
                "connected_account": connected_account,
                "integration_ready_status": preflight.status,
                "_oauth_completed": True,  # Signal that OAuth flow is done
            }
        )

        log_info(f"OAuth callback completed for {integration_id} (provider: {provider}, workspace: {workspace_id}). Ready status: {preflight.status}")

        # Redirect back to frontend with success
        redirect_url = f"{FRONTEND_BASE_URL}/integrations?oauth_success={integration_id}&connected_account={connected_account}"
        return RedirectResponse(url=redirect_url)

    except ValueError as e:
        log_error(f"OAuth callback validation error for {provider}", exc=e)
        redirect_url = f"{FRONTEND_BASE_URL}/integrations?oauth_error={str(e)[:100]}"
        return RedirectResponse(url=redirect_url)
    except Exception as e:
        log_error(f"OAuth callback failed for {provider}", exc=e)
        redirect_url = f"{FRONTEND_BASE_URL}/integrations?oauth_error=server_error"
        return RedirectResponse(url=redirect_url)
