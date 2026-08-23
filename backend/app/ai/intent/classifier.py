"""
Fast deterministic intent classifier.

Classifies user queries into intent categories without using an LLM.
Returns structured classification for request-aware context building and tool routing.
"""
from typing import Dict, List, Optional, Literal
import re
from dataclasses import dataclass


IntentType = Literal["ACTION", "KNOWLEDGE", "CHAT", "UNKNOWN"]
ActionDomain = Literal["calendar", "email", "message", "file", "payment", "commerce", "api", None]


@dataclass
class IntentClassification:
    intent: str
    type: IntentType
    confidence: float
    domain: Optional[ActionDomain] = None
    suggested_tools: List[str] = None
    
    def __post_init__(self):
        if self.suggested_tools is None:
            self.suggested_tools = []


# High-precision keyword patterns for intent classification
ACTION_PATTERNS = {
    "calendar_create": [
        r"\bschedule\b", r"\bbook\b", r"\bcreate\b", r"\badd\b", r"\bset up\b",
        r"\bmake\b", r"\barrange\b", r"\bplan\b", r"\binvite\b", r"\breserve\b",
        r"\bmeeting\b", r"\bappointment\b", r"\bevent\b", r"\bcalendar\b",
        r"\bremind me\b", r"\breminder\b", r"\bblock\b"
    ],
    "calendar_read": [
        r"\bwhat.*calendar\b", r"\bmy schedule\b", r"\bmy calendar\b",
        r"\bupcoming\b", r"\bavailability\b", r"\bwhen.*free\b", r"\bcheck.*calendar\b"
    ],
    "email_send": [
        r"\bsend.*email\b", r"\bemail.*to\b", r"\bmail.*to\b",
        r"\bwrite.*email\b", r"\bcompose.*email\b"
    ],
    "email_read": [
        r"\bcheck.*email\b", r"\bread.*email\b", r"\bsearch.*email\b",
        r"\bmy inbox\b", r"\bfind.*email\b"
    ],
    "message_send": [
        r"\bsend.*message\b", r"\bmessage.*to\b", r"\bslack.*to\b",
        r"\bwhatsapp.*to\b", r"\bnotify\b", r"\btext\b"
    ],
    "file_operation": [
        r"\bupload\b", r"\bdownload\b", r"\bfile\b", r"\bdrive\b",
        r"\bdocument\b", r"\battach\b", r"\bsearch.*file\b"
    ],
    "payment": [
        r"\bpay\b", r"\brefund\b", r"\bcharge\b", r"\btransaction\b",
        r"\bbilling\b", r"\binvoice\b"
    ],
    "commerce": [
        r"\border\b", r"\bproduct\b", r"\bstock\b", r"\binventory\b",
        r"\bcatalog\b", r"\bshopify\b", r"\bprice\b", r"\bbuy\b"
    ],
}

KNOWLEDGE_PATTERNS = [
    r"\bwhat is\b", r"\bwhat are\b", r"\bwhat's the\b", r"\bwhat's our\b",
    r"\bexplain\b", r"\bhow does\b", r"\bhow do i\b", r"\bhow to\b",
    r"\bpolicy\b", r"\bprocedure\b", r"\bguideline\b", r"\brule\b",
    r"\bdefinition\b", r"\bmeaning\b", r"\bdescribe\b", r"\btell me about\b",
    r"\binformation about\b", r"\bdetails about\b", r"\boverview\b",
    r"\bhelp me understand\b", r"\bcan you explain\b"
]

CHAT_PATTERNS = [
    r"^hi\b", r"^hello\b", r"^hey\b", r"^greetings\b", r"^good morning\b",
    r"^good afternoon\b", r"^good evening\b", r"^how are you\b",
    r"^thanks\b", r"^thank you\b", r"^bye\b", r"^goodbye\b",
    r"^see you\b", r"^have a good\b"
]

DOMAIN_KEYWORDS = {
    "calendar": ["calendar", "meeting", "appointment", "event", "schedule", "gcal", "remind", "booking", "invite", "availability", "free", "busy"],
    "email": ["email", "gmail", "mail", "inbox", "send", "compose", "draft"],
    "message": ["slack", "whatsapp", "message", "text", "notify", "channel", "dm"],
    "file": ["file", "drive", "document", "gdrive", "upload", "download", "attach", "folder"],
    "payment": ["pay", "payment", "refund", "charge", "transaction", "billing", "razorpay", "invoice"],
    "commerce": ["order", "product", "shopify", "stock", "inventory", "catalog", "price", "buy", "customer"],
    "api": ["api", "webhook", "request", "custom api", "endpoint", "rest"],
}

