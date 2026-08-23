"""
Channel Registry
================
Single source of truth for the channel types the platform supports.

A channel is "supported" when the platform can actually deploy it (connect,
test, publish, and route messages through the real AgentRuntime). Channels that
are not yet supported are still listed so the UI can show an honest
"Coming soon" state instead of a fake toggle.

Channel status lifecycle:
  not_configured -> connecting -> connected -> disconnected
                         |-> error
published is an orthogonal flag: a channel can be `connected` but not yet
`published`, or `connected` + `published` (live).
"""

from typing import Dict, List, Optional

# statuses
STATUS_NOT_CONFIGURED = "not_configured"
STATUS_CONNECTING = "connecting"
STATUS_CONNECTED = "connected"
STATUS_ERROR = "error"
STATUS_DISCONNECTED = "disconnected"

ALL_STATUSES = (
    STATUS_NOT_CONFIGURED,
    STATUS_CONNECTING,
    STATUS_CONNECTED,
    STATUS_ERROR,
    STATUS_DISCONNECTED,
)

# The internal channel type keys used across the system.
WEB = "web"
TELEGRAM = "telegram"
WHATSAPP = "whatsapp"
EMAIL = "email"
SLACK = "slack"
PHONE = "phone"
SMS = "sms"


def _def(key: str, label: str, description: str, icon: str, supported: bool,
         setup_fields: Optional[List[Dict]] = None) -> Dict:
    return {
        "type": key,
        "label": label,
        "description": description,
        "icon": icon,
        "supported": supported,
        "setup_fields": setup_fields or [],
    }


CHANNEL_DEFS: List[Dict] = [
    _def(
        WEB,
        "Web Chat",
        "Embeddable chat widget for your website. Publish to generate a widget_id and embed code.",
        "globe",
        True,
        setup_fields=[
            {"key": "allowed_domains", "type": "text", "placeholder": "example.com (or * for all)"},
            {"key": "primary_color", "type": "text", "placeholder": "#2F6BFF"},
            {"key": "widget_title", "type": "text", "placeholder": "Chat with us"},
            {"key": "welcome_message", "type": "textarea", "placeholder": "Hi! How can I help you today?"},
        ],
    ),
    _def(
        TELEGRAM,
        "Telegram",
        "Deploy your agent as a Telegram bot. Connect a bot token from BotFather, then publish to register the webhook.",
        "telegram",
        True,
        setup_fields=[
            {"key": "bot_token", "type": "password", "placeholder": "123456:ABC-DEF..."},
        ],
    ),
    _def(
        WHATSAPP,
        "WhatsApp",
        "Deploy your agent on WhatsApp Business. Requires a WhatsApp Business API provider connection.",
        "whatsapp",
        False,
    ),
    _def(
        EMAIL,
        "Email",
        "Handle inbound email threads. Requires a connected email inbox integration.",
        "email",
        False,
    ),
    _def(
        SLACK,
        "Slack",
        "Reply inside Slack channels. Requires a connected Slack workspace.",
        "slack",
        False,
    ),
    _def(
        PHONE,
        "Phone",
        "Voice and phone workflows. Requires a connected voice provider.",
        "phone",
        False,
    ),
    _def(
        SMS,
        "SMS",
        "Text message handling. Requires a connected SMS provider.",
        "sms",
        False,
    ),
]

CHANNEL_DEFS_BY_TYPE: Dict[str, Dict] = {d["type"]: d for d in CHANNEL_DEFS}

SUPPORTED_TYPES = [d["type"] for d in CHANNEL_DEFS if d["supported"]]

CHANNELS_COLLECTION = "agent_channels"


def channel_doc_id(agent_id: str, channel_type: str) -> str:
    """Deterministic Firestore document id for an agent+channel pair."""
    return f"{agent_id}__{channel_type}"


def default_channel_state(workspace_id: str, agent_id: str, channel_type: str) -> Dict:
    """Returns the pristine not_configured state for a channel."""
    now = _now()
    return {
        "id": channel_doc_id(agent_id, channel_type),
        "workspace_id": workspace_id,
        "agent_id": agent_id,
        "channel_type": channel_type,
        "status": STATUS_NOT_CONFIGURED,
        "published": False,
        "error_message": None,
        "last_tested_at": None,
        "last_test_result": None,
        "config": {},
        "credentials_reference": None,
        "widget_id": None,
        "telegram_bot_username": None,
        "created_at": now,
        "updated_at": now,
    }


def _now() -> float:
    import time
    return time.time()