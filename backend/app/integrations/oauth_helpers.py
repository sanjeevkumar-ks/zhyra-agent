"""
OAuth Helpers
=============
Centralized OAuth 2.0 flow management for all OAuth-based integration providers.

Supported providers:
- Google (Calendar, Gmail, Drive, Meet) — shared OAuth client
- Slack
- Shopify
- HubSpot

Flow:
  1. generate_oauth_url(provider, workspace_id, integration_id) → URL + state
  2. User logs in at provider
  3. Provider redirects to /api/integrations/oauth/callback/{provider}?code=...&state=...
  4. exchange_code(provider, code, state) → tokens
  5. Tokens stored encrypted via credential_store.save_credentials()
"""

import os
import json
import secrets
import time
from typing import Dict, Optional, Tuple
from urllib.parse import urlencode, quote_plus

from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

# ─── Configuration ────────────────────────────────────────────────────────────

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")

def get_backend_base_url(request: Optional[object] = None) -> str:
    backend_url = os.getenv("BACKEND_BASE_URL")
    if backend_url:
        return backend_url.rstrip("/")
    if request and hasattr(request, "base_url"):
        return str(request.base_url).rstrip("/")
    return BACKEND_BASE_URL

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
def get_google_redirect_uri(request: Optional[object] = None) -> str:
    return os.getenv("GOOGLE_REDIRECT_URI") or f"{get_backend_base_url(request)}/api/integrations/oauth/callback/google"

SLACK_CLIENT_ID = os.getenv("SLACK_CLIENT_ID", "")
SLACK_CLIENT_SECRET = os.getenv("SLACK_CLIENT_SECRET", "")
SLACK_REDIRECT_URI = os.getenv(
    "SLACK_REDIRECT_URI",
    f"{BACKEND_BASE_URL}/api/integrations/oauth/callback/slack"
)

SHOPIFY_CLIENT_ID = os.getenv("SHOPIFY_CLIENT_ID", "")
SHOPIFY_CLIENT_SECRET = os.getenv("SHOPIFY_CLIENT_SECRET", "")
SHOPIFY_REDIRECT_URI = os.getenv(
    "SHOPIFY_REDIRECT_URI",
    f"{BACKEND_BASE_URL}/api/integrations/oauth/callback/shopify"
)

HUBSPOT_CLIENT_ID = os.getenv("HUBSPOT_CLIENT_ID", "")
HUBSPOT_CLIENT_SECRET = os.getenv("HUBSPOT_CLIENT_SECRET", "")
HUBSPOT_REDIRECT_URI = os.getenv(
    "HUBSPOT_REDIRECT_URI",
    f"{BACKEND_BASE_URL}/api/integrations/oauth/callback/hubspot"
)

# OAuth state TTL in seconds (15 minutes)
STATE_TTL_SECONDS = 900

# Firestore collection for OAuth state (CSRF protection)
OAUTH_STATE_COLLECTION = "oauth_states"

# ─── Google OAuth Scopes per integration ─────────────────────────────────────

GOOGLE_SCOPES = {
    "int_gcal": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
        "openid",
        "email",
        "profile",
    ],
    "int_gmail": [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.readonly",
        "openid",
        "email",
        "profile",
    ],
    "int_gdrive": [
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/drive.readonly",
        "openid",
        "email",
        "profile",
    ],
    "int_gmeet": [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
        "openid",
        "email",
        "profile",
    ],
}

SLACK_SCOPES = [
    "channels:read",
    "channels:write",
    "channels:manage",
    "chat:write",
    "users:read",
    "users:read.email",
    "team:read",
    "incoming-webhook",
]

HUBSPOT_SCOPES = [
    "crm.objects.contacts.read",
    "crm.objects.contacts.write",
    "crm.objects.deals.read",
    "crm.objects.deals.write",
    "crm.schemas.contacts.read",
    "sales-email-read",
]

