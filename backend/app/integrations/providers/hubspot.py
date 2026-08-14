"""
HubSpot CRM Integration Provider
==================================
Real implementation using HubSpot CRM API v3.

Authentication: HubSpot OAuth 2.0 OR Private App token
Credentials stored: access_token, refresh_token, portal_id (encrypted)

Capabilities:
  - Create leads
  - Update contacts
  - Log notes
  - Sync pipeline stages
"""

import json
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException

HUBSPOT_API_BASE = "https://api.hubapi.com"


class HubSpotProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_hubspot"

    def _get_headers(self, creds: dict) -> dict:
        token = creds.get("access_token", creds.get("private_app_token", ""))
        if not token:
            raise HTTPException(status_code=400, detail="HubSpot token is missing.")
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        if payload.get("_oauth_completed"):
            connected_account = payload.get("connected_account", "HubSpot Portal")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        # Support Private App token for non-OAuth flow
        private_token = (
            credentials.get("access_token")
            or credentials.get("private_app_token")
            or config.get("private_app_token")
            or config.get("api_key")
        )

        if private_token:
            await self.validate(config, {"access_token": private_token})
            save_credentials(workspace_id, self.INTEGRATION_ID, {"access_token": private_token})

            # Fetch portal info
            portal_id = await self._get_portal_id({"access_token": private_token})
            connected_account = f"Portal {portal_id}" if portal_id else "HubSpot Portal"

            return await self._save_integration_state(workspace_id, {
                **payload,
                "connected_account": connected_account,
                "configuration": {"portal_id": portal_id},
            }, connected_account)

        # Check stored creds
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if creds and creds.get("access_token"):
            connected_account = payload.get("connected_account") or f"Portal {creds.get('portal_id', '')}"
            return await self._save_integration_state(workspace_id, payload, connected_account)

        log_info(f"HubSpot OAuth flow needed for workspace {workspace_id}")
        return {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": False,
            "oauth_redirect": True,
            "oauth_url": None,
            "synced_agents": [],
            "last_sync": "Never",
            "health": 0,
            "config": {},
            "connected_account": None,
            "name": "HubSpot",
            "category": "CRM",
            "description": "Create leads and update contacts.",
        }

    async def _get_portal_id(self, creds: dict) -> str:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"{HUBSPOT_API_BASE}/account-info/v3/details",
                    headers=self._get_headers(creds),
                )
                if r.status_code == 200:
                    return str(r.json().get("portalId", ""))
        except Exception as e:
            log_error("Failed to fetch HubSpot portal ID", exc=e)
        return ""

    async def _save_integration_state(self, workspace_id: str, payload: dict, connected_account: str) -> dict:
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        integration_data = {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": True,
            "synced_agents": payload.get("synced_agents", []),
            "last_sync": "Just now",
            "health": 100,
            "config": payload.get("configuration", {}),
            "connected_account": connected_account,
        }
        doc_ref.set(integration_data, merge=True)
        log_info(f"HubSpot connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"HubSpot disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        import httpx
        token = credentials.get("access_token", config.get("private_app_token", ""))
        if not token:
            return True

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"{HUBSPOT_API_BASE}/crm/v3/objects/contacts",
                    params={"limit": 1},
                    headers={"Authorization": f"Bearer {token}"},
                )
                if r.status_code == 401:
                    raise HTTPException(status_code=400, detail="Invalid HubSpot access token.")
                return r.status_code in (200, 201)
        except HTTPException:
            raise
        except Exception as e:
            log_error("HubSpot validation failed", exc=e)
            return False

    async def refresh(self, workspace_id: str) -> dict:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("refresh_token"):
            return {}
        try:
            from app.integrations.oauth_helpers import refresh_hubspot_token
            new_tokens = await refresh_hubspot_token(creds["refresh_token"])
            creds["access_token"] = new_tokens["access_token"]
            save_credentials(workspace_id, self.INTEGRATION_ID, creds)
            log_info(f"HubSpot token refreshed for workspace {workspace_id}")
            return {"access_token": new_tokens["access_token"], "expires_in": new_tokens["expires_in"]}
        except Exception as e:
            log_error("HubSpot token refresh failed", exc=e)
            return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("access_token"):
            return "Error: HubSpot is not connected. Please authenticate first."

        try:
            method_lower = method.lower()

            if "contact" in method_lower or "lead" in method_lower:
                return await self._upsert_contact(creds, args)
            elif "note" in method_lower or "log" in method_lower:
                return await self._create_note(creds, args)
            elif "search" in method_lower:
                return await self._search_contacts(creds, args)
            elif "deal" in method_lower:
                return await self._create_deal(creds, args)
            elif "pipeline" in method_lower or "stage" in method_lower:
                return await self._list_pipelines(creds, args)

            return f"Error: Unknown method '{method}' on HubSpot. Available: create_contact, create_note, search, create_deal, list_pipelines"

        except Exception as e:
            log_error(f"HubSpot execute failed for method {method}", exc=e)
            return f"Error: HubSpot action failed — {str(e)}"

    async def _upsert_contact(self, creds: dict, args: dict) -> str:
        import httpx

        email = args.get("email")
        if not email:
            return "Error: email is required to create or update a contact."

        properties = {
            "email": email,
            "firstname": args.get("first_name", args.get("firstname", "")),
            "lastname": args.get("last_name", args.get("lastname", "")),
            "phone": args.get("phone", ""),
            "company": args.get("company", ""),
            "hs_lead_status": args.get("lead_status", "NEW"),
        }
        # Remove empty values
        properties = {k: v for k, v in properties.items() if v}

        async with httpx.AsyncClient(timeout=15.0) as client:
            # Try to create first
            r = await client.post(
                f"{HUBSPOT_API_BASE}/crm/v3/objects/contacts",
                json={"properties": properties},
                headers=self._get_headers(creds),
            )

            if r.status_code == 409:
                # Contact exists — fetch and patch
                existing_id = r.json().get("message", "").split("Existing ID: ")[-1].strip()
                if existing_id.isdigit():
                    r = await client.patch(
                        f"{HUBSPOT_API_BASE}/crm/v3/objects/contacts/{existing_id}",
                        json={"properties": properties},
                        headers=self._get_headers(creds),
                    )
                    contact = r.json()
                    return f"Updated HubSpot contact '{email}'. Contact ID: {contact.get('id')}"

            if r.status_code not in (200, 201):
                return f"Error: HubSpot contact operation failed — {r.text[:300]}"

            contact = r.json()
            return f"Created HubSpot contact '{email}'. Contact ID: {contact.get('id')}"

    async def _create_note(self, creds: dict, args: dict) -> str:
        import httpx
        import datetime

        body = args.get("body", args.get("content", "Agent interaction log"))
        contact_id = args.get("contact_id", "")

        note_body = {
            "properties": {
                "hs_note_body": body,
                "hs_timestamp": str(int(datetime.datetime.utcnow().timestamp() * 1000)),
            }
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{HUBSPOT_API_BASE}/crm/v3/objects/notes",
                json=note_body,
                headers=self._get_headers(creds),
            )

            if r.status_code not in (200, 201):
                return f"Error: Could not create HubSpot note — {r.text[:300]}"

            note = r.json()
            note_id = note.get("id", "")

            # Associate with contact if provided
            if contact_id:
                await client.put(
                    f"{HUBSPOT_API_BASE}/crm/v3/objects/notes/{note_id}/associations/contacts/{contact_id}/note_to_contact",
                    headers=self._get_headers(creds),
                )
                return f"Created HubSpot note and associated with contact '{contact_id}'. Note ID: {note_id}"

        return f"Created HubSpot note. Note ID: {note_id}"

    async def _search_contacts(self, creds: dict, args: dict) -> str:
        import httpx

        query = args.get("query", args.get("search", ""))
        limit = int(args.get("limit", 10))

        search_body = {
            "query": query,
            "limit": limit,
            "properties": ["firstname", "lastname", "email", "phone", "company"],
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{HUBSPOT_API_BASE}/crm/v3/objects/contacts/search",
                json=search_body,
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: HubSpot search failed — {r.text[:300]}"

        results = r.json().get("results", [])
        formatted = [
            {
                "id": c.get("id"),
                "email": c.get("properties", {}).get("email", ""),
                "name": f"{c.get('properties', {}).get('firstname', '')} {c.get('properties', {}).get('lastname', '')}".strip(),
                "company": c.get("properties", {}).get("company", ""),
            }
            for c in results
        ]
        return f"HubSpot contact search results for '{query}' ({len(formatted)} found):\n{json.dumps(formatted, indent=2)}"

    async def _create_deal(self, creds: dict, args: dict) -> str:
        import httpx

        deal_name = args.get("deal_name", args.get("name", "New Deal"))
        amount = str(args.get("amount", "0"))
        stage = args.get("stage", "appointmentscheduled")
        close_date = args.get("close_date", "")

        properties = {
            "dealname": deal_name,
            "amount": amount,
            "dealstage": stage,
        }
        if close_date:
            properties["closedate"] = close_date

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                f"{HUBSPOT_API_BASE}/crm/v3/objects/deals",
                json={"properties": properties},
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: Could not create deal — {r.text[:300]}"

        deal = r.json()
        return f"Created HubSpot deal '{deal_name}'. Deal ID: {deal.get('id')}"

    async def _list_pipelines(self, creds: dict, args: dict) -> str:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(
                f"{HUBSPOT_API_BASE}/crm/v3/pipelines/deals",
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: Could not fetch pipelines — {r.text[:300]}"

        pipelines = r.json().get("results", [])
        formatted = [{"id": p.get("id"), "label": p.get("label"), "stages": [s.get("label") for s in p.get("stages", [])]} for p in pipelines]
        return f"HubSpot Pipelines:\n{json.dumps(formatted, indent=2)}"

    def capabilities(self) -> list:
        return ["Create leads", "Update contacts", "Log notes", "Sync pipeline stages"]
