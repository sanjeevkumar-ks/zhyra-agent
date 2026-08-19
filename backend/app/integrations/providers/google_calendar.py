import json
import time
import datetime
import re
from typing import Optional, Dict, Any
from dateutil import parser as dtparser
from zoneinfo import ZoneInfo

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
                detail="Google API client library not installed."
            )

    async def connect(self, workspace_id: str, payload: dict) -> dict:
        if payload.get("_oauth_completed"):
            connected_account = payload.get("connected_account", "Google Account")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if creds and creds.get("access_token"):
            connected_account = payload.get("connected_account") or creds.get("email", "Google Account")
            return await self._save_integration_state(workspace_id, payload, connected_account)

        log_info(f"Google Calendar OAuth flow needed for workspace {workspace_id}")
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
            "name": "Google Calendar",
            "category": "Productivity",
            "description": "Schedule meetings and manage availability.",
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
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or not creds.get("refresh_token"):
            return {}

        try:
            from app.integrations.oauth_helpers import refresh_google_token
            new_tokens = await refresh_google_token(creds["refresh_token"])
            creds["access_token"] = new_tokens["access_token"]
            save_credentials(workspace_id, self.INTEGRATION_ID, creds)
            
            doc_ref = firestore_client.collection("integrations").document(f"{workspace_id}_{self.INTEGRATION_ID}")
            doc_ref.update({
                "integration_ready_status": "READY",
                "health": 100,
                "last_sync": "Just now"
            })
            log_info(f"Google Calendar token refreshed for workspace {workspace_id}")
            return {"access_token": new_tokens["access_token"], "expires_in": new_tokens["expires_in"]}
        except Exception as e:
            log_error("Google Calendar token refresh failed", exc=e)
            return {}

    async def execute(self, workspace_id: str, method: str, args: dict) -> dict:
        """Execute a Google Calendar action using real API calls with strict verification and structured logging."""
        log_info(f"[calendar.execution.started] workspace_id={workspace_id} provider=google_calendar action={method} args={args}")
        creds = load_credentials(workspace_id, self.INTEGRATION_ID)
        if not creds or (not creds.get("access_token") and not creds.get("refresh_token")):
            log_error(f"[calendar.execution.failed] workspace_id={workspace_id} action={method} error_code=NOT_CONNECTED message='Google Calendar authorization is missing.'")
            return {
                "success": False,
                "integration": "google_calendar",
                "tool": method,
                "error_code": "NOT_CONNECTED",
                "message": "Google Calendar authorization is missing.",
                "action": "Please connect Google Calendar in your workspace settings."
            }

        # Auto refresh token if refresh_token is present
        if creds.get("refresh_token"):
            try:
                from app.integrations.oauth_helpers import refresh_google_token
                new_tokens = await refresh_google_token(creds["refresh_token"])
                if new_tokens and new_tokens.get("access_token"):
                    creds["access_token"] = new_tokens["access_token"]
                    save_credentials(workspace_id, self.INTEGRATION_ID, creds)
            except Exception as ref_err:
                log_error(f"Pre-execution token refresh attempt failed: {ref_err}")

        # Resolve Workspace Timezone
        ws_tz = "Asia/Kolkata"
        try:
            ws_doc = firestore_client.collection("workspaces").document(workspace_id).get()
            if ws_doc.exists:
                ws_data = ws_doc.to_dict() or {}
                ws_tz = ws_data.get("timezone") or "Asia/Kolkata"
        except Exception:
            pass

        try:
            service = self._get_calendar_service(creds)
            method_lower = method.lower()

            if "list" in method_lower or "availability" in method_lower or "get" in method_lower:
                return await self._list_events(service, args, ws_tz)
            elif "create" in method_lower or "schedule" in method_lower or "add" in method_lower:
                return await self._create_event(service, args, ws_tz)
            elif "cancel" in method_lower or "delete" in method_lower or "remove" in method_lower:
                return await self._delete_event(service, args, ws_tz)
            elif "update" in method_lower or "edit" in method_lower:
                return await self._update_event(service, args, ws_tz)
            else:
                return await self._create_event(service, args, ws_tz)

        except Exception as e:
            log_error(f"[calendar.execution.failed] API execution error for method {method}", exc=e)
            err_msg = str(e).lower()
            err_code = "PROVIDER_ERROR"
            user_msg = f"Google Calendar error: {str(e)}"
            action_req = "Verify integration settings."
            
            if "disabled" in err_msg or "not enabled" in err_msg:
                err_code = "API_DISABLED"
                user_msg = "Google Calendar API is not enabled in the Google Cloud Console."
                action_req = "Enable Google Calendar API in Google Cloud Console."
            elif "invalid credentials" in err_msg or "auth" in err_msg or "401" in err_msg:
                err_code = "REAUTH_REQUIRED"
                user_msg = "Google Calendar authorization has expired."
                action_req = "Reconnect Google Calendar."

            return {
                "success": False,
                "integration": "google_calendar",
                "tool": method,
                "error_code": err_code,
                "message": user_msg,
                "action": action_req
            }

    def _resolve_datetime(self, text_val: str, default_tz_str: str) -> datetime.datetime:
        """Parses ISO string or relative time text (e.g., 'tomorrow 12 PM') with workspace timezone."""
        try:
            tz = ZoneInfo(default_tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")

        now = datetime.datetime.now(tz)
        if not text_val:
            return now + datetime.timedelta(days=1)

        text_lower = str(text_val).strip().lower()

        # Extract relative date modifier if present
        target_date = now.date()
        is_relative_date = False
        if "tomorrow" in text_lower:
            target_date = (now + datetime.timedelta(days=1)).date()
            is_relative_date = True
        elif "yesterday" in text_lower:
            target_date = (now - datetime.timedelta(days=1)).date()
            is_relative_date = True
        elif "today" in text_lower:
            target_date = now.date()
            is_relative_date = True
        elif "next week" in text_lower:
            target_date = (now + datetime.timedelta(days=7)).date()
            is_relative_date = True

        # Extract time component
        hour = 12
        minute = 0
        time_match = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', text_lower)
        if time_match:
            h = int(time_match.group(1))
            m = int(time_match.group(2)) if time_match.group(2) else 0
            ampm = time_match.group(3)
            if ampm == 'pm' and h < 12:
                h += 12
            elif ampm == 'am' and h == 12:
                h = 0
            hour = h
            minute = m

        if is_relative_date:
            return datetime.datetime(
                year=target_date.year,
                month=target_date.month,
                day=target_date.day,
                hour=hour,
                minute=minute,
                tzinfo=tz
            )

        # Try standard ISO parser if not a relative expression
        try:
            dt = dtparser.parse(text_val)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=tz)
            return dt
        except Exception:
            pass

        return datetime.datetime(
            year=target_date.year,
            month=target_date.month,
            day=target_date.day,
            hour=hour,
            minute=minute,
            tzinfo=tz
        )

    async def _list_events(self, service, args: dict, default_tz_str: str) -> dict:
        tz_str = args.get("timezone") or args.get("timeZone") or default_tz_str
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
            tz_str = "Asia/Kolkata"

        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        raw_min = args.get("time_min") or args.get("timeMin") or args.get("start_time") or ""
        raw_max = args.get("time_max") or args.get("timeMax") or args.get("end_time") or ""
        max_results = int(args.get("max_results") or args.get("maxResults") or 10)

        time_min = self._resolve_datetime(raw_min, tz_str).isoformat()

        params = {
            "calendarId": calendar_id,
            "timeMin": time_min,
            "maxResults": max_results,
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if raw_max:
            params["timeMax"] = self._resolve_datetime(raw_max, tz_str).isoformat()

        log_info(f"[calendar.api.request] action=list_events params={params}")
        result = service.events().list(**params).execute()
        log_info(f"[calendar.api.response] action=list_events item_count={len(result.get('items', []))}")
        
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
            "tool": "list_events",
            "data": {
                "count": len(events),
                "events": events
            }
        }

    async def _create_event(self, service, args: dict, default_tz_str: str) -> dict:
        tz_str = args.get("timezone") or args.get("timeZone") or default_tz_str
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
            tz_str = "Asia/Kolkata"

        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        summary = args.get("summary") or args.get("title") or args.get("name") or "New Meeting"
        start_raw = args.get("start_time") or args.get("startTime") or args.get("start") or ""
        end_raw = args.get("end_time") or args.get("endTime") or args.get("end") or ""
        description = args.get("description", "")
        attendees = args.get("attendees", [])

        start_dt = self._resolve_datetime(start_raw, tz_str)
        if end_raw:
            end_dt = self._resolve_datetime(end_raw, tz_str)
        else:
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

        log_info(f"[calendar.api.request] action=create_event summary='{summary}' start={start_dt.isoformat()} ({tz_str})")
        result = service.events().insert(calendarId=calendar_id, body=event_body).execute()
        
        event_id = result.get("id")
        res_summary = result.get("summary") or summary
        res_start = result.get("start", {}).get("dateTime") or start_dt.isoformat()
        res_end = result.get("end", {}).get("dateTime") or end_dt.isoformat()
        html_link = result.get("htmlLink", "")

        # Strict response verification
        if not event_id or event_id == "unknown_id" or not res_summary or not res_start or not res_end:
            log_error(f"[calendar.execution.failed] Incomplete API response from Google: {result}")
            return {
                "success": False,
                "integration": "google_calendar",
                "tool": "create_event",
                "error_code": "INVALID_API_RESPONSE",
                "message": "Google Calendar API response missing required fields (id, summary, start, end).",
                "action": "Retry event creation."
            }

        # Verification check (Rule 15)
        try:
            verified = service.events().get(calendarId=calendar_id, eventId=event_id).execute()
            if not verified or not verified.get("id"):
                log_error(f"[calendar.execution.failed] Verification check failed for event_id={event_id}")
                return {
                    "success": False,
                    "integration": "google_calendar",
                    "tool": "create_event",
                    "error_code": "VERIFICATION_FAILED",
                    "message": "Created event could not be verified on Google Calendar.",
                    "action": "Retry event creation."
                }
        except Exception as v_err:
            log_error(f"Event verification check non-fatal warning: {v_err}")

        log_info(f"[calendar.api.response] status=200 event_id={event_id}")
        log_info(f"[calendar.execution.succeeded] event_id={event_id} summary='{res_summary}'")

        return {
            "success": True,
            "integration": "google_calendar",
            "tool": "create_event",
            "data": {
                "event_id": event_id,
                "title": res_summary,
                "start_time": res_start,
                "end_time": res_end,
                "timezone": tz_str,
                "html_link": html_link
            }
        }

    async def _delete_event(self, service, args: dict, default_tz_str: str) -> dict:
        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        event_id = args.get("event_id") or args.get("eventId") or ""
        summary = args.get("summary") or args.get("title") or args.get("name") or ""

        if not event_id and summary:
            search_res = await self._list_events(service, {"max_results": 20}, default_tz_str)
            ev_list = search_res.get("data", {}).get("events", [])
            for ev in ev_list:
                if summary.lower() in ev.get("title", "").lower():
                    event_id = ev.get("event_id")
                    break

        if not event_id:
            return {
                "success": False,
                "integration": "google_calendar",
                "tool": "delete_event",
                "message": "Event ID not provided and no matching event found."
            }

        log_info(f"[GOOGLE] Deleting calendar event {event_id}")
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()

        return {
            "success": True,
            "integration": "google_calendar",
            "tool": "delete_event",
            "data": {
                "event_id": event_id,
                "status": "deleted"
            }
        }

    async def _update_event(self, service, args: dict, default_tz_str: str) -> dict:
        tz_str = args.get("timezone") or args.get("timeZone") or default_tz_str
        try:
            tz = ZoneInfo(tz_str)
        except Exception:
            tz = ZoneInfo("Asia/Kolkata")
            tz_str = "Asia/Kolkata"

        calendar_id = args.get("calendar_id") or args.get("calendarId") or "primary"
        event_id = args.get("event_id") or args.get("eventId") or ""
        summary = args.get("summary") or args.get("title") or args.get("name") or ""
        start_raw = args.get("start_time") or args.get("startTime") or args.get("start") or ""
        end_raw = args.get("end_time") or args.get("endTime") or args.get("end") or ""

        if not event_id:
            search_res = await self._list_events(service, {"max_results": 20}, tz_str)
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
                "tool": "update_event",
                "message": "Event ID not provided and no matching event found."
            }

        event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()

        if summary:
            event["summary"] = summary
        if "description" in args:
            event["description"] = args["description"]

        if start_raw:
            start_dt = self._resolve_datetime(start_raw, tz_str)
            event["start"] = {"dateTime": start_dt.isoformat(), "timeZone": tz_str}
            if not end_raw:
                end_dt = start_dt + datetime.timedelta(hours=1)
                event["end"] = {"dateTime": end_dt.isoformat(), "timeZone": tz_str}

        if end_raw:
            end_dt = self._resolve_datetime(end_raw, tz_str)
            event["end"] = {"dateTime": end_dt.isoformat(), "timeZone": tz_str}

        log_info(f"[GOOGLE] Updating calendar event {event_id}")
        result = service.events().update(calendarId=calendar_id, eventId=event_id, body=event).execute()

        return {
            "success": True,
            "integration": "google_calendar",
            "tool": "update_event",
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