INTEGRATION_BY_DOMAIN = {
    "calendar": ["int_gcal", "int_gmeet"],
    "email": ["int_gmail"],
    "message": ["int_whatsapp", "int_slack"],
    "file": ["int_gdrive"],
    "payment": ["int_razorpay"],
    "commerce": ["int_shopify"],
    "api": ["int_rest_api"],
}


def classify_intent(query: str) -> IntentClassification:
    """
    Fast deterministic classification of user query.
    
    Returns IntentClassification with intent, type, confidence, domain, and suggested tools.
    """
    if not query or not query.strip():
        return IntentClassification(
            intent="empty",
            type="UNKNOWN",
            confidence=0.0,
        )
    
    q = query.lower().strip()
    
    # Check for chat/greeting patterns first (high confidence, short)
    for pattern in CHAT_PATTERNS:
        if re.search(pattern, q):
            return IntentClassification(
                intent="greeting",
                type="CHAT",
                confidence=0.95,
            )
    
    # Check for knowledge patterns
    is_knowledge = any(re.search(p, q) for p in KNOWLEDGE_PATTERNS)
    
    # Check for action patterns and determine domain
    action_matches = {}
    for action, patterns in ACTION_PATTERNS.items():
        matches = sum(1 for p in patterns if re.search(p, q))
        if matches > 0:
            action_matches[action] = matches
    
    # Determine domain from action matches and keywords
    domain_scores: Dict[str, int] = {}
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in q)
        if score > 0:
            domain_scores[domain] = score
    
    # Boost domain scores from action matches
    for action, count in action_matches.items():
        if "calendar" in action:
            domain_scores["calendar"] = domain_scores.get("calendar", 0) + count * 2
        elif "email" in action:
            domain_scores["email"] = domain_scores.get("email", 0) + count * 2
        elif "message" in action:
            domain_scores["message"] = domain_scores.get("message", 0) + count * 2
        elif "file" in action:
            domain_scores["file"] = domain_scores.get("file", 0) + count * 2
        elif "payment" in action:
            domain_scores["payment"] = domain_scores.get("payment", 0) + count * 2
        elif "commerce" in action:
            domain_scores["commerce"] = domain_scores.get("commerce", 0) + count * 2
    
    # Classify
    if action_matches:
        # It's an ACTION request
        primary_action = max(action_matches.items(), key=lambda x: x[1])[0]
        domain = max(domain_scores.items(), key=lambda x: x[1])[0] if domain_scores else None
        
        confidence = min(0.95, 0.7 + len(action_matches) * 0.1)
        
        suggested_tools = INTEGRATION_BY_DOMAIN.get(domain, []) if domain else []
        
        return IntentClassification(
            intent=primary_action,
            type="ACTION",
            confidence=confidence,
            domain=domain,
            suggested_tools=suggested_tools,
        )
    
    if is_knowledge:
        # It's a KNOWLEDGE request
        domain = max(domain_scores.items(), key=lambda x: x[1])[0] if domain_scores else None
        
        return IntentClassification(
            intent="knowledge_query",
            type="KNOWLEDGE",
            confidence=0.85,
            domain=domain,
            suggested_tools=INTEGRATION_BY_DOMAIN.get(domain, []) if domain else [],
        )
    
    # Unknown / fallback
    return IntentClassification(
        intent="general",
        type="UNKNOWN",
        confidence=0.3,
        domain=None,
        suggested_tools=[],
    )


def infer_action_domain(query: str) -> Optional[ActionDomain]:
    """Backward-compatible function for gate.py"""
    result = classify_intent(query)
    return result.domain


def is_action_request(query: str) -> bool:
    """Backward-compatible function for gate.py"""
    result = classify_intent(query)
    return result.type == "ACTION"


def get_suggested_tools(query: str) -> List[str]:
    """Get suggested integration IDs for a query."""
    result = classify_intent(query)
    return result.suggested_tools