# ─── State Management (CSRF Protection) ──────────────────────────────────────

def _save_oauth_state(
    state: str,
    workspace_id: str,
    integration_id: str,
    provider: str,
    extra: Optional[Dict] = None
) -> None:
    """Persist OAuth state to Firestore for CSRF verification."""
    doc_ref = firestore_client.collection(OAUTH_STATE_COLLECTION).document(state)
    doc_ref.set({
        "state": state,
        "workspace_id": workspace_id,
        "integration_id": integration_id,
        "provider": provider,
        "created_at": time.time(),
        "expires_at": time.time() + STATE_TTL_SECONDS,
        "extra": extra or {},
    }, merge=False)


def _load_oauth_state(state: str) -> Optional[Dict]:
    """Load and validate an OAuth state from Firestore. Returns None if expired/invalid."""
    doc_ref = firestore_client.collection(OAUTH_STATE_COLLECTION).document(state)
    snap = doc_ref.get()
    if not snap.exists:
        return None
    data = snap.to_dict()
    if time.time() > data.get("expires_at", 0):
        doc_ref.delete()
        log_error(f"OAuth state expired: {state}")
        return None
    return data


def _consume_oauth_state(state: str) -> Optional[Dict]:
    """Load state and delete it (one-time use)."""
    data = _load_oauth_state(state)
    if data:
        firestore_client.collection(OAUTH_STATE_COLLECTION).document(state).delete()
    return data


# ─── URL Generation ───────────────────────────────────────────────────────────

def generate_google_oauth_url(workspace_id: str, integration_id: str, request: Optional[object] = None) -> Tuple[str, str]:
    """
    Generate a Google OAuth2 authorization URL.
    
    Returns:
        (authorization_url, state_token)
    """
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID environment variable is not configured.")

    redirect_uri = get_google_redirect_uri(request)
    scopes = GOOGLE_SCOPES.get(integration_id, GOOGLE_SCOPES["int_gcal"])
    state = secrets.token_urlsafe(32)
    _save_oauth_state(state, workspace_id, integration_id, "google", {"redirect_uri": redirect_uri})

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(scopes),
        "access_type": "offline",
        "prompt": "consent",  # Force consent to get refresh token
        "state": state,
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    return url, state


def generate_slack_oauth_url(workspace_id: str, integration_id: str) -> Tuple[str, str]:
    """Generate a Slack OAuth2 authorization URL."""
    if not SLACK_CLIENT_ID:
        raise ValueError("SLACK_CLIENT_ID environment variable is not configured.")

    state = secrets.token_urlsafe(32)
    _save_oauth_state(state, workspace_id, integration_id, "slack")

    params = {
        "client_id": SLACK_CLIENT_ID,
        "scope": ",".join(SLACK_SCOPES),
        "redirect_uri": SLACK_REDIRECT_URI,
        "state": state,
    }
    url = "https://slack.com/oauth/v2/authorize?" + urlencode(params)
    return url, state


def generate_hubspot_oauth_url(workspace_id: str, integration_id: str) -> Tuple[str, str]:
    """Generate a HubSpot OAuth2 authorization URL."""
    if not HUBSPOT_CLIENT_ID:
        raise ValueError("HUBSPOT_CLIENT_ID environment variable is not configured.")

    state = secrets.token_urlsafe(32)
    _save_oauth_state(state, workspace_id, integration_id, "hubspot")

    params = {
        "client_id": HUBSPOT_CLIENT_ID,
        "redirect_uri": HUBSPOT_REDIRECT_URI,
        "scope": " ".join(HUBSPOT_SCOPES),
        "state": state,
    }
    url = "https://app.hubspot.com/oauth/authorize?" + urlencode(params)
    return url, state


