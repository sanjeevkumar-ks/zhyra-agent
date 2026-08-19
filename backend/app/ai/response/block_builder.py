from typing import Dict, Any
from app.ai.response.models import ResponseBlock

class ResponseBlockBuilder:
    @staticmethod
    def text(text: str) -> ResponseBlock:
        return ResponseBlock(type="text", data={"text": text})

    @staticmethod
    def calendar_event(title: str, date: str, time: str, status: str = "created", event_id: str = None, url: str = None, timezone: str = None) -> ResponseBlock:
        return ResponseBlock(
            type="calendar_event",
            data={
                "title": title,
                "date": date,
                "time": time,
                "status": status,
                "event_id": event_id,
                "url": url,
                "timezone": timezone
            }
        )

    @staticmethod
    def email(to: str, subject: str, status: str = "sent") -> ResponseBlock:
        return ResponseBlock(
            type="email",
            data={
                "to": to,
                "subject": subject,
                "status": status
            }
        )

    @staticmethod
    def integration_error(provider: str, status: str, action: str, message: str = "") -> ResponseBlock:
        return ResponseBlock(
            type="integration_error",
            data={
                "provider": provider,
                "status": status,
                "action": action,
                "message": message
            }
        )

    @staticmethod
    def action_required(action_type: str, url: str = None) -> ResponseBlock:
        return ResponseBlock(
            type="action_required",
            data={
                "action_type": action_type,
                "url": url
            }
        )

    @staticmethod
    def confirmation(message: str) -> ResponseBlock:
        return ResponseBlock(
            type="confirmation",
            data={"message": message}
        )
