"""
Slack Integration Provider
===========================
Real implementation using Slack Web API via slack-sdk.

Authentication: Slack OAuth 2.0
Credentials stored: bot_token, team_id, team_name, incoming_webhook_url (encrypted)

Capabilities:
  - Post alerts
  - Send summaries
  - Escalate conversations
  - Share updates
"""

import json
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class SlackProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_slack"

    def _get_client(self, credentials: dict):
        try:
            from slack_sdk import WebClient
            bot_token = credentials.get("bot_token", "")
            if not bot_token:
                raise HTTPException(status_code=400, detail="Slack bot token is missing.")
            return WebClient(token=bot_token)
        except ImportError:
            raise HTTPException(status_code=500, detail="slack-sdk not installed. Run: pip install slack-sdk")

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        if payload.get("_oauth_completed"):
            connected_account = payload.get("connected_account", "Slack Workspace")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        # Check if already have credentials (update/re-connect)
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if creds and creds.get("bot_token"):
            connected_account = payload.get("connected_account") or creds.get("team_name", "Slack Workspace")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        log_info(f"Slack OAuth flow needed for workspace {workspace_id}")
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
            "name": "Slack",
            "category": "Communication",
            "description": "Notify your team and send updates.",
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
        log_info(f"Slack connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Slack disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        creds = credentials
        if not creds.get("bot_token"):
            # Try loading from store
            return True  # Can't validate without creds
        try:
            client = self._get_client(creds)
            response = client.auth_test()
            return response.get("ok", False)
        except Exception as e:
            log_error("Slack validation failed", exc=e)
            return False

    async def refresh(self, workspace_id: str) -> dict:
        # Slack uses long-lived bot tokens — no refresh needed
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("bot_token"):
            return "Error: Slack is not connected. Please authenticate first."

        try:
            client = self._get_client(creds)
            method_lower = method.lower()

            if "message" in method_lower or "post" in method_lower or "send" in method_lower:
                return await self._post_message(client, args)
            elif "channel" in method_lower and "create" in method_lower:
                return await self._create_channel(client, args)
            elif "notify" in method_lower or "escalate" in method_lower or "alert" in method_lower:
                return await self._send_alert(client, args)
            elif "list" in method_lower and "channel" in method_lower:
                return await self._list_channels(client, args)
            elif "user" in method_lower or "lookup" in method_lower:
                return await self._lookup_user(client, args)

            return f"Error: Unknown method '{method}' on Slack. Available: post_message, create_channel, notify, list_channels, lookup_user"

        except Exception as e:
            log_error(f"Slack execute failed for method {method}", exc=e)
            return f"Error: Slack action failed — {str(e)}"

    async def _post_message(self, client, args: dict) -> str:
        channel = args.get("channel", "#general")
        text = args.get("text", args.get("message", ""))
        blocks = args.get("blocks", None)

        if not text and not blocks:
            return "Error: text or blocks are required to post a message."

        params = {"channel": channel, "text": text}
        if blocks:
            params["blocks"] = blocks

        response = client.chat_postMessage(**params)
        if not response.get("ok"):
            return f"Error: Slack returned error — {response.get('error', 'unknown')}"

        return (
            f"Successfully posted message to Slack channel '{channel}'.\n"
            f"Timestamp: {response.get('ts')}"
        )

    async def _create_channel(self, client, args: dict) -> str:
        name = args.get("name", args.get("channel_name", ""))
        is_private = args.get("is_private", False)

        if not name:
            return "Error: channel name is required."

        # Slack channel names: lowercase, no spaces, max 80 chars
        name = name.lower().replace(" ", "-")[:80]

        response = client.conversations_create(name=name, is_private=is_private)
        if not response.get("ok"):
            return f"Error: Could not create Slack channel — {response.get('error', 'unknown')}"

        channel = response.get("channel", {})
        return f"Successfully created Slack channel '#{name}' (ID: {channel.get('id')})"

    async def _send_alert(self, client, args: dict) -> str:
        channel = args.get("channel", "#alerts")
        issue = args.get("issue", args.get("message", "Escalation required"))
        teammate = args.get("teammate", args.get("mention", ""))
        title = args.get("title", "🚨 Alert")

        text = f"*{title}*\n{issue}"
        if teammate:
            text = f"{teammate} {text}"

        response = client.chat_postMessage(channel=channel, text=text)
        if not response.get("ok"):
            return f"Error: Slack returned error — {response.get('error', 'unknown')}"

        return f"Alert dispatched to Slack channel '{channel}'. Timestamp: {response.get('ts')}"

    async def _list_channels(self, client, args: dict) -> str:
        exclude_archived = args.get("exclude_archived", True)
        limit = int(args.get("limit", 20))

        response = client.conversations_list(exclude_archived=exclude_archived, limit=limit)
        if not response.get("ok"):
            return f"Error: {response.get('error', 'unknown')}"

        channels = response.get("channels", [])
        formatted = [
            {"id": c.get("id"), "name": c.get("name"), "is_private": c.get("is_private"), "member_count": c.get("num_members")}
            for c in channels
        ]
        return f"Slack Channels ({len(formatted)} found):\n{json.dumps(formatted, indent=2)}"

    async def _lookup_user(self, client, args: dict) -> str:
        email = args.get("email")
        if not email:
            return "Error: email is required to lookup a Slack user."

        response = client.users_lookupByEmail(email=email)
        if not response.get("ok"):
            return f"Error: User not found — {response.get('error', 'unknown')}"

        user = response.get("user", {})
        return f"Slack User Found:\n{json.dumps({'id': user.get('id'), 'name': user.get('name'), 'display_name': user.get('profile', {}).get('display_name', '')}, indent=2)}"

    def capabilities(self) -> list:
        return ["Post alerts", "Send summaries", "Escalate conversations", "Share updates"]
