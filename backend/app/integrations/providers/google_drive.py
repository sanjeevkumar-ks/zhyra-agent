"""
Google Drive Integration Provider
===================================
Real implementation using Google Drive API v3.

Authentication: Google OAuth 2.0 (shared client)
Credentials stored: access_token, refresh_token (encrypted via credential_store)

Capabilities:
  - Search documents
  - Read files
  - Index folders
  - Sync knowledge
"""

import json
import io
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class GoogleDriveProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_gdrive"

    def _get_drive_service(self, credentials: dict):
        try:
            from googleapiclient.discovery import build
            from app.integrations.oauth_helpers import build_google_credentials

            creds = build_google_credentials(
                access_token=credentials.get("access_token", ""),
                refresh_token=credentials.get("refresh_token", ""),
            )
            return build("drive", "v3", credentials=creds, cache_discovery=False)
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

        log_info(f"Google Drive OAuth flow needed for workspace {workspace_id}")
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
            "name": "Google Drive",
            "category": "Productivity",
            "description": "Retrieve knowledge from documents.",
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
        log_info(f"Google Drive connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Google Drive disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        if not credentials.get("access_token"):
            return True
        try:
            service = self._get_drive_service(credentials)
            service.about().get(fields="user").execute()
            return True
        except Exception as e:
            log_error("Google Drive validation failed", exc=e)
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
            log_info(f"Google Drive token refreshed for workspace {workspace_id}")
            return {"access_token": new_tokens["access_token"], "expires_in": new_tokens["expires_in"]}
        except Exception as e:
            log_error("Google Drive token refresh failed", exc=e)
            return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> str:
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("access_token"):
            return "Error: Google Drive is not connected. Please authenticate first."

        try:
            service = self._get_drive_service(creds)
            method_lower = method.lower()

            if "search" in method_lower or "list" in method_lower:
                return await self._search_files(service, args)
            elif "read" in method_lower or "content" in method_lower:
                return await self._read_file(service, args)
            elif "upload" in method_lower:
                return await self._upload_file(service, args)
            elif "share" in method_lower:
                return await self._share_file(service, args)

            return f"Error: Unknown method '{method}' on Google Drive. Available: search, read, upload, share"

        except Exception as e:
            log_error(f"Google Drive execute failed for method {method}", exc=e)
            return f"Error: Google Drive action failed — {str(e)}"

    async def _search_files(self, service, args: dict) -> str:
        query = args.get("query", "")
        folder_id = args.get("folder_id", "")
        max_results = int(args.get("max_results", 20))

        q_parts = []
        if query:
            q_parts.append(f"name contains '{query}' or fullText contains '{query}'")
        if folder_id:
            q_parts.append(f"'{folder_id}' in parents")
        q_parts.append("trashed = false")

        q = " and ".join(q_parts)
        result = service.files().list(
            q=q,
            pageSize=max_results,
            fields="files(id, name, mimeType, modifiedTime, size, webViewLink)",
        ).execute()
        files = result.get("files", [])

        if not files:
            return f"No files found matching '{query}' in Google Drive."

        return f"Google Drive search results ({len(files)} found):\n{json.dumps(files, indent=2)}"

    async def _read_file(self, service, args: dict) -> str:
        file_id = args.get("file_id")
        if not file_id:
            return "Error: file_id is required to read a file."

        # Get file metadata first
        file_meta = service.files().get(fileId=file_id, fields="name,mimeType").execute()
        mime_type = file_meta.get("mimeType", "")
        file_name = file_meta.get("name", file_id)

        # Google Docs/Sheets/Slides — export as plain text
        export_mime_map = {
            "application/vnd.google-apps.document": "text/plain",
            "application/vnd.google-apps.spreadsheet": "text/csv",
            "application/vnd.google-apps.presentation": "text/plain",
        }

        try:
            if mime_type in export_mime_map:
                export_mime = export_mime_map[mime_type]
                content = service.files().export(fileId=file_id, mimeType=export_mime).execute()
                if isinstance(content, bytes):
                    content = content.decode("utf-8", errors="replace")
                text_preview = content[:3000] + ("..." if len(content) > 3000 else "")
                return f"Google Drive File '{file_name}' (exported as text):\n\n{text_preview}"
            else:
                # Binary file — return metadata only
                return f"Google Drive File '{file_name}' (binary file, type: {mime_type}). File ID: {file_id}"
        except Exception as e:
            log_error(f"Error reading Google Drive file {file_id}", exc=e)
            return f"Error: Could not read file '{file_name}' — {str(e)}"

    async def _upload_file(self, service, args: dict) -> str:
        name = args.get("name", "untitled.txt")
        content = args.get("content", "")
        mime_type = args.get("mime_type", "text/plain")
        parent_folder_id = args.get("folder_id", "")

        from googleapiclient.http import MediaInMemoryUpload
        file_metadata = {"name": name}
        if parent_folder_id:
            file_metadata["parents"] = [parent_folder_id]

        media = MediaInMemoryUpload(content.encode("utf-8") if isinstance(content, str) else content, mimetype=mime_type)
        result = service.files().create(body=file_metadata, media_body=media, fields="id,name,webViewLink").execute()
        return (
            f"Successfully uploaded '{name}' to Google Drive.\n"
            f"File ID: {result.get('id')}\n"
            f"View: {result.get('webViewLink', '')}"
        )

    async def _share_file(self, service, args: dict) -> str:
        file_id = args.get("file_id")
        email = args.get("email")
        role = args.get("role", "reader")  # reader, writer, commenter

        if not file_id or not email:
            return "Error: file_id and email are required to share a file."

        permission = {"type": "user", "role": role, "emailAddress": email}
        service.permissions().create(fileId=file_id, body=permission, sendNotificationEmail=True).execute()
        return f"Successfully shared Google Drive file '{file_id}' with {email} (role: {role})."

    def capabilities(self) -> list:
        return ["Search documents", "Read files", "Index folders", "Sync knowledge"]