def generate_shopify_oauth_url(
    workspace_id: str,
    integration_id: str,
    shop_domain: str
) -> Tuple[str, str]:
    """
    Generate a Shopify OAuth2 authorization URL.
    
    Args:
        shop_domain: The myshopify.com domain (e.g., 'my-store.myshopify.com')
    """
    if not SHOPIFY_CLIENT_ID:
        raise ValueError("SHOPIFY_CLIENT_ID environment variable is not configured.")

    if not shop_domain:
        raise ValueError("Shopify shop domain is required.")

    # Normalize shop domain
    shop = shop_domain.replace("https://", "").replace("http://", "").rstrip("/")
    if not shop.endswith(".myshopify.com"):
        shop = f"{shop}.myshopify.com"

    state = secrets.token_urlsafe(32)
    _save_oauth_state(state, workspace_id, integration_id, "shopify", {"shop": shop})

    scopes = "read_orders,write_orders,read_products,write_products,read_inventory,write_fulfillments"
    params = {
        "client_id": SHOPIFY_CLIENT_ID,
        "scope": scopes,
        "redirect_uri": SHOPIFY_REDIRECT_URI,
        "state": state,
        "grant_options[]": "per-user",
    }
    url = f"https://{shop}/admin/oauth/authorize?" + urlencode(params)
    return url, state


# ─── Token Exchange ───────────────────────────────────────────────────────────

async def exchange_google_code(code: str, state: str) -> Dict:
    """
    Exchange a Google authorization code for access + refresh tokens.
    
    Returns:
        Dict with: access_token, refresh_token, expires_in, token_type, email
    """
    import httpx

    state_data = _consume_oauth_state(state)
    if not state_data:
        raise ValueError("Invalid or expired OAuth state. Please restart the OAuth flow.")

    redirect_uri = state_data.get("extra", {}).get("redirect_uri") or get_google_redirect_uri()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if response.status_code != 200:
            raise ValueError(f"Google token exchange failed: {response.text}")
        tokens = response.json()

    # Fetch user email
    email = ""
    try:
        async with httpx.AsyncClient() as client:
            user_resp = await client.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            if user_resp.status_code == 200:
                email = user_resp.json().get("email", "")
    except Exception as e:
        log_error("Failed to fetch Google user email after token exchange", exc=e)

    return {
        "access_token": tokens.get("access_token", ""),
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_in": tokens.get("expires_in", 3600),
        "scope": tokens.get("scope") or " ".join(GOOGLE_SCOPES.get(state_data["integration_id"], [])),
        "token_type": tokens.get("token_type", "Bearer"),
        "email": email,
        "workspace_id": state_data["workspace_id"],
        "integration_id": state_data["integration_id"],
    }


async def exchange_slack_code(code: str, state: str) -> Dict:
    """Exchange a Slack authorization code for tokens."""
    import httpx

    state_data = _consume_oauth_state(state)
    if not state_data:
        raise ValueError("Invalid or expired OAuth state. Please restart the OAuth flow.")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "code": code,
                "client_id": SLACK_CLIENT_ID,
                "client_secret": SLACK_CLIENT_SECRET,
                "redirect_uri": SLACK_REDIRECT_URI,
            },
        )
        data = response.json()
        if not data.get("ok"):
            raise ValueError(f"Slack token exchange failed: {data.get('error', 'unknown error')}")

    return {
        "bot_token": data.get("access_token", ""),
        "team_id": data.get("team", {}).get("id", ""),
        "team_name": data.get("team", {}).get("name", ""),
        "bot_user_id": data.get("bot_user_id", ""),
        "incoming_webhook_url": data.get("incoming_webhook", {}).get("url", ""),
        "workspace_id": state_data["workspace_id"],
        "integration_id": state_data["integration_id"],
    }


