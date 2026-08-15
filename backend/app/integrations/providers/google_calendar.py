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
    async def execute(self, workspace_id: str, method: str, args: dict) -> dict:
        """Execute a Google Calendar action using real API calls and return structured dict."""
        log_info(f"[AUTH] Firebase user workspace verified: {workspace_id}")
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("access_token"):
            log_info(f"[AUTH] OAuth credentials missing for Google Calendar workspace: {workspace_id}")
            from app.ai.integration.normalizer import ToolResultNormalizer
            return ToolResultNormalizer.normalize_error(
                "GoogleCalendar", method, "NOT_CONNECTED", "Google Calendar integration is disconnected."
            )

        log_info(f"[AUTH] OAuth credentials available for workspace {workspace_id}")
        log_info(f"[INTEGRATION] Google Calendar connected for workspace {workspace_id}")

        try:
            service = self._get_calendar_service(creds)
            method_lower = method.lower()

            if "list" in method_lower or "availability" in method_lower:
                return await self._list_events(service, args)
            elif "create" in method_lower or "schedule" in method_lower:
                return await self._create_event(service, args)
            elif "cancel" in method_lower or "delete" in method_lower:
                return await self._delete_event(service, args)
            elif "update" in method_lower:
                return await self._update_event(service, args)
            else:
                from app.ai.integration.normalizer import ToolResultNormalizer
                return ToolResultNormalizer.normalize_error(
                    "GoogleCalendar", method, "CONFIGURATION_ERROR", f"Unknown method '{method}'."
                )

        except Exception as e:
            log_error(f"[GOOGLE] API execution error for method {method}", exc=e)
            err_msg = str(e).lower()
            err_code = "PROVIDER_ERROR"
            action_req = "Verify integration settings."
            
            if "disabled" in err_msg or "not enabled" in err_msg:
                err_code = "API_DISABLED"
                action_req = "Enable Google Calendar API in Google Cloud Console."
            elif "invalid credentials" in err_msg or "auth" in err_msg or "401" in err_msg:
                err_code = "REAUTH_REQUIRED"
                action_req = "Reconnect your Google Calendar integration."
            
            return {
                "success": False,
                "integration": "google_calendar",
                "tool": method,
                "error_code": err_code,
                "message": str(e),
                "action": action_req
            }

    async def _list_events(self, service, args: dict) -> dict:
        import datetime
        from dateutil import parser as dtparser
        from zoneinfo import ZoneInfo

        tz_str = args.get("timezone") or args.get("timeZone") or "Asia/Kolkata"
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
            tz_str = "Asia/Kolkata"

        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        raw_min = args.get("time_min") or args.get("timeMin") or args.get("start_time") or args.get("startTime") or ""
        raw_max = args.get("time_max") or args.get("timeMax") or args.get("end_time") or args.get("endTime") or ""
        max_results = int(args.get("max_results") or args.get("maxResults") or 10)

        if raw_min:
            try:
                dt_min = dtparser.parse(raw_min)
                if dt_min.tzinfo is None:
                    dt_min = dt_min.replace(tzinfo=tz)
                time_min = dt_min.isoformat()
            except Exception:
                time_min = datetime.datetime.now(tz).isoformat()
        else:
            time_min = datetime.datetime.now(tz).isoformat()

        params = {
            "calendarId": calendar_id,
            "timeMin": time_min,
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if raw_max:
            try:
                dt_max = dtparser.parse(raw_max)
                if dt_max.tzinfo is None:
                    dt_max = dt_max.replace(tzinfo=tz)
                params["timeMax"] = dt_max.isoformat()
            except Exception:
                pass

        log_info(f"[GOOGLE] Listing calendar events timeMin={time_min}")
        result = service.events().list(**params).execute()
        log_info(f"[GOOGLE] API response: 200")
        
        events = []
        for item in result.get("items", []):
            events.append({
                "event_id": item.get("id"),
                "title": item.get("summary", "No Title"),
                "start_time": item.get("start", {}).get("dateTime", item.get("start", {}).get("date", "")),
                "end_time": item.get("end", {}).get("dateTime", item.get("end", {}).get("date", "")),
                "html_link": item.get("htmlLink", "")
            })

        return {
            "success": True,
            "integration": "google_calendar",
            "tool": "listEvents",
            "data": {
                "count": len(events),
                "events": events
            }
        }

    async def _create_event(self, service, args: dict) -> dict:
        import datetime
        from dateutil import parser as dtparser
        from zoneinfo import ZoneInfo

        tz_str = args.get("timezone") or args.get("timeZone") or "Asia/Kolkata"
        if tz_str == "UTC":
            tz_str = "Asia/Kolkata"

        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
            tz_str = "Asia/Kolkata"

        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        summary = args.get("summary") or args.get("title") or args.get("name") or "New Meeting"
        start = args.get("start_time") or args.get("startTime") or args.get("start") or ""
        end = args.get("end_time") or args.get("endTime") or args.get("end") or ""
        description = args.get("description", "")
        attendees = args.get("attendees", [])

        now = datetime.datetime.now(tz)
        start_dt = None
        if start:
            try:
                start_dt = dtparser.parse(start)
                if start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=tz)
            except Exception:
                pass

        if not start_dt:
            start_dt = now + datetime.timedelta(days=1)
            start_dt = start_dt.replace(hour=15, minute=0, second=0, microsecond=0)

        end_dt = None
        if end:
            try:
                end_dt = dtparser.parse(end)
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=tz)
            except Exception:
                pass
        if not end_dt:
            end_dt = start_dt + datetime.timedelta(hours=1)

        event_body = {
            "summary": summary,
            "description": description,
            "start": {"dateTime": start_dt.isoformat(), "timeZone": tz_str},
            "end": {"dateTime": end_dt.isoformat(), "timeZone": tz_str},
        }
        if attendees:
            if isinstance(attendees, str):
                attendees = [a.strip() for a in attendees.split(",") if a.strip()]
            event_body["attendees"] = [{"email": a} for a in attendees if isinstance(a, str)]

        log_info(f"[GOOGLE] Creating calendar event '{summary}' for {start_dt.isoformat()} ({tz_str})")
        result = service.events().insert(calendarId=calendar_id, body=event_body).execute()
        
        event_id = result.get("id", "unknown_id")
        html_link = result.get("htmlLink", "")
        log_info(f"[GOOGLE] API response: 200")
        log_info(f"[GOOGLE] Event created: {event_id}")

        return {
            "success": True,
            "integration": "google_calendar",
            "tool": "createEvent",
            "data": {
                "event_id": event_id,
                "title": summary,
                "start_time": start_dt.isoformat(),
                "end_time": end_dt.isoformat(),
                "html_link": html_link
            }
        }

    async def _delete_event(self, service, args: dict) -> dict:
        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        event_id = args.get("event_id") or args.get("eventId") or ""
        summary = args.get("summary") or args.get("title") or args.get("name") or ""

        if not event_id and summary:
            search_res = await self._list_events(service, {"max_results": 20})
            ev_list = search_res.get("data", {}).get("events", [])
            for ev in ev_list:
                if summary.lower() in ev.get("title", "").lower():
                    event_id = ev.get("event_id")
                    break

        if not event_id:
            return {
                "success": False,
                "integration": "google_calendar",
                "tool": "deleteEvent",
                "message": "Event ID not provided and no matching event found."
            }

        log_info(f"[GOOGLE] Deleting calendar event {event_id}")
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        log_info(f"[GOOGLE] API response: 200")

        return {
            "success": True,
            "integration": "google_calendar",
            "tool": "deleteEvent",
            "data": {
                "event_id": event_id,
                "status": "deleted"
            }
        }

    async def _update_event(self, service, args: dict) -> dict:
        import datetime
        from dateutil import parser as dtparser
        from zoneinfo import ZoneInfo

        tz_str = args.get("timezone") or args.get("timeZone") or "Asia/Kolkata"
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
            tz_str = "Asia/Kolkata"

        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        event_id = args.get("event_id") or args.get("eventId") or ""
        summary = args.get("summary") or args.get("title") or args.get("name") or ""
        start = args.get("start_time") or args.get("startTime") or args.get("start") or ""
        end = args.get("end_time") or args.get("endTime") or args.get("end") or ""

        if not event_id:
            # Match upcoming events to find event_id
            search_res = await self._list_events(service, {"max_results": 20, "timezone": tz_str})
            ev_list = search_res.get("data", {}).get("events", [])
            for ev in ev_list:
                if summary and summary.lower() in ev.get("title", "").lower():
                    event_id = ev.get("event_id")
                    break
                elif not summary and ev_list:
                    event_id = ev_list[0].get("event_id")
                    break

        if not event_id:
            return {
                "success": False,
                "integration": "google_calendar",
                "tool": "updateEvent",
                "message": "Event ID not provided and no matching event found."
            }

        event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()

        if summary:
            event["summary"] = summary
        if "description" in args:
            event["description"] = args["description"]

        if start:
            start_dt = dtparser.parse(start)
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=tz)
            event["start"] = {"dateTime": start_dt.isoformat(), "timeZone": tz_str}
            if not end:
                end_dt = start_dt + datetime.timedelta(hours=1)
                event["end"] = {"dateTime": end_dt.isoformat(), "timeZone": tz_str}

        if end:
            end_dt = dtparser.parse(end)
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=tz)
            event["end"] = {"dateTime": end_dt.isoformat(), "timeZone": tz_str}

        log_info(f"[GOOGLE] Updating calendar event {event_id}")
        result = service.events().update(calendarId=calendar_id, eventId=event_id, body=event).execute()
        log_info(f"[GOOGLE] API response: 200")

        return {
            "success": True,
            "integration": "google_calendar",
            "tool": "updateEvent",
            "data": {
                "event_id": result.get("id"),
                "title": result.get("summary"),
                "start_time": result.get("start", {}).get("dateTime"),
                "end_time": result.get("end", {}).get("dateTime"),
                "html_link": result.get("htmlLink", "")
            }
        }

    def capabilities(self) -> list:
        return ["Check availability", "Create events", "Update meetings", "Cancel bookings"]
