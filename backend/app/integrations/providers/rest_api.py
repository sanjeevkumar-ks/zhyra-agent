"""
REST API Connector Integration Provider
=========================================
Flexible integration for connecting custom REST APIs.

Authentication: Bearer Token, API Key, Basic Auth, OAuth2, Custom Headers

This provider already had real httpx calls. Enhancement:
  - Credentials encrypted via credential_store
  - Credentials decrypted immediately before use
  - Basic Auth support added
  - Custom headers support added
  - PATCH/PUT/DELETE HTTP method support added
  - Retry on transient failures (5xx, timeout)
"""

import json
import httpx
import base64
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class RestApiProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_rest_api"

    SENSITIVE_FIELDS = {"bearer_token", "api_key", "password", "oauth2_token", "client_secret"}

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        base_url = config.get("base_url", "")
        if not base_url:
            raise HTTPException(status_code=400, detail="Base URL is required.")

        if not (base_url.startswith("http://") or base_url.startswith("https://")):
            raise HTTPException(status_code=400, detail="Base URL must start with http:// or https://")

        # Extract credential values from config (they may arrive in config dict from frontend)
        auth_type = config.get("auth_type", "bearer_token")
        sensitive = {
            "bearer_token": config.get("bearer_token", credentials.get("bearer_token", "")),
            "api_key": config.get("api_key", credentials.get("api_key", "")),
            "password": config.get("password", credentials.get("password", "")),
            "username": config.get("username", credentials.get("username", "")),
            "oauth2_token": config.get("oauth2_token", credentials.get("oauth2_token", "")),
            "custom_headers": config.get("headers", credentials.get("headers", "")),
        }

        # Store sensitive fields encrypted
        sensitive_to_store = {k: v for k, v in sensitive.items() if v}
        if sensitive_to_store:
            save_credentials(workspace_id, self.INTEGRATION_ID, sensitive_to_store)

        # Live connection test
        creds_for_validation = {**sensitive, "auth_type": auth_type}
        await self.validate(config, creds_for_validation)

        # Safe config to store (no secrets)
        safe_config = {
            "api_name": config.get("api_name", ""),
            "base_url": base_url,
            "auth_type": auth_type,
            "test_endpoint": config.get("test_endpoint", "/health"),
            "health_check": config.get("health_check", "GET /health"),
        }

        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        integration_data = {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": True,
            "synced_agents": payload.get("synced_agents", []),
            "last_sync": "Just now",
            "health": 100,
            "config": safe_config,
            "connected_account": payload.get("connected_account") or config.get("api_name") or base_url,
        }
        doc_ref.set(integration_data, merge=True)
        log_info(f"REST API Connector connected for workspace {workspace_id} (URL: {base_url})")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"REST API Connector disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        base_url = config.get("base_url", "")
        if not base_url:
            raise HTTPException(status_code=400, detail="Base URL is required.")

        test_endpoint = config.get("test_endpoint", "/health")
        full_url = f"{base_url.rstrip('/')}/{test_endpoint.lstrip('/')}"

        headers = self._build_headers(config, credentials)

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(full_url, headers=headers)
                if res.status_code >= 500:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Target server returned a server error (Status: {res.status_code}). Check that the endpoint is accessible."
                    )
                # Any non-500 response means the server is reachable
                return True
        except HTTPException:
            raise
        except httpx.ConnectError as e:
            raise HTTPException(status_code=400, detail=f"Could not connect to {base_url}. Ensure the server is running and accessible.")
        except httpx.TimeoutException:
            raise HTTPException(status_code=400, detail=f"Connection to {base_url} timed out.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"REST API validation failed: {str(e)}")

    def _build_headers(self, config: dict, credentials: dict) -> dict:
        """Build request headers based on auth_type and stored credentials."""
        headers = {"Content-Type": "application/json"}
        auth_type = config.get("auth_type", credentials.get("auth_type", "bearer_token"))

        if auth_type == "bearer_token":
            token = credentials.get("bearer_token", "")
            if token:
                headers["Authorization"] = f"Bearer {token}"

        elif auth_type == "api_key":
            api_key = credentials.get("api_key", "")
            key_header = config.get("api_key_header", "X-API-Key")
            if api_key:
                headers[key_header] = api_key

        elif auth_type == "basic_auth":
            username = credentials.get("username", config.get("username", ""))
            password = credentials.get("password", config.get("password", ""))
            if username and password:
                encoded = base64.b64encode(f"{username}:{password}".encode()).decode()
                headers["Authorization"] = f"Basic {encoded}"

        elif auth_type == "oauth2":
            token = credentials.get("oauth2_token", credentials.get("bearer_token", ""))
            if token:
                headers["Authorization"] = f"Bearer {token}"

        # Apply custom headers (stored as JSON string or key: value pairs)
        custom_headers_raw = credentials.get("custom_headers", config.get("headers", ""))
        if custom_headers_raw:
            try:
                if isinstance(custom_headers_raw, str) and custom_headers_raw.strip():
                    if custom_headers_raw.startswith("{"):
                        custom = json.loads(custom_headers_raw)
                    else:
                        # Parse key: value format
                        custom = {}
                        for line in custom_headers_raw.splitlines():
                            if ":" in line:
                                k, _, v = line.partition(":")
                                custom[k.strip()] = v.strip()
                    headers.update(custom)
            except Exception as e:
                log_error("Failed to parse custom headers", exc=e)

        return headers

    async def refresh(self, workspace_id: str) -> dict:
        # Custom REST APIs may support token refresh — pass-through for now
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        # Load integration state for config
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        snap = doc_ref.get()
        if not snap.exists:
            return "Error: REST API Connector is not connected."

        config = snap.to_dict().get("config", {})

        # Load decrypted credentials
        creds = load_credentials(workspace_id, self.INTEGRATION_ID) or {}

        base_url = config.get("base_url", "")
        if not base_url:
            return "Error: Base URL is not configured."

        # Determine HTTP method and endpoint from args or method name
        http_method = args.get("method", args.get("http_method", "GET")).upper()
        path = args.get("path", args.get("endpoint", ""))
        params = args.get("params", args.get("query_params", {}))
        body = args.get("body", args.get("payload", args.get("data", {})))
        extra_headers = args.get("headers", {})
        timeout = float(args.get("timeout", 30.0))

        full_url = f"{base_url.rstrip('/')}/{path.lstrip('/')}" if path else base_url

        # Build auth headers (decrypt credentials before use)
        headers = self._build_headers(config, creds)
        headers.update(extra_headers)

        log_info(f"REST API Connector sending {http_method} to {full_url}")

        # Retry up to 2 times on transient 5xx errors
        last_error = ""
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    if http_method == "GET":
                        res = await client.get(full_url, headers=headers, params=params)
                    elif http_method == "POST":
                        res = await client.post(full_url, headers=headers, params=params, json=body)
                    elif http_method == "PUT":
                        res = await client.put(full_url, headers=headers, params=params, json=body)
                    elif http_method == "PATCH":
                        res = await client.patch(full_url, headers=headers, params=params, json=body)
                    elif http_method == "DELETE":
                        res = await client.delete(full_url, headers=headers, params=params)
                    else:
                        return f"Error: Unsupported HTTP method '{http_method}'. Supported: GET, POST, PUT, PATCH, DELETE"

                    # Retry on 5xx
                    if res.status_code >= 500 and attempt == 0:
                        log_error(f"REST API returned {res.status_code}, retrying...")
                        continue

                    # Format response
                    content_type = res.headers.get("content-type", "")
                    if "application/json" in content_type:
                        try:
                            response_body = json.dumps(res.json(), indent=2)
                        except Exception:
                            response_body = res.text
                    else:
                        response_body = res.text[:5000]  # Truncate large non-JSON responses

                    return (
                        f"REST API Response (Status: {res.status_code})\n"
                        f"URL: {full_url}\n"
                        f"Method: {http_method}\n"
                        f"Body:\n{response_body}"
                    )

            except httpx.TimeoutException:
                last_error = f"Request to {full_url} timed out after {timeout}s."
                if attempt == 0:
                    continue
            except httpx.ConnectError as e:
                last_error = f"Could not connect to {full_url}: {str(e)}"
                break
            except Exception as e:
                log_error("REST API request failed", exc=e)
                last_error = str(e)
                break

        return f"Error: REST API request failed — {last_error}"

    def capabilities(self) -> list:
        return ["Call backend endpoints", "Read health checks", "Use business actions", "Trigger workflows"]