async def exchange_hubspot_code(code: str, state: str) -> Dict:
    """Exchange a HubSpot authorization code for tokens."""
    import httpx

    state_data = _consume_oauth_state(state)
    if not state_data:
        raise ValueError("Invalid or expired OAuth state. Please restart the OAuth flow.")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.hubapi.com/oauth/v1/token",
            data={
                "grant_type": "authorization_code",
                "client_id": HUBSPOT_CLIENT_ID,
                "client_secret": HUBSPOT_CLIENT_SECRET,
                "redirect_uri": HUBSPOT_REDIRECT_URI,
                "code": code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if response.status_code != 200:
            raise ValueError(f"HubSpot token exchange failed: {response.text}")
        tokens = response.json()

    # Fetch HubSpot account info
    portal_id = ""
    try:
        async with httpx.AsyncClient() as client:
            info_resp = await client.get(
                "https://api.hubapi.com/oauth/v1/access-tokens/" + tokens["access_token"]
            )
            if info_resp.status_code == 200:
                portal_id = str(info_resp.json().get("hub_id", ""))
    except Exception as e:
        log_error("Failed to fetch HubSpot portal info", exc=e)

    return {
        "access_token": tokens.get("access_token", ""),
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_in": tokens.get("expires_in", 1800),
        "portal_id": portal_id,
        "workspace_id": state_data["workspace_id"],
        "integration_id": state_data["integration_id"],
    }


async def exchange_shopify_code(code: str, state: str) -> Dict:
    """Exchange a Shopify authorization code for a permanent access token."""
    import httpx

    state_data = _consume_oauth_state(state)
    if not state_data:
        raise ValueError("Invalid or expired OAuth state. Please restart the OAuth flow.")

    shop = state_data.get("extra", {}).get("shop", "")
    if not shop:
        raise ValueError("Shop domain missing from OAuth state.")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://{shop}/admin/oauth/access_token",
            json={
                "client_id": SHOPIFY_CLIENT_ID,
                "client_secret": SHOPIFY_CLIENT_SECRET,
                "code": code,
            },
        )
        if response.status_code != 200:
            raise ValueError(f"Shopify token exchange failed: {response.text}")
        tokens = response.json()

    return {
        "access_token": tokens.get("access_token", ""),
        "shop": shop,
        "scope": tokens.get("scope", ""),
        "workspace_id": state_data["workspace_id"],
        "integration_id": state_data["integration_id"],
    }


# ─── Token Refresh ────────────────────────────────────────────────────────────

async def refresh_google_token(refresh_token: str) -> Dict:
    """
    Use a Google refresh token to get a new access token.
    Returns new token dict with access_token and expires_in.
    """
    import httpx

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        if response.status_code != 200:
            raise ValueError(f"Google token refresh failed: {response.text}")
        tokens = response.json()

    return {
        "access_token": tokens.get("access_token", ""),
        "expires_in": tokens.get("expires_in", 3600),
    }


async def refresh_hubspot_token(refresh_token: str) -> Dict:
    """Use a HubSpot refresh token to get a new access token."""
    import httpx

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.hubapi.com/oauth/v1/token",
            data={
                "grant_type": "refresh_token",
                "client_id": HUBSPOT_CLIENT_ID,
                "client_secret": HUBSPOT_CLIENT_SECRET,
                "refresh_token": refresh_token,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        if response.status_code != 200:
            raise ValueError(f"HubSpot token refresh failed: {response.text}")
        tokens = response.json()

    return {
        "access_token": tokens.get("access_token", ""),
        "expires_in": tokens.get("expires_in", 1800),
    }


# ─── Helper: Build Google Credentials Object ─────────────────────────────────

def build_google_credentials(access_token: str, refresh_token: str):
    """
    Build a google.oauth2.credentials.Credentials object from stored tokens.
    Requires google-auth and google-auth-oauthlib packages.
    """
    try:
        from google.oauth2.credentials import Credentials

        return Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
        )
    except ImportError:
        raise ImportError(
            "google-auth and google-auth-oauthlib packages are required. "
            "Run: pip install google-auth google-auth-oauthlib google-api-python-client"
        )
