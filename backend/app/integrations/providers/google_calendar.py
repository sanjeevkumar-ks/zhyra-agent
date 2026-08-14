"""
Google Calendar Integration Provider
=====================================
Real implementation using Google Calendar API v3.

Authentication: Google OAuth 2.0
Credentials stored: access_token, refresh_token (encrypted via credential_store)
Auto-refresh: Yes — access token refreshed transparently before every API call

Capabilities:
  - Check availability (list events)
  - Create events
  - Update meetings
  - Cancel bookings
"""

import json
from typing import Optional
from app.integrations.providers.base_provider import BaseIntegrationProvider
from app.integrations.credential_store import save_credentials, load_credentials, delete_credentials
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
from fastapi import HTTPException


class GoogleCalendarProvider(BaseIntegrationProvider):

    INTEGRATION_ID = "int_gcal"

    def _get_calendar_service(self, credentials: dict):
        """
        Build an authenticated Google Calendar API service.
        Auto-refreshes the access token if expired.
        """
        try:
            from googleapiclient.discovery import build
            from app.integrations.oauth_helpers import build_google_credentials

            creds = build_google_credentials(
                access_token=credentials.get("access_token", ""),
                refresh_token=credentials.get("refresh_token", ""),
            )
            service = build("calendar", "v3", credentials=creds, cache_discovery=False)
            return service
        except ImportError as e:
            raise HTTPException(
                status_code=500,
                detail="Google API client library not installed. Run: pip install google-api-python-client"
            )

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        """
        Connect Google Calendar.
        
        If _oauth_completed flag is present (set by OAuth callback), credentials are
        already stored — just update the Firestore integration state.
        
        Otherwise, return an OAuth redirect instruction for the frontend.
        """
        if payload.get("_oauth_completed"):
            # OAuth flow already finished — just save the integration state
            connected_account = payload.get("connected_account", "Google Account")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        # Check if credentials are already stored (re-connecting or updating agents)
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if creds and creds.get("access_token"):
            connected_account = payload.get("connected_account") or creds.get("email", "Google Account")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        # No credentials yet — need OAuth
        log_info(f"Google Calendar OAuth flow needed for workspace {workspace_id}")
        return {
            "id": self.INTEGRATION_ID,
            "workspace_id": workspace_id,
            "connected": False,
            "oauth_redirect": True,
            "oauth_url": None,  # Frontend will call /oauth/authorize/int_gcal to get the URL
            "synced_agents": [],
            "last_sync": "Never",
            "health": 0,
            "config": {},
            "connected_account": None,
            "name": "Google Calendar",
            "category": "Productivity",
            "description": "Schedule meetings and manage availability.",
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
        log_info(f"Google Calendar connected for workspace {workspace_id}")
        return integration_data

    async def disconnect(self, workspace_id: str) -> None:
        delete_credentials(workspace_id, self.INTEGRATION_ID)
        doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
        doc_ref.delete()
        log_info(f"Google Calendar disconnected for workspace {workspace_id}")

    async def validate(self, config: dict, credentials: dict) -> bool:
        """Validate by trying to list the user's calendar list."""
        if not credentials.get("access_token"):
            return False

        try:
            service = self._get_calendar_service(credentials)
            service.calendarList().list(maxResults=1).execute()
            return True
        except Exception as e:
            log_error("Google Calendar validation failed", exc=e)
            return False

    async def refresh(self, workspace_id: str) -> dict:
        """Refresh the Google OAuth access token using the stored refresh token."""
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("refresh_token"):
            return {}

        try:
            from app.integrations.oauth_helpers import refresh_google_token
            new_tokens = await refresh_google_token(creds["refresh_token"])
            creds["access_token"] = new_tokens["access_token"]
            save_credentials(workspace_id, self.INTEGRATION_ID, creds)
            
            # Set readiness status to READY in Firestore
            doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
            doc_ref.update({
                "integration_ready_status": "READY",
                "health": 100,
                "last_sync": "Just now"
            })
            log_info(f"Google Calendar token refreshed and set READY for workspace {workspace_id}")
            return {"access_token": new_tokens["access_token"], "expires_in": new_tokens["expires_in"]}
        except Exception as e:
            log_error("Google Calendar token refresh failed", exc=e)
            return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> dict:
        """Execute a Google Calendar action using real API calls and return structured dict."""
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("access_token"):
            from app.ai.integration.normalizer import ToolResultNormalizer
            return ToolResultNormalizer.normalize_error(
                "GoogleCalendar", method, "NOT_CONNECTED", "Google Calendar integration is disconnected."
            )

        try:
            service = self._get_calendar_service(creds)
            method_lower = method.lower()

            if "list" in method_lower or "availability" in method_lower:
                res = await self._list_events(service, args)
            elif "create" in method_lower or "schedule" in method_lower:
                res = await self._create_event(service, args)
            elif "cancel" in method_lower or "delete" in method_lower:
                res = await self._delete_event(service, args)
            elif "update" in method_lower:
                res = await self._update_event(service, args)
            else:
                from app.ai.integration.normalizer import ToolResultNormalizer
                return ToolResultNormalizer.normalize_error(
                    "GoogleCalendar", method, "CONFIGURATION_ERROR", f"Unknown method '{method}'."
                )
            
            # Return normalized dictionary result
            from app.ai.integration.normalizer import ToolResultNormalizer
            return ToolResultNormalizer.normalize_response("GoogleCalendar", method, res)

        except Exception as e:
            log_error(f"Google Calendar execute failed for method {method}", exc=e)
            err_msg = str(e).lower()
            err_code = "PROVIDER_ERROR"
            action_req = "Verify integration settings."
            
            if "disabled" in err_msg or "not enabled" in err_msg:
                err_code = "API_DISABLED"
                action_req = "Enable Google Calendar API in Google Cloud Console."
            elif "invalid credentials" in err_msg or "auth" in err_msg or "401" in err_msg:
                err_code = "REAUTH_REQUIRED"
                action_req = "Reconnect your Google Calendar integration."
            
            from app.ai.integration.normalizer import ToolResultNormalizer
            return ToolResultNormalizer.normalize_error(
                "GoogleCalendar", method, err_code, str(e), action_req
            )

    async def _list_events(self, service, args: dict) -> list:
        import datetime
        calendar_id = args.get("calendar_id", "primary")
        time_min = args.get("time_min", datetime.datetime.utcnow().isoformat() + "Z")
        time_max = args.get("time_max", "")
        max_results = int(args.get("max_results", 10))

        params = {
            "calendarId": calendar_id,
            "timeMin": time_min,
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if time_max:
            params["timeMax"] = time_max

        result = service.events().list(**params).execute()
        return result.get("items", [])

    async def _create_event(self, service, args: dict) -> dict:
        import datetime
        calendar_id = args.get("calendar_id", "primary")
        summary = args.get("summary", args.get("title", "New Meeting"))
        start = args.get("start_time", args.get("start", ""))
        end = args.get("end_time", args.get("end", ""))
        description = args.get("description", "")
        attendees = args.get("attendees", [])
        timezone = args.get("timezone", "UTC")

        if not start:
            now = datetime.datetime.utcnow()
            start = now.isoformat() + "Z"
            end = (now + datetime.timedelta(hours=1)).isoformat() + "Z"
        if not end:
            from dateutil import parser as dtparser
            start_dt = dtparser.parse(start)
            end = (start_dt + datetime.timedelta(minutes=30)).isoformat()

        event_body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start, "timeZone": timezone},
            "end": {"dateTime": end, "timeZone": timezone},
        }
        if attendees:
            event_body["attendees"] = [{"email": a} for a in attendees]

        result = service.events().insert(calendarId=calendar_id, body=event_body).execute()
        return result

    async def _delete_event(self, service, args: dict) -> dict:
        calendar_id = args.get("calendar_id", "primary")
        event_id = args.get("event_id")
        if not event_id:
            raise ValueError("event_id is required.")

        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        return {"id": event_id, "status": "deleted"}

    async def _update_event(self, service, args: dict) -> dict:
        calendar_id = args.get("calendar_id", "primary")
        event_id = args.get("event_id")
        if not event_id:
            raise ValueError("event_id is required.")

        event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()

        if "summary" in args:
            event["summary"] = args["summary"]
        if "description" in args:
            event["description"] = args["description"]
        if "start_time" in args or "start" in args:
            event["start"]["dateTime"] = args.get("start_time", args.get("start"))
        if "end_time" in args or "end" in args:
            event["end"]["dateTime"] = args.get("end_time", args.get("end"))

        result = service.events().update(calendarId=calendar_id, eventId=event_id, body=event).execute()
        return result

    def capabilities(self) -> list:
        return ["Check availability", "Create events", "Update meetings", "Cancel bookings"]
