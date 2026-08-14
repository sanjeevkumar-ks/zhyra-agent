"""
Gmail Integration Provider
==========================
Real implementation using Gmail API v1.

Authentication: Google OAuth 2.0 (shared client with other Google integrations)
Credentials stored: access_token, refresh_token (encrypted via credential_store)

Capabilities:
  - Read inbox
  - Draft replies
  - Send emails
  - Label threads / search
"""

import json
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class GmailProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_gmail"

    def _get_gmail_service(self, credentials: dict):
        try:
            from googleapiclient.discovery import build
            from app.integrations.oauth_helpers import build_google_credentials

            creds = build_google_credentials(
                access_token=credentials.get("access_token", ""),
                refresh_token=credentials.get("refresh_token", ""),
            )
            return build("gmail", "v1", credentials=creds, cache_discovery=False)
        except ImportError:
            raise HTTPException(status_code=500, detail="google-api-python-client not installed.")

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        if payload.get("_oauth_completed"):
            connected_account = payload.get("connected_account", "Google Account")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if creds and creds.get("access_token"):
            connected_account = payload.get("connected_account") or creds.get("email", "Google Account")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        log_info(f"Gmail OAuth flow needed for workspace {workspace_id}")
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
            "name": "Gmail",
            "category": "Productivity",
            "description": "Read, draft and send emails.",
        }

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
        log_info(f"Gmail connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Gmail disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        if not credentials.get("access_token"):
            return True
        try:
            service = self._get_gmail_service(credentials)
            service.users().getProfile(userId="me").execute()
            return True
        except Exception as e:
            log_error("Gmail validation failed", exc=e)
            return False

    async def refresh(self, workspace_id: str) -> dict:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("refresh_token"):
            return {}
        try:
            from app.integrations.oauth_helpers import refresh_google_token
            new_tokens = await refresh_google_token(creds["refresh_token"])
            creds["access_token"] = new_tokens["access_token"]
            save_credentials(workspace_id, self.INTEGRATION_ID, creds)
            log_info(f"Gmail token refreshed for workspace {workspace_id}")
            return {"access_token": new_tokens["access_token"], "expires_in": new_tokens["expires_in"]}
        except Exception as e:
            log_error("Gmail token refresh failed", exc=e)
            return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("access_token"):
            return "Error: Gmail is not connected. Please authenticate first."

        try:
            service = self._get_gmail_service(creds)
            method_lower = method.lower()

            if "send" in method_lower:
                return await self._send_email(service, args)
            elif "read" in method_lower or "get" in method_lower:
                return await self._read_email(service, args)
            elif "draft" in method_lower:
                return await self._create_draft(service, args)
            elif "search" in method_lower or "list" in method_lower:
                return await self._search_emails(service, args)
            elif "label" in method_lower:
                return await self._label_thread(service, args)

            return f"Error: Unknown method '{method}' on Gmail. Available: send, read, draft, search, label"

        except Exception as e:
            log_error(f"Gmail execute failed for method {method}", exc=e)
            return f"Error: Gmail action failed — {str(e)}"

    def _build_message(self, to: str, subject: str, body: str, from_email: str = "me") -> dict:
        """Build a base64-encoded RFC 2822 message."""
        message = MIMEText(body, "plain")
        message["to"] = to
        message["from"] = from_email
        message["subject"] = subject
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        return {"raw": raw}

    async def _send_email(self, service, args: dict) -> str:
        to = args.get("to")
        subject = args.get("subject", "Message from AI Agent")
        body = args.get("body", args.get("message", ""))
        if not to:
            return "Error: Recipient email ('to') is required."

        message_body = self._build_message(to, subject, body)
        result = service.users().messages().send(userId="me", body=message_body).execute()
        return f"Successfully sent email to {to} with subject '{subject}'. Message ID: {result.get('id')}"

    async def _read_email(self, service, args: dict) -> str:
        message_id = args.get("message_id")
        if not message_id:
            return "Error: message_id is required to read an email."

        result = service.users().messages().get(userId="me", id=message_id, format="full").execute()
        headers = {h["name"]: h["value"] for h in result.get("payload", {}).get("headers", [])}
        snippet = result.get("snippet", "")

        email_data = {
            "id": result.get("id"),
            "from": headers.get("From", ""),
            "to": headers.get("To", ""),
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "snippet": snippet,
        }
        return f"Gmail Email Details:\n{json.dumps(email_data, indent=2)}"

    async def _create_draft(self, service, args: dict) -> str:
        to = args.get("to", "")
        subject = args.get("subject", "Draft response")
        body = args.get("body", "")

        message_body = self._build_message(to, subject, body)
        draft_body = {"message": message_body}
        result = service.users().drafts().create(userId="me", body=draft_body).execute()
        return f"Successfully created Gmail draft for '{to}'. Draft ID: {result.get('id')}"

    async def _search_emails(self, service, args: dict) -> str:
        query = args.get("query", "")
        max_results = int(args.get("max_results", 10))

        result = service.users().messages().list(userId="me", q=query, maxResults=max_results).execute()
        messages = result.get("messages", [])

        if not messages:
            return f"No emails found matching query '{query}'."

        formatted = [{"id": m["id"], "threadId": m.get("threadId", "")} for m in messages]
        return f"Gmail search results for '{query}' ({len(formatted)} found):\n{json.dumps(formatted, indent=2)}"

    async def _label_thread(self, service, args: dict) -> str:
        thread_id = args.get("thread_id")
        labels_to_add = args.get("labels_to_add", [])
        labels_to_remove = args.get("labels_to_remove", [])

        if not thread_id:
            return "Error: thread_id is required to label a thread."

        service.users().threads().modify(
            userId="me",
            id=thread_id,
            body={"addLabelIds": labels_to_add, "removeLabelIds": labels_to_remove}
        ).execute()
        return f"Successfully updated labels on Gmail thread '{thread_id}'."

    def capabilities(self) -> list:
        return ["Read inbox", "Draft replies", "Send emails", "Label threads"]
