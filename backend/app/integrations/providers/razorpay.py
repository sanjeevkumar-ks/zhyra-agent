"""
Razorpay Integration Provider
================================
Real implementation using Razorpay Python SDK v2.

Authentication: API Key (key_id + key_secret)
Credentials stored: key_id, key_secret (encrypted via credential_store)

Capabilities:
  - Generate payment links
  - Verify payments
  - Check status
  - Share receipts / initiate refunds
"""

import json
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class RazorpayProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_razorpay"

    def _get_client(self, creds: dict):
        try:
            import razorpay
            key_id = creds.get("key_id", "")
            key_secret = creds.get("key_secret", "")
            if not key_id or not key_secret:
                raise HTTPException(status_code=400, detail="Razorpay key_id and key_secret are required.")
            return razorpay.Client(auth=(key_id, key_secret))
        except ImportError:
            raise HTTPException(status_code=500, detail="razorpay package not installed. Run: pip install razorpay")

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        key_id = config.get("key_id") or credentials.get("key_id") or credentials.get("api_key")
        key_secret = config.get("key_secret") or credentials.get("key_secret")

        if not key_id:
            raise HTTPException(status_code=400, detail="Razorpay Key ID is required.")
        if not key_secret:
            raise HTTPException(status_code=400, detail="Razorpay Key Secret is required.")

        # Validate credentials with a live call
        await self.validate(config, {"key_id": key_id, "key_secret": key_secret})

        # Store encrypted credentials
        save_credentials(workspace_id, self.INTEGRATION_ID, {
            "key_id": key_id,
            "key_secret": key_secret,
        })

        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        integration_data = {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": True,
            "synced_agents": payload.get("synced_agents", []),
            "last_sync": "Just now",
            "health": 100,
            "config": {"key_id": key_id},  # Never store key_secret in config
            "connected_account": payload.get("connected_account") or key_id,
        }
        doc_ref.set(integration_data, merge=True)
        log_info(f"Razorpay connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Razorpay disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        key_id = credentials.get("key_id", config.get("key_id", ""))
        key_secret = credentials.get("key_secret", config.get("key_secret", ""))

        if not key_id:
            raise HTTPException(status_code=400, detail="Razorpay Key ID is required.")
        if not key_secret:
            raise HTTPException(status_code=400, detail="Razorpay Key Secret is required.")

        try:
            import razorpay
            client = razorpay.Client(auth=(key_id, key_secret))
            # Lightweight validation: list payments with count=1
            client.payment.all({"count": 1})
            return True
        except ImportError:
            raise HTTPException(status_code=500, detail="razorpay package not installed.")
        except Exception as e:
            error_str = str(e).lower()
            if "401" in error_str or "unauthorized" in error_str or "authentication" in error_str:
                raise HTTPException(status_code=400, detail="Invalid Razorpay Key ID or Key Secret.")
            log_error("Razorpay validation failed", exc=e)
            raise HTTPException(status_code=400, detail=f"Razorpay validation failed: {str(e)}")

    async def refresh(self, workspace_id: str) -> dict:
        # API key providers don't need refresh
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("key_id"):
            return "Error: Razorpay is not connected. Please configure API keys first."

        try:
            client = self._get_client(creds)
            method_lower = method.lower()

            if any(k in method_lower for k in ("get", "lookup", "status", "fetch")):
                return await self._fetch_payment(client, args)
            elif "refund" in method_lower:
                return await self._create_refund(client, args)
            elif any(k in method_lower for k in ("link", "generate", "create_link")):
                return await self._create_payment_link(client, args)
            elif "order" in method_lower:
                return await self._create_order(client, args)
            elif "settlement" in method_lower or "payout" in method_lower:
                return await self._list_settlements(client, args)

            return f"Error: Unknown method '{method}' on Razorpay. Available: fetch_payment, refund, create_payment_link, create_order, settlements"

        except HTTPException:
            raise
        except Exception as e:
            log_error(f"Razorpay execute failed for method {method}", exc=e)
            return f"Error: Razorpay action failed — {str(e)}"

    async def _fetch_payment(self, client, args: dict) -> str:
        payment_id = args.get("payment_id")
        if not payment_id:
            return "Error: payment_id is required."

        payment = client.payment.fetch(payment_id)
        # Sanitize — never return any auth data
        safe_payment = {
            "id": payment.get("id"),
            "entity": payment.get("entity"),
            "amount": payment.get("amount"),
            "currency": payment.get("currency"),
            "status": payment.get("status"),
            "order_id": payment.get("order_id"),
            "description": payment.get("description", ""),
            "email": payment.get("email", ""),
            "contact": payment.get("contact", ""),
            "method": payment.get("method", ""),
            "captured": payment.get("captured"),
            "created_at": payment.get("created_at"),
        }
        return f"Razorpay Payment Record:\n{json.dumps(safe_payment, indent=2)}"

    async def _create_refund(self, client, args: dict) -> str:
        payment_id = args.get("payment_id")
        amount = args.get("amount")  # In paise if INR
        notes = args.get("notes", {})

        if not payment_id:
            return "Error: payment_id is required for refunds."

        refund_data = {"speed": "normal"}
        if amount:
            refund_data["amount"] = int(amount)
        if notes:
            refund_data["notes"] = notes

        refund = client.payment.refund(payment_id, refund_data)
        return (
            f"Razorpay refund initiated successfully.\n"
            f"Refund ID: {refund.get('id')}\n"
            f"Amount: {refund.get('amount')} paise ({refund.get('currency', 'INR')})\n"
            f"Status: {refund.get('status')}"
        )

    async def _create_payment_link(self, client, args: dict) -> str:
        amount = int(args.get("amount", 0))
        currency = args.get("currency", "INR")
        description = args.get("description", args.get("desc", "Payment Request"))
        customer_name = args.get("customer_name", args.get("name", ""))
        customer_email = args.get("customer_email", args.get("email", ""))
        customer_phone = args.get("customer_phone", args.get("phone", ""))
        expire_by = args.get("expire_by", None)

        if amount <= 0:
            return "Error: amount is required and must be greater than 0 (in paise for INR)."

        link_data = {
            "amount": amount,
            "currency": currency,
            "description": description,
            "customer": {
                "name": customer_name,
                "email": customer_email,
                "contact": customer_phone,
            },
        }
        if expire_by:
            link_data["expire_by"] = expire_by

        result = client.payment_link.create(link_data)
        return (
            f"Razorpay Payment Link created.\n"
            f"Link ID: {result.get('id')}\n"
            f"Short URL: {result.get('short_url')}\n"
            f"Amount: {result.get('amount')} {result.get('currency')}\n"
            f"Status: {result.get('status')}"
        )

    async def _create_order(self, client, args: dict) -> str:
        amount = int(args.get("amount", 0))
        currency = args.get("currency", "INR")
        receipt = args.get("receipt", "")

        if amount <= 0:
            return "Error: amount is required (in paise for INR)."

        order = client.order.create({
            "amount": amount,
            "currency": currency,
            "receipt": receipt,
        })
        return (
            f"Razorpay Order created.\n"
            f"Order ID: {order.get('id')}\n"
            f"Amount: {order.get('amount')} {order.get('currency')}\n"
            f"Status: {order.get('status')}"
        )

    async def _list_settlements(self, client, args: dict) -> str:
        count = int(args.get("count", 5))
        settlements = client.settlement.all({"count": count})
        items = settlements.get("items", [])
        formatted = [
            {
                "id": s.get("id"),
                "amount": s.get("amount"),
                "status": s.get("status"),
                "created_at": s.get("created_at"),
            }
            for s in items
        ]
        return f"Razorpay Settlements ({len(formatted)} records):\n{json.dumps(formatted, indent=2)}"

    def capabilities(self) -> list:
        return ["Generate payment links", "Verify payments", "Check status", "Share receipts"]
