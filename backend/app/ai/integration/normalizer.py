from typing import Any, Dict, Optional

class ToolResultNormalizer:
    @classmethod
    def normalize_response(
        cls,
        tool_name: str,
        method: str,
        raw_response: Any
    ) -> Dict[str, Any]:
        """
        Normalizes raw API responses from successful provider calls 
        into a standardized, compact dictionary structure.
        """
        if not raw_response:
            return {"success": True, "message": "Execution finished with empty response."}

        # If already a dictionary, process fields
        data = raw_response
        if isinstance(raw_response, str):
            try:
                import json
                data = json.loads(raw_response)
            except Exception:
                # Treat as plain message
                return {"success": True, "message": raw_response}

        tool_lower = tool_name.lower()
        method_lower = method.lower()

        # Google Calendar normalization
        if "calendar" in tool_lower or "gcal" in tool_lower:
            if "create" in method_lower or "schedule" in method_lower:
                event_id = data.get("id") or data.get("event_id")
                if not event_id or event_id == "unknown_id":
                    return cls.normalize_error(
                        tool_name=tool_name,
                        method=method,
                        error_code="INVALID_EVENT_ID",
                        message="Google Calendar API call did not return a valid event ID."
                    )

                # Extract event creation fields
                return {
                    "success": True,
                    "event_id": event_id,
                    "title": data.get("summary") or data.get("title") or "New Event",
                    "start": data.get("start", {}).get("dateTime", data.get("start", {}).get("date", "")),
                    "end": data.get("end", {}).get("dateTime", data.get("end", {}).get("date", "")),
                    "link": data.get("htmlLink", data.get("link", "")),
                    "calendar": data.get("calendar_id", "primary")
                }
            elif "list" in method_lower or "availability" in method_lower:
                events = []
                items = data.get("items", data) if isinstance(data, dict) else data
                if isinstance(items, list):
                    for item in items[:5]:
                        events.append({
                            "id": item.get("id"),
                            "title": item.get("summary") or item.get("title", "No Title"),
                            "start": item.get("start", {}).get("dateTime", item.get("start", {}).get("date", ""))
                        })
                return {"success": True, "events": events}

        # Gmail normalization
        if "gmail" in tool_lower or "email" in tool_lower:
            if "send" in method_lower:
                return {
                    "success": True,
                    "recipient": data.get("to") or data.get("recipient", ""),
                    "subject": data.get("subject", ""),
                    "status": "sent"
                }

        # Shopify normalization
        if "shopify" in tool_lower or "store" in tool_lower:
            if "order" in method_lower:
                return {
                    "success": True,
                    "order_id": data.get("id") or data.get("order_id", ""),
                    "status": data.get("fulfillment_status") or "unfulfilled",
                    "total": data.get("total_price", "0.0")
                }

        # Fallback generic payload
        if isinstance(data, dict):
            compact = {k: v for k, v in data.items() if len(str(v)) < 200}
            compact["success"] = True
            return compact

        return {"success": True, "data": data}

    @classmethod
    def normalize_error(
        cls,
        tool_name: str,
        method: str,
        error_code: str,
        message: str,
        action: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Formats provider errors into a structured error schema that flows to LLM.
        """
        return {
            "success": False,
            "provider": tool_name,
            "tool": method,
            "error_code": error_code,  # REAUTH_REQUIRED | API_DISABLED | NOT_CONNECTED | PROVIDER_ERROR
            "retryable": False,
            "action_required": True,
            "message": message,
            "action": action or "Reconnect the integration in the settings panel."
        }
