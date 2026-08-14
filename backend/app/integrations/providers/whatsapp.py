"""
WhatsApp Business Integration Provider
========================================
Real implementation using WhatsApp Cloud API (Meta Graph API).

Authentication: API Key (permanent access token + phone_number_id)
The access token is a permanent System User token from Meta Business Suite.
Credentials stored: access_token, phone_number_id, business_account_id (encrypted)

Capabilities:
  - Send messages
  - Reply to customers
  - Share updates
  - Route conversations
"""

import json
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException

WHATSAPP_API_VERSION = "v19.0"
WHATSAPP_API_BASE = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"


class WhatsAppProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_whatsapp"

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        # Extract credentials from either config or credentials dict
        access_token = (
            credentials.get("access_token")
            or config.get("access_token")
            or credentials.get("api_key")
            or config.get("api_key")
        )
        phone_number_id = (
            credentials.get("phone_number_id")
            or config.get("phone_number_id")
        )

        if not access_token:
            raise HTTPException(status_code=400, detail="WhatsApp access token is required.")
        if not phone_number_id:
            raise HTTPException(status_code=400, detail="WhatsApp Phone Number ID is required.")

        # Validate by fetching phone number info
        await self.validate(config, {"access_token": access_token, "phone_number_id": phone_number_id})

        # Fetch display phone number for connected_account
        display_number = await self._get_display_number(access_token, phone_number_id)

        # Encrypt and store credentials
        save_credentials(workspace_id, self.INTEGRATION_ID, {
            "access_token": access_token,
            "phone_number_id": phone_number_id,
            "business_account_id": config.get("business_account_id", ""),
        })

        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        integration_data = {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": True,
            "synced_agents": payload.get("synced_agents", []),
            "last_sync": "Just now",
            "health": 100,
            "config": {
                "phone_number_id": phone_number_id,
                "business_account_id": config.get("business_account_id", ""),
            },
            "connected_account": display_number or phone_number_id,
        }
        doc_ref.set(integration_data, merge=True)
        log_info(f"WhatsApp Business connected for workspace {workspace_id}")
        return integration_data

    async def _get_display_number(self, access_token: str, phone_number_id: str) -> str:
        """Fetch the display phone number from Meta API."""
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{WHATSAPP_API_BASE}/{phone_number_id}",
                    params={"fields": "display_phone_number,verified_name"},
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("display_phone_number", data.get("verified_name", ""))
        except Exception as e:
            log_error("Failed to fetch WhatsApp display number", exc=e)
        return ""

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"WhatsApp Business disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        import httpx
        access_token = credentials.get("access_token", config.get("access_token", ""))
        phone_number_id = credentials.get("phone_number_id", config.get("phone_number_id", ""))

        if not access_token or not phone_number_id:
            raise HTTPException(status_code=400, detail="access_token and phone_number_id are required.")

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{WHATSAPP_API_BASE}/{phone_number_id}",
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if response.status_code == 401:
                    raise HTTPException(status_code=400, detail="Invalid WhatsApp access token.")
                if response.status_code == 404:
                    raise HTTPException(status_code=400, detail="WhatsApp Phone Number ID not found.")
                if response.status_code not in (200, 201):
                    raise HTTPException(
                        status_code=400,
                        detail=f"WhatsApp API validation failed: {response.text[:200]}"
                    )
            return True
        except HTTPException:
            raise
        except Exception as e:
            log_error("WhatsApp validation request failed", exc=e)
            raise HTTPException(status_code=400, detail=f"Could not reach WhatsApp API: {str(e)}")

    async def refresh(self, workspace_id: str) -> dict:
        # WhatsApp System User tokens are permanent — no refresh needed
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("access_token"):
            return "Error: WhatsApp Business is not connected. Please configure credentials first."

        try:
            method_lower = method.lower()

            if any(k in method_lower for k in ("message", "send", "reply", "text")):
                return await self._send_text_message(creds, args)
            elif "template" in method_lower:
                return await self._send_template_message(creds, args)
            elif "status" in method_lower or "read" in method_lower:
                return await self._mark_as_read(creds, args)

            return f"Error: Unknown method '{method}' on WhatsApp Business. Available: send_message, send_template, mark_read"

        except Exception as e:
            log_error(f"WhatsApp execute failed for method {method}", exc=e)
            return f"Error: WhatsApp action failed — {str(e)}"

    async def _send_text_message(self, creds: dict, args: dict) -> str:
        import httpx

        phone = args.get("phone", args.get("to", ""))
        text = args.get("text", args.get("body", args.get("message", "")))

        if not phone:
            return "Error: Recipient phone number ('phone' or 'to') is required."
        if not text:
            return "Error: Message text is required."

        # Ensure phone is in E.164 format
        phone = phone.replace("+", "").replace(" ", "").replace("-", "")

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": phone,
            "type": "text",
            "text": {"preview_url": False, "body": text},
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{WHATSAPP_API_BASE}/{creds['phone_number_id']}/messages",
                json=payload,
                headers={
                    "Authorization": f"Bearer {creds['access_token']}",
                    "Content-Type": "application/json",
                },
            )

        data = response.json()
        if response.status_code not in (200, 201):
            error_msg = data.get("error", {}).get("message", "Unknown error")
            return f"Error: WhatsApp message failed — {error_msg}"

        messages = data.get("messages", [{}])
        msg_id = messages[0].get("id", "") if messages else ""
        return f"Successfully sent WhatsApp message to +{phone}. Message ID: {msg_id}"

    async def _send_template_message(self, creds: dict, args: dict) -> str:
        import httpx

        phone = args.get("phone", args.get("to", ""))
        template_name = args.get("template_name", "")
        language_code = args.get("language", "en_US")
        components = args.get("components", [])

        if not phone or not template_name:
            return "Error: phone and template_name are required."

        phone = phone.replace("+", "").replace(" ", "").replace("-", "")

        payload = {
            "messaging_product": "whatsapp",
            "to": phone,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
            },
        }
        if components:
            payload["template"]["components"] = components

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{WHATSAPP_API_BASE}/{creds['phone_number_id']}/messages",
                json=payload,
                headers={
                    "Authorization": f"Bearer {creds['access_token']}",
                    "Content-Type": "application/json",
                },
            )

        data = response.json()
        if response.status_code not in (200, 201):
            error_msg = data.get("error", {}).get("message", "Unknown error")
            return f"Error: WhatsApp template message failed — {error_msg}"

        return f"Successfully sent WhatsApp template '{template_name}' to +{phone}."

    async def _mark_as_read(self, creds: dict, args: dict) -> str:
        import httpx

        message_id = args.get("message_id")
        if not message_id:
            return "Error: message_id is required to mark as read."

        payload = {
            "messaging_product": "whatsapp",
            "status": "read",
            "message_id": message_id,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{WHATSAPP_API_BASE}/{creds['phone_number_id']}/messages",
                json=payload,
                headers={
                    "Authorization": f"Bearer {creds['access_token']}",
                    "Content-Type": "application/json",
                },
            )

        if response.status_code in (200, 201):
            return f"Marked WhatsApp message '{message_id}' as read."
        return f"Error: Could not mark message as read — {response.text[:200]}"

    def capabilities(self) -> list:
        return ["Send messages", "Reply to customers", "Share updates", "Route conversations"]
