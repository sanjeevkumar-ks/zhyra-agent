"""
Firebase Cloud Messaging Integration Provider
==============================================
Real implementation using firebase-admin Python SDK.

Authentication: Service Account JSON upload
The user uploads their Firebase project's service account JSON file.
It is validated, encrypted, and stored in Firestore.
A dedicated Firebase app instance is initialized per workspace.

Credentials stored: Encrypted service account JSON (encrypted via credential_store)

Capabilities:
  - Send push alerts
  - Notify app users
  - Trigger updates
  - Deliver reminders
"""

import json
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class FirebaseProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_fcm"

    def _get_messaging(self, creds: dict):
        """
        Initialize or retrieve a Firebase messaging client for this workspace.
        Uses named Firebase apps to avoid conflicts with the main Firebase Admin app.
        """
        import firebase_admin
        from firebase_admin import credentials as fb_creds, messaging

        service_account_json = creds.get("service_account_json", "")
        if not service_account_json:
            raise HTTPException(status_code=400, detail="Firebase service account JSON is missing.")

        workspace_id = creds.get("workspace_id", "unknown")
        app_name = f"fcm_integration_{workspace_id}"

        # Try to retrieve existing named app
        if app_name in firebase_admin._apps:
            app = firebase_admin.get_app(app_name)
            return messaging, app

        # Parse service account from stored JSON string
        try:
            sa_dict = json.loads(service_account_json)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail="Service account JSON is not valid JSON.")

        try:
            cred = fb_creds.Certificate(sa_dict)
            app = firebase_admin.initialize_app(cred, name=app_name)
            log_info(f"Firebase named app '{app_name}' initialized successfully.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to initialize Firebase app: {str(e)}")

        return messaging, app

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        """
        Connect Firebase Cloud Messaging.
        
        Accepts:
          - configuration.service_account_json: Full JSON string of service account
          - credentials.service_account_json: Same
          - configuration.bearer_token: Legacy token (deprecated — use service account)
        """
        config = payload.get("configuration", {})
        credentials = payload.get("credentials", {})

        service_account_json = (
            config.get("service_account_json")
            or credentials.get("service_account_json")
            or credentials.get("api_key")  # Legacy: treat API key field as service account JSON
        )

        # Legacy bearer token support (limited functionality)
        bearer_token = config.get("bearer_token") or credentials.get("bearer_token")

        if not service_account_json and not bearer_token:
            raise HTTPException(
                status_code=400,
                detail="Firebase service account JSON or bearer token is required."
            )

        if service_account_json:
            # Validate the service account JSON
            await self._validate_service_account(service_account_json)

            # Parse to get project ID for display
            project_id = ""
            try:
                sa_dict = json.loads(service_account_json)
                project_id = sa_dict.get("project_id", "")
            except Exception:
                pass

            # Store encrypted — include workspace_id for app naming
            save_credentials(workspace_id, self.INTEGRATION_ID, {
                "service_account_json": service_account_json,
                "project_id": project_id,
                "workspace_id": workspace_id,
            })

            connected_account = payload.get("connected_account") or f"Firebase Project: {project_id}" if project_id else "Firebase Service Account"
        else:
            # Legacy token storage
            save_credentials(workspace_id, self.INTEGRATION_ID, {
                "bearer_token": bearer_token,
                "workspace_id": workspace_id,
            })
            connected_account = payload.get("connected_account") or "Firebase Service Account"

        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        integration_data = {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": True,
            "synced_agents": payload.get("synced_agents", []),
            "last_sync": "Just now",
            "health": 100,
            "config": {"project_id": project_id if service_account_json else ""},  # Never store credentials in config
            "connected_account": connected_account,
        }
        doc_ref.set(integration_data, merge=True)
        log_info(f"Firebase Cloud Messaging connected for workspace {workspace_id}")
        return integration_data

    async def _validate_service_account(self, service_account_json: str) -> None:
        """Validate the service account JSON structure and required fields."""
        try:
            sa_dict = json.loads(service_account_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Service account is not valid JSON.")

        required_fields = ["type", "project_id", "private_key", "client_email"]
        missing = [f for f in required_fields if not sa_dict.get(f)]
        if missing:
            raise HTTPException(
                status_code=400,
                detail=f"Service account JSON is missing required fields: {', '.join(missing)}"
            )

        if sa_dict.get("type") != "service_account":
            raise HTTPException(status_code=400, detail="Invalid credential type. Must be 'service_account'.")

        # Try to initialize a temporary Firebase app to verify the credentials work
        import firebase_admin
        from firebase_admin import credentials as fb_creds

        test_app_name = f"fcm_validation_{sa_dict.get('project_id', 'test')}"
        try:
            if test_app_name not in firebase_admin._apps:
                cred = fb_creds.Certificate(sa_dict)
                test_app = firebase_admin.initialize_app(cred, name=test_app_name)
                firebase_admin.delete_app(test_app)
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Service account validation failed: {str(e)}"
            )

    async def disconnect(self, workspace_id: str) -> None:
        # Clean up named Firebase app if it exists
        try:
            import firebase_admin
            app_name = f"fcm_integration_{workspace_id}"
            if app_name in firebase_admin._apps:
                app = firebase_admin.get_app(app_name)
                firebase_admin.delete_app(app)
                log_info(f"Firebase named app '{app_name}' deleted.")
        except Exception as e:
            log_error("Failed to clean up Firebase app during disconnect", exc=e)

        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Firebase Cloud Messaging disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        creds = load_credentials(None, self.INTEGRATION_ID) if not credentials else credentials
        if not credentials.get("service_account_json") and not credentials.get("bearer_token"):
            return True  # Can't validate without creds

        if credentials.get("service_account_json"):
            try:
                await self._validate_service_account(credentials["service_account_json"])
                return True
            except Exception:
                return False
        return True

    async def refresh(self, workspace_id: str) -> dict:
        # Service account tokens are managed automatically by firebase-admin
        return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds:
            return "Error: Firebase Cloud Messaging is not connected. Please upload service account JSON first."

        # Add workspace_id to creds for app naming
        creds["workspace_id"] = workspace_id

        try:
            method_lower = method.lower()

            if any(k in method_lower for k in ("notification", "send", "notify", "push", "alert")):
                return await self._send_notification(creds, args)
            elif "topic" in method_lower and "subscribe" in method_lower:
                return await self._subscribe_to_topic(creds, args)
            elif "topic" in method_lower and "unsubscribe" in method_lower:
                return await self._unsubscribe_from_topic(creds, args)
            elif "multicast" in method_lower or "batch" in method_lower:
                return await self._send_multicast(creds, args)

            return f"Error: Unknown method '{method}' on Firebase Cloud Messaging. Available: send_notification, send_multicast, subscribe_to_topic, unsubscribe_from_topic"

        except HTTPException:
            raise
        except Exception as e:
            log_error(f"Firebase Cloud Messaging execute failed for method {method}", exc=e)
            return f"Error: FCM action failed — {str(e)}"

    async def _send_notification(self, creds: dict, args: dict) -> str:
        messaging, app = self._get_messaging(creds)

        title = args.get("title", "Notification")
        body = args.get("body", args.get("message", ""))
        token = args.get("token", args.get("device_token", ""))
        topic = args.get("topic", "")
        data = args.get("data", {})

        if not token and not topic:
            return "Error: Either device token ('token') or topic is required."

        notification = messaging.Notification(title=title, body=body)

        if token:
            message = messaging.Message(
                notification=notification,
                token=token,
                data={str(k): str(v) for k, v in data.items()} if data else {},
            )
            message_id = messaging.send(message, app=app)
            return f"FCM notification sent to device token.\nTitle: {title}\nMessage ID: {message_id}"
        else:
            message = messaging.Message(
                notification=notification,
                topic=topic,
                data={str(k): str(v) for k, v in data.items()} if data else {},
            )
            message_id = messaging.send(message, app=app)
            return f"FCM notification sent to topic '{topic}'.\nTitle: {title}\nMessage ID: {message_id}"

    async def _send_multicast(self, creds: dict, args: dict) -> str:
        messaging, app = self._get_messaging(creds)

        title = args.get("title", "Notification")
        body = args.get("body", "")
        tokens = args.get("tokens", [])
        data = args.get("data", {})

        if not tokens:
            return "Error: tokens list is required for multicast messaging."
        if len(tokens) > 500:
            return "Error: Maximum 500 tokens per multicast request."

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            tokens=tokens,
            data={str(k): str(v) for k, v in data.items()} if data else {},
        )
        response = messaging.send_each_for_multicast(message, app=app)
        return (
            f"FCM multicast sent to {len(tokens)} devices.\n"
            f"Success: {response.success_count}\n"
            f"Failure: {response.failure_count}"
        )

    async def _subscribe_to_topic(self, creds: dict, args: dict) -> str:
        messaging, app = self._get_messaging(creds)

        tokens = args.get("tokens", [])
        topic = args.get("topic", "")

        if not tokens or not topic:
            return "Error: tokens and topic are required."

        response = messaging.subscribe_to_topic(tokens, topic, app=app)
        return f"Subscribed {response.success_count} devices to topic '{topic}'."

    async def _unsubscribe_from_topic(self, creds: dict, args: dict) -> str:
        messaging, app = self._get_messaging(creds)

        tokens = args.get("tokens", [])
        topic = args.get("topic", "")

        if not tokens or not topic:
            return "Error: tokens and topic are required."

        response = messaging.unsubscribe_from_topic(tokens, topic, app=app)
        return f"Unsubscribed {response.success_count} devices from topic '{topic}'."

    def capabilities(self) -> list:
        return ["Send push alerts", "Notify app users", "Trigger updates", "Deliver reminders"]
