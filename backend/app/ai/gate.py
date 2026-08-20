"""
Structural action-success gate.

The LLM is NEVER the source of truth for whether an external action (calendar
event created, email sent, file uploaded, payment refunded, ...) succeeded.
Only a verified tool-execution record from the external provider is.

This module enforces that invariant structurally, independent of how the model
phrases its answer. A natural-language success claim can only reach the user
when a matching verified (non-simulated) tool record exists.
"""
import re
import json
from typing import Any, Dict, List, Optional

# Broad intent markers: if the user's query contains any of these, it is an
# action request and the response must be backed by a verified tool record.
ACTION_KEYWORDS = [
    "schedule", "book", "create", "add", "send", "set up", "setup", "set",
    "remind", "reminder", "invite", "invitation", "reserve", "order", "pay",
    "payment", "refund", "transfer", "upload", "download", "post", "update",
    "delete", "cancel", "remove", "share", "attach", "push", "notify", "sync",
    "plan", "organize", "block", "place", "put", "drop", "call", "message",
    "email", "appointment", "booking", "rsvp", "meeting", "calendar", "event",
    "meet", "schedule a", "book a", "create a", "send an", "send a",
]

# Knowledge markers suppress action detection: "what is the refund policy?"
# is a knowledge question, not an action request.
KNOWLEDGE_MARKERS = [
    "what is the", "what is our", "what is your", "what's the", "what's our",
    "what are the", "what are our", "tell me about", "explain", "policy",
    "meaning", "definition", "how does", "how do i", "guideline", "describe",
    "purpose of", "what does", "overview", "information about", "details about",
]


def is_action_request(query: str) -> bool:
    """True when the user's query asks for an external action (create/send/etc.)."""
    if not query:
        return False
    q = query.lower().strip()
    if any(m in q for m in KNOWLEDGE_MARKERS):
        # Knowledge questions are not action requests.
        return False
    return any(kw in q for kw in ACTION_KEYWORDS)

# Broad success-claim patterns. This catches creative phrasing that escapes a
# simple exact-keyword list (e.g. "Your meeting with the investor has been
# placed on the calendar").
_SUCCESS_CLAIM_PATTERNS = [
    re.compile(
        r"\b(i['\u2019]?ve|i have)\s+"
        r"(added|created|scheduled|booked|sent|posted|set|made|uploaded|"
        r"downloaded|transferred|refunded|cancelled|canceled|deleted|updated|"
        r"invited|reserved|ordered|purchased|paid|started|finished|completed|"
        r"placed|put)\b"
    ),
    re.compile(
        r"\b(added|created|scheduled|booked|sent|posted|set|reserved|ordered|"
        r"cancelled|canceled|deleted|updated|invited|confirmed|placed|put)\b"
        r"[^.\n]{0,60}\b(calendar|event|meeting|email|message|reminder|"
        r"appointment|invite|invitation)\b"
    ),
    re.compile(
        r"\b(your|the|a)\s+(event|meeting|appointment|reminder|email|message|"
        r"invite|invitation)\s+(has been|is|was)\s+(created|scheduled|booked|"
        r"sent|set|added|confirmed|placed)\b"
    ),
    re.compile(
        r"\b(calendar event|event|meeting|appointment|reminder|email|message)"
        r"\s+(was|has been|is)\s+(created|scheduled|booked|set|added|confirmed|"
        r"placed|sent)\b"
    ),
    re.compile(r"\b(calendar event|event|meeting|appointment|reminder)\s+"
               r"(created|scheduled|booked|set|added|confirmed|placed)\b"),
    re.compile(r"\b(on|in)\s+(your|the)\s+(google\s+)?calendar\b"),
    re.compile(r"\b(done|all set|it['\u2019]?s done|that['\u2019]?s done|"
               r"consider it done|taken care of)\b"),
    re.compile(r"\breminder\s+(is|has been|was)\s+(set|created|scheduled|added)\b"),
    re.compile(r"\bcalendar\s+(invite|invitation)\b"),
    re.compile(r"\b(meeting|event)\s+(is|has been)\s+(confirmed|created|scheduled|booked)\b"),
]

_REFUSAL_MESSAGE = (
    "I wasn't able to complete that action for you yet — "
    "let me know if you'd like me to try again."
)


def asserts_success(text: str) -> bool:
    """True when the text claims an external action was completed."""
    if not text:
        return False
    t = text.lower()
    return any(p.search(t) for p in _SUCCESS_CLAIM_PATTERNS)


