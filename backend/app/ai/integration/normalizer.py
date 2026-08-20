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
        Normalizes raw API responses from successful provider calls into a
        standardized, compact dictionary structure.

        IMPORTANT: this normalizer never fabricates success. An empty, plain
        string, or structurally-invalid response is returned as a FAILURE so the
        runtime cannot pass unverified claims to the user.
        """
        if not raw_response:
            return cls.normalize_error(
                tool_name=tool_name,
                method=method,
                error_code="INVALID_RESPONSE",
                message="Integration returned an empty response. Action could not be verified.",
            )

        # If already a dictionary, process fields
        data = raw_response
        if isinstance(raw_response, str):
            try:
                import json
                data = json.loads(raw_response)
            except Exception:
                # A plain string is NOT evidence of a completed action.
                return cls.normalize_error(
                    tool_name=tool_name,
                    method=method,
                    error_code="INVALID_RESPONSE",
                    message=f"Integration returned an unverifiable plain text response: {raw_response[:120]}",
                )

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
                        message="Google Calendar API call did not return a valid event ID.",
                    )

                # Extract event creation fields
                return {
                    "success": True,
                    "external_resource_id": event_id,
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
                message_id = data.get("id") or data.get("message_id") or data.get("thread_id")
                if not message_id:
                    return cls.normalize_error(
                        tool_name=tool_name,
                        method=method,
                        error_code="INVALID_MESSAGE_ID",
                        message="Gmail API call did not return a valid message ID.",
                    )
                return {
                    "success": True,
                    "external_resource_id": message_id,
                    "message_id": message_id,
                    "recipient": data.get("to") or data.get("recipient", ""),
                    "subject": data.get("subject", ""),
                    "status": "sent"
                }

        # Shopify normalization
        if "shopify" in tool_lower or "store" in tool_lower:
            if "order" in method_lower:
                return {
                    "success": True,
                    "external_resource_id": data.get("id") or data.get("order_id", ""),
                    "order_id": data.get("id") or data.get("order_id", ""),
                    "status": data.get("fulfillment_status") or "unfulfilled",
                    "total": data.get("total_price", "0.0")
                }

        # Fallback generic payload: success only when the payload itself
        # explicitly carries a verified success signal.
        if isinstance(data, dict):
            explicit_success = data.get("success") is True
            if explicit_success:
                compact = {k: v for k, v in data.items() if len(str(v)) < 200}
                compact["success"] = True
                return compact
            if "error" in data or "message" in data and "error" in str(data):
                return cls.normalize_error(
                    tool_name=tool_name,
                    method=method,
                    error_code="PROVIDER_ERROR",
                    message=str(data.get("message") or data.get("error") or "Integration reported an error."),
                )
            return cls.normalize_error(
                tool_name=tool_name,
                method=method,
                error_code="UNVERIFIED_RESPONSE",
                message="Integration response did not include a verified success signal.",
            )

        return cls.normalize_error(
            tool_name=tool_name,
            method=method,
            error_code="UNVERIFIED_RESPONSE",
            message="Integration response could not be verified as successful.",
        )

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