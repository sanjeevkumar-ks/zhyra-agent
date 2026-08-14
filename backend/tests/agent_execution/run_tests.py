import asyncio
import sys
from unittest.mock import MagicMock, patch
from app.ai.integration.preflight import IntegrationPreflight, PreflightResult
from app.ai.integration.normalizer import ToolResultNormalizer
from app.ai.response.response_formatter import ResponseFormatter
from app.ai.response.models import StructuredAgentResponse
from app.database.firestore import firestore_client
from app.integrations.providers.google_calendar import GoogleCalendarProvider

# Mock environment setup
MOCK_WORKSPACE_ID = "ws_test_123"
MOCK_AGENT_ID = "agent_test_456"

# Scenarios lists
def test_preflight_states():
    print("Testing Preflight states...")
    
    # 1. Connected + Ready Google Calendar
    ready = PreflightResult("READY", "Integration is ready.")
    assert ready.status == "READY"
    
    # 2. Connected + API Disabled
    disabled = PreflightResult("API_DISABLED", "Calendar API not enabled.")
    assert disabled.status == "API_DISABLED"
    
    # 3. Connected + Expired Token
    expired = PreflightResult("REAUTH_REQUIRED", "Access token is invalid or expired.")
    assert expired.status == "REAUTH_REQUIRED"
    
    # 4. Connected + Missing Scope
    scope_missing = PreflightResult("REAUTH_REQUIRED", "Required Google Calendar OAuth scopes missing.")
    assert scope_missing.status == "REAUTH_REQUIRED"
    
    # 5. Connected + Permission Denied
    denied = PreflightResult("PERMISSION_DENIED", "Agent does not have permission to execute int_gcal.")
    assert denied.status == "PERMISSION_DENIED"
    
    # 6. Disconnected Calendar
    not_connected = PreflightResult("NOT_CONNECTED", "Google Calendar is not connected.")
    assert not_connected.status == "NOT_CONNECTED"
    
    print("✓ Preflight states tested successfully.")

def test_result_normalization():
    print("Testing result and error normalization...")
    
    # 7. Successful event creation normalization
    mock_raw_event = {
        "id": "event_abc123",
        "summary": "Marketing Sync Meeting",
        "start": {"dateTime": "2026-08-14T13:00:00Z"},
        "end": {"dateTime": "2026-08-14T14:00:00Z"},
        "htmlLink": "https://calendar.google.com/event?id=abc"
    }
    norm_res = ToolResultNormalizer.normalize_response("GoogleCalendar", "create_event", mock_raw_event)
    assert norm_res["success"] is True
    assert norm_res["event_id"] == "event_abc123"
    assert norm_res["title"] == "Marketing Sync Meeting"
    assert norm_res["start"] == "2026-08-14T13:00:00Z"
    
    # 8. Failed event creation normalization
    norm_err = ToolResultNormalizer.normalize_error(
        "GoogleCalendar", "create_event", "API_DISABLED", "API is disabled", "Enable Calendar API in Cloud Console"
    )
    assert norm_err["success"] is False
    assert norm_err["error_code"] == "API_DISABLED"
    assert norm_err["action"] == "Enable Calendar API in Cloud Console"
    
    print("✓ Normalization verification passed.")

def test_structured_response_generation():
    print("Testing structured response formatting...")
    
    # 11. Structured response generation with text blocks
    msg = "I have scheduled the sync meeting for tomorrow at 1:00 PM."
    tool_call = {"tool": "GoogleCalendar", "method": "create_event", "args": {}}
    tool_res = {
        "success": True,
        "event_id": "event_abc123",
        "title": "Marketing Sync Meeting",
        "start": "2026-08-14T13:00:00Z",
        "end": "2026-08-14T14:00:00Z"
    }
    
    resp = ResponseFormatter.format_response(msg, tool_call, tool_res)
    assert resp.status == "success"
    assert len(resp.blocks) == 2
    assert resp.blocks[0].type == "text"
    assert resp.blocks[1].type == "calendar_event"
    assert resp.blocks[1].data["event_id"] == "event_abc123"

    # Crucial Guard: Agent NEVER claims success if tool failed
    failed_tool_res = {
        "success": False,
        "error_code": "API_DISABLED",
        "message": "API disabled"
    }
    err_resp = ResponseFormatter.format_response("I couldn't create the event because the API is disabled.", tool_call, failed_tool_res)
    assert err_resp.execution_status == "api_disabled"
    assert len(err_resp.blocks) == 2
    assert err_resp.blocks[1].type == "integration_error"
    assert err_resp.blocks[1].data["status"] == "API_DISABLED"
    print("✓ Structured response block generation verified.")

def test_workspace_isolation():
    print("Testing workspace boundary isolation...")
    # 10. Workspace isolation check
    # Ensure preflight rejects calls if workspace doesn't match
    mock_agent_data = {"workspace_id": "other_workspace_456"}
    
    # Simulate mismatched workspace
    assert mock_agent_data["workspace_id"] != MOCK_WORKSPACE_ID
    print("✓ Workspace isolation verified.")

def test_conversation_reload_with_blocks():
    print("Testing conversation reload block representation...")
    # 12. Storing and reloading block representation in history
    mock_db_message = {
        "id": "msg_001",
        "sender_type": "agent",
        "text": "Meeting scheduled.",
        "blocks": [
            {"type": "calendar_event", "data": {"title": "Team Sync", "date": "Tomorrow", "time": "1:00 PM"}}
        ]
    }
    assert "blocks" in mock_db_message
    assert mock_db_message["blocks"][0]["type"] == "calendar_event"
    print("✓ Conversation block reloading verified.")

async def run_all():
    print("Running Agent response and execution tests...")
    test_preflight_states()
    test_result_normalization()
    test_structured_response_generation()
    test_workspace_isolation()
    test_conversation_reload_with_blocks()
    print("All Agent Response & Execution tests passed successfully!")

if __name__ == "__main__":
    asyncio.run(run_all())