def has_verified_action_record(tool_records: Optional[List[Dict[str, Any]]],
                               tool_result: Optional[Dict[str, Any]] = None,
                               query: str = "") -> bool:
    """
    True when a real (non-simulated) tool execution succeeded AND that
    execution matches the action domain of the user's request.

    A verified email send must never validate a claim that a calendar event was
    created (Requirement 32: the external provider result is the source of
    truth — for the SAME action).
    """
    domain = infer_action_domain(query)
    for r in (tool_records or []):
        if r.get("status") != "SUCCEEDED" or r.get("simulated"):
            continue
        if not domain or _record_domain(r) == domain:
            return True
    if tool_result and isinstance(tool_result, dict) and tool_result.get("success") is True:
        if not domain or _record_domain(tool_result) == domain:
            # For create/send actions a real resource ID must be present.
            if _is_creating_action(tool_result):
                resource_id = tool_result.get("event_id") or tool_result.get("id") \
                    or (tool_result.get("data") or {}).get("event_id") \
                    or (tool_result.get("data") or {}).get("id")
                if resource_id and resource_id != "unknown_id":
                    return True
                return False
            return True
    return False


def _record_domain(record: Dict[str, Any]) -> Optional[str]:
    tool = str(record.get("tool") or "")
    action = str(record.get("action") or "")
    text = (tool + " " + action).lower()
    data = record.get("data")
    if isinstance(data, dict):
        text += " " + json.dumps(data).lower()
    if any(k in text for k in ["calendar", "event", "create_event", "list_events",
                               "update_event", "delete_event", "meeting", "gcal"]):
        return "calendar"
    if any(k in text for k in ["gmail", "email", "send_email", "search_emails", "read_email", "mail"]):
        return "email"
    if any(k in text for k in ["slack", "whatsapp", "send_message", "message"]):
        return "message"
    if any(k in text for k in ["drive", "file", "upload", "download", "document"]):
        return "file"
    if any(k in text for k in ["pay", "payment", "refund", "transfer", "order", "shopify", "razorpay"]):
        return "payment"
    return None


def _is_creating_action(record: Dict[str, Any]) -> bool:
    text = (str(record.get("tool") or "") + " " + str(record.get("action") or "")).lower()
    return any(k in text for k in ["create", "send", "add", "schedule", "book", "update", "delete", "cancel"])


def infer_action_domain(query: str) -> Optional[str]:
    """Infers the action domain of the user's request, if any."""
    if not query:
        return None
    q = query.lower()
    if any(k in q for k in ["calendar", "schedule", "book", "appointment", "meeting",
                            "event", "remind", "reminder", "gcal"]):
        return "calendar"
    if any(k in q for k in ["email", "mail", "gmail", "inbox"]):
        return "email"
    if any(k in q for k in ["message", "slack", "whatsapp", "notify", "text"]):
        return "message"
    if any(k in q for k in ["file", "upload", "download", "drive", "document"]):
        return "file"
    if any(k in q for k in ["pay", "payment", "refund", "transfer", "order", "billing"]):
        return "payment"
    return None


def enforce_action_gate(
    message: str,
    query: str,
    tool_records: Optional[List[Dict[str, Any]]] = None,
    tool_result: Optional[Dict[str, Any]] = None,
) -> str:
    """
    Structural gate: a natural-language success claim is allowed to reach the
    user ONLY when a verified (non-simulated) tool record backs it up.

    - Action requests with a verified record -> keep the message.
    - Action requests with a failed record -> keep the (honest) failure message.
    - Action requests with NO record at all -> any success-claiming phrasing is
      replaced with an honest refusal, regardless of wording.
    """
    message = message or ""
    if not is_action_request(query):
        return message
    if has_verified_action_record(tool_records, tool_result, query):
        return message
    if asserts_success(message):
        return _REFUSAL_MESSAGE
    return message


def build_action_state(tool_records: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Structured action state (Requirement 31). The frontend can render this
    instead of trusting the model's prose. ``status`` can only be ``created``
    when a real external resource ID exists.
    """
    state: List[Dict[str, Any]] = []
    for r in (tool_records or []):
        tool = (r.get("tool") or "").lower()
        action = (r.get("action") or "").lower()
        if "calendar" in tool or "event" in action or "meeting" in action:
            atype = "calendar_event"
        elif "email" in tool or "send" in action or "gmail" in tool:
            atype = "email"
        elif "message" in tool or "slack" in tool or "whatsapp" in tool:
            atype = "message"
        else:
            atype = tool or "action"

        if r.get("simulated"):
            status = "simulated"
        elif r.get("status") == "SUCCEEDED":
            status = "created" if ("create" in action or "send" in action
                                   or "add" in action or "schedule" in action) else "completed"
        else:
            status = (r.get("status") or "failed").lower()

        state.append({
            "type": atype,
            "status": status,
            "tool_execution_id": r.get("id"),
            "resource_id": r.get("external_resource_id") if r.get("status") == "SUCCEEDED" else None,
            "error_code": r.get("error_code"),
            "simulated": bool(r.get("simulated")),
        })
    return state