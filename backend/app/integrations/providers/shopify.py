"""
Shopify Integration Provider
==============================
Real implementation using Shopify Admin REST API.

Authentication: OAuth 2.0 OR Private App Admin API Token
Credentials stored: access_token, shop (encrypted via credential_store)

Capabilities:
  - Read orders
  - Update fulfillment
  - Check inventory
  - Create draft orders
"""

import json
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException

SHOPIFY_API_VERSION = "2024-07"


class ShopifyProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_shopify"

    def _get_headers(self, creds: dict) -> dict:
        token = creds.get("access_token", "")
        if not token:
            raise HTTPException(status_code=400, detail="Shopify access token is missing.")
        return {
            "X-Shopify-Access-Token": token,
            "Content-Type": "application/json",
        }

    def _api_url(self, shop: str, endpoint: str) -> str:
        shop = shop.rstrip("/")
        if not shop.startswith("https://"):
            shop = f"https://{shop}"
        return f"{shop}/admin/api/{SHOPIFY_API_VERSION}/{endpoint.lstrip('/')}"

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        """
        Connect Shopify. Supports:
        1. OAuth callback (_oauth_completed flag)
        2. Private App / Admin API token (access_token + shop_domain)
        3. Reconnect if credentials already stored
        """
        if payload.get("_oauth_completed"):
            connected_account = payload.get("connected_account", "Shopify Store")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        access_token = (
            credentials.get("access_token")
            or credentials.get("api_key")
            or config.get("access_token")
            or config.get("admin_api_token")
        )
        shop = (
            config.get("shop_domain")
            or config.get("store_url")
            or credentials.get("shop")
        )

        if access_token and shop:
            # Normalize shop domain
            shop = shop.replace("https://", "").replace("http://", "").rstrip("/")
            if not shop.endswith(".myshopify.com"):
                shop = f"{shop}.myshopify.com"

            await self.validate({"shop": shop}, {"access_token": access_token, "shop": shop})

            save_credentials(workspace_id, self.INTEGRATION_ID, {
                "access_token": access_token,
                "shop": shop,
            })

            store_name = await self._get_store_name({"access_token": access_token, "shop": shop})
            connected_account = store_name or shop

            return await self._save_integration_state(workspace_id, {
                **payload,
                "connected_account": connected_account,
                "configuration": {"shop": shop},
            }, connected_account)

        # Check stored creds
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if creds and creds.get("access_token"):
            connected_account = payload.get("connected_account") or creds.get("shop", "Shopify Store")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        log_info(f"Shopify OAuth flow needed for workspace {workspace_id}")
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
            "name": "Shopify",
            "category": "Commerce",
            "description": "Track orders and manage storefront data.",
        }

    async def _get_store_name(self, creds: dict) -> str:
        import httpx
        try:
            shop = creds.get("shop", "")
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    self._api_url(shop, "shop.json"),
                    headers=self._get_headers(creds),
                )
                if r.status_code == 200:
                    return r.json().get("shop", {}).get("name", shop)
        except Exception as e:
            log_error("Failed to fetch Shopify store name", exc=e)
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
        log_info(f"Shopify connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Shopify disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        import httpx
        token = credentials.get("access_token", "")
        shop = credentials.get("shop", config.get("shop", config.get("shop_domain", "")))

        if not token or not shop:
            return True  # Can't validate without credentials

        shop = shop.replace("https://", "").replace("http://", "").rstrip("/")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"https://{shop}/admin/api/{SHOPIFY_API_VERSION}/shop.json",
                    headers={"X-Shopify-Access-Token": token},
                )
                if r.status_code == 401:
                    raise HTTPException(status_code=400, detail="Invalid Shopify access token.")
                if r.status_code == 404:
                    raise HTTPException(status_code=400, detail=f"Shopify store '{shop}' not found.")
                return r.status_code in (200, 201)
        except HTTPException:
            raise
        except Exception as e:
            log_error("Shopify validation failed", exc=e)
            raise HTTPException(status_code=400, detail=f"Could not connect to Shopify store: {str(e)}")

    async def refresh(self, workspace_id: str) -> dict:
        # Shopify access tokens are permanent (don't expire)
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("access_token"):
            return "Error: Shopify is not connected. Please configure credentials first."

        try:
            method_lower = method.lower()

            if "order" in method_lower and ("get" in method_lower or "fetch" in method_lower or "lookup" in method_lower):
                return await self._get_order(creds, args)
            elif "list" in method_lower and "order" in method_lower:
                return await self._list_orders(creds, args)
            elif "product" in method_lower or "inventory" in method_lower or "list" in method_lower:
                return await self._list_products(creds, args)
            elif "fulfill" in method_lower:
                return await self._fulfill_order(creds, args)
            elif "draft" in method_lower or "create" in method_lower and "order" in method_lower:
                return await self._create_draft_order(creds, args)
            elif "cancel" in method_lower:
                return await self._cancel_order(creds, args)

            return f"Error: Unknown method '{method}' on Shopify. Available: get_order, list_orders, list_products, fulfill, create_draft_order, cancel"

        except Exception as e:
            log_error(f"Shopify execute failed for method {method}", exc=e)
            return f"Error: Shopify action failed — {str(e)}"

    async def _get_order(self, creds: dict, args: dict) -> str:
        import httpx
        order_id = args.get("order_id")
        if not order_id:
            return "Error: order_id is required."

        shop = creds.get("shop", "")
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                self._api_url(shop, f"orders/{order_id}.json"),
                headers=self._get_headers(creds),
            )

        if r.status_code == 404:
            return f"Error: Order #{order_id} not found."
        if r.status_code not in (200, 201):
            return f"Error: Shopify API returned {r.status_code} — {r.text[:200]}"

        order = r.json().get("order", {})
        safe = {
            "id": order.get("id"),
            "order_number": order.get("order_number"),
            "financial_status": order.get("financial_status"),
            "fulfillment_status": order.get("fulfillment_status"),
            "total_price": order.get("total_price"),
            "currency": order.get("currency"),
            "email": order.get("email", ""),
            "customer_name": f"{order.get('customer', {}).get('first_name', '')} {order.get('customer', {}).get('last_name', '')}".strip(),
            "line_items": [
                {"title": i.get("title"), "quantity": i.get("quantity"), "price": i.get("price")}
                for i in order.get("line_items", [])
            ],
            "tracking_number": order.get("fulfillments", [{}])[0].get("tracking_number", "") if order.get("fulfillments") else "",
        }
        return f"Shopify Order #{order.get('order_number')}:\n{json.dumps(safe, indent=2)}"

    async def _list_orders(self, creds: dict, args: dict) -> str:
        import httpx
        shop = creds.get("shop", "")
        status = args.get("status", "any")
        limit = int(args.get("limit", 10))

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                self._api_url(shop, "orders.json"),
                params={"status": status, "limit": limit},
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: {r.text[:200]}"

        orders = r.json().get("orders", [])
        formatted = [
            {
                "id": o.get("id"),
                "order_number": o.get("order_number"),
                "status": o.get("fulfillment_status"),
                "financial_status": o.get("financial_status"),
                "total_price": o.get("total_price"),
                "customer": f"{o.get('customer', {}).get('first_name', '')} {o.get('customer', {}).get('last_name', '')}".strip(),
            }
            for o in orders
        ]
        return f"Shopify Orders ({len(formatted)} found):\n{json.dumps(formatted, indent=2)}"

    async def _list_products(self, creds: dict, args: dict) -> str:
        import httpx
        shop = creds.get("shop", "")
        limit = int(args.get("limit", 20))
        title_filter = args.get("title", args.get("query", ""))

        params = {"limit": limit}
        if title_filter:
            params["title"] = title_filter

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                self._api_url(shop, "products.json"),
                params=params,
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: {r.text[:200]}"

        products = r.json().get("products", [])
        formatted = [
            {
                "id": p.get("id"),
                "title": p.get("title"),
                "status": p.get("status"),
                "variants": len(p.get("variants", [])),
                "price": p.get("variants", [{}])[0].get("price", "N/A") if p.get("variants") else "N/A",
                "inventory_quantity": sum(v.get("inventory_quantity", 0) for v in p.get("variants", [])),
            }
            for p in products
        ]
        return f"Shopify Products ({len(formatted)} found):\n{json.dumps(formatted, indent=2)}"

    async def _fulfill_order(self, creds: dict, args: dict) -> str:
        import httpx
        shop = creds.get("shop", "")
        order_id = args.get("order_id")
        tracking_number = args.get("tracking_number", "")
        tracking_company = args.get("tracking_company", args.get("carrier", ""))
        notify_customer = args.get("notify_customer", True)

        if not order_id:
            return "Error: order_id is required for fulfillment."

        fulfillment_data = {
            "fulfillment": {
                "notify_customer": notify_customer,
                "tracking_info": {},
            }
        }
        if tracking_number:
            fulfillment_data["fulfillment"]["tracking_info"]["number"] = tracking_number
        if tracking_company:
            fulfillment_data["fulfillment"]["tracking_info"]["company"] = tracking_company

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                self._api_url(shop, f"orders/{order_id}/fulfillments.json"),
                json=fulfillment_data,
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: Fulfillment failed — {r.text[:300]}"

        result = r.json().get("fulfillment", {})
        return (
            f"Shopify Order #{order_id} marked as fulfilled.\n"
            f"Fulfillment ID: {result.get('id')}\n"
            f"Tracking: {result.get('tracking_number', 'N/A')} via {result.get('tracking_company', 'N/A')}\n"
            f"Status: {result.get('status')}"
        )

    async def _create_draft_order(self, creds: dict, args: dict) -> str:
        import httpx
        shop = creds.get("shop", "")

        line_items = args.get("line_items", [])
        if not line_items:
            return "Error: line_items are required to create a draft order."

        customer_email = args.get("email", "")
        note = args.get("note", "")

        draft_data = {
            "draft_order": {
                "line_items": line_items,
                "note": note,
            }
        }
        if customer_email:
            draft_data["draft_order"]["customer"] = {"email": customer_email}

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                self._api_url(shop, "draft_orders.json"),
                json=draft_data,
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: Draft order creation failed — {r.text[:300]}"

        draft = r.json().get("draft_order", {})
        return (
            f"Shopify Draft Order created.\n"
            f"Draft Order ID: {draft.get('id')}\n"
            f"Invoice URL: {draft.get('invoice_url', '')}\n"
            f"Status: {draft.get('status')}"
        )

    async def _cancel_order(self, creds: dict, args: dict) -> str:
        import httpx
        shop = creds.get("shop", "")
        order_id = args.get("order_id")
        reason = args.get("reason", "customer")
        email = args.get("email", True)

        if not order_id:
            return "Error: order_id is required to cancel an order."

        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(
                self._api_url(shop, f"orders/{order_id}/cancel.json"),
                json={"reason": reason, "email": email},
                headers=self._get_headers(creds),
            )

        if r.status_code not in (200, 201):
            return f"Error: Order cancellation failed — {r.text[:200]}"

        return f"Shopify Order #{order_id} cancelled successfully. Reason: {reason}"

    def capabilities(self) -> list:
        return ["Read orders", "Update fulfillment", "Check inventory", "Create draft orders"]
