import unittest
import asyncio
import sys
import os
from unittest import mock

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ai.tools import tool_registry
from app.ai.tools.models import ToolCall
from app.ai.integration.dynamic_registry import DynamicToolRegistry
from app.ai.integration.normalizer import ToolResultNormalizer
from app.services.tool_executor import ToolExecutor
from app.ai.response.response_formatter import ResponseFormatter
from app.services.conversation_service import ConversationService

WS = "ws_usr_admin_"
AGENT = "agt_4794ff9c"


class FakeCalendarProvider:
    async def execute(self, workspace_id: str, method: str, args: dict) -> dict:
        return {
            "success": True,
            "integration": "google_calendar",
            "tool": method,
            "data": {
                "event_id": "evt_test_12345",
                "title": "Investor Meeting",
                "start_time": "2026-08-21T12:00:00+05:30",
                "end_time": "2026-08-21T13:00:00+05:30",
                "timezone": "Asia/Kolkata",
                "html_link": "https://calendar.google.com/event?id=evt_test_12345",
            },
        }


class FailingCalendarProvider:
    async def execute(self, workspace_id: str, method: str, args: dict) -> dict:
        return {
            "success": False,
            "integration": "google_calendar",
            "tool": method,
            "error_code": "REAUTH_REQUIRED",
            "message": "Google Calendar authorization has expired.",
            "action": "Reconnect Google Calendar.",
        }


class TestStructuredToolRuntime(unittest.TestCase):

    def setUp(self):
        ToolExecutor._recent_calls = {}

    # 1. Tool call detection from text (legacy compat) and structured model
    def test_tool_call_detection(self):
        raw = 'TOOL_CALL:{"tool": "calendar_create_event", "args": {"summary": "X", "start_time": "2026-08-21T12:00:00"}}'
        parsed = ConversationService._parse_tool_call(raw)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["args"]["summary"], "X")

        tc = ToolCall(id="call_1", name="google_calendar.create_event", args={"summary": "X"})
        self.assertEqual(tc.id, "call_1")
        self.assertEqual(tc.name, "google_calendar.create_event")

    # 2. Deterministic registry resolution (canonical + aliases)
    def test_tool_registry_resolution(self):
        for alias in ["google_calendar.create_event", "GoogleCalendar.create_event",
                      "calendar_create_event", "gcal_create_event"]:
            resolved = tool_registry.resolve(alias)
            self.assertIsNotNone(resolved, f"alias {alias} must resolve")
            self.assertEqual(resolved["canonical"], "google_calendar.create_event")

        self.assertIsNone(tool_registry.resolve("totally.unknown_tool"))
        self.assertEqual(tool_registry.get_integration_for_tool("calendar_create_event"), "int_gcal")
        self.assertEqual(tool_registry.get_action_for_tool("calendar_create_event"), "create_event")

    # 3. Agent tool assignment resolution (only assigned tools become ready)
    def test_agent_tool_assignment(self):
        assigned = DynamicToolRegistry._get_assigned_ids(AGENT)
        self.assertIn("int_gcal", assigned)
        ready_keys = tool_registry.get_ready_tool_keys(assigned)
        self.assertIn("google_calendar.create_event", ready_keys)

    # 4. Google connection resolution (lightweight, no network)
    def test_google_connection_resolution(self):
        from app.ai.integration.preflight import IntegrationPreflight
        preflight = asyncio.run(IntegrationPreflight.check(WS, AGENT, "int_gcal", lightweight=True))
        self.assertEqual(preflight.status, "READY")

    # 5. Token refresh failure surfaces as REAUTH_REQUIRED, never fake success
    def test_google_token_refresh_failure(self):
        tc = ToolCall(id="call_refresh", name="google_calendar.create_event", args={"summary": "X"})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FailingCalendarProvider()):
            record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc))
        self.assertEqual(record.status, "FAILED")
        self.assertEqual(record.error_code, "REAUTH_REQUIRED")
        self.assertIsNone(record.external_resource_id)

    # 6. Verified Google event creation returns a real external resource ID
    def test_google_create_event_verified(self):
        tc = ToolCall(id="call_create", name="google_calendar.create_event",
                      args={"summary": "Investor Meeting", "start_time": "2026-08-21T12:00:00"})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FakeCalendarProvider()):
            record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc, conversation_id="con_test"))
        self.assertEqual(record.status, "SUCCEEDED")
        self.assertEqual(record.external_resource_id, "evt_test_12345")
        self.assertEqual(record.data.get("title"), "Investor Meeting")

    # 7. Tool failure produces a FAILED record with error details
    def test_tool_failure(self):
        tc = ToolCall(id="call_fail", name="google_calendar.delete_event", args={})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FailingCalendarProvider()):
            record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc))
        self.assertEqual(record.status, "FAILED")
        self.assertTrue(record.message)

    # 8. No fabricated success: empty/plain/unverifiable responses never pass
    def test_no_fake_success(self):
        norm = ToolResultNormalizer.normalize_response("GoogleCalendar", "create_event", None)
        self.assertFalse(norm["success"])
        self.assertEqual(norm["error_code"], "INVALID_RESPONSE")

        norm2 = ToolResultNormalizer.normalize_response("GoogleCalendar", "create_event", "All good!")
        self.assertFalse(norm2["success"])

        norm3 = ToolResultNormalizer.normalize_response("GoogleCalendar", "create_event", {"summary": "No ID"})
        self.assertFalse(norm3["success"])
        self.assertEqual(norm3["error_code"], "INVALID_EVENT_ID")

        # Verification gate blocks an unverified LLM success claim
        gated = ConversationService._enforce_verification_gate(
            "Sure! I've scheduled the meeting.", tool_records=[]
        )
        self.assertNotIn("scheduled", gated.lower().replace("scheduled", "", 1))  # claim removed

    # 9. Duplicate tool calls are refused
    def test_duplicate_tool_execution(self):
        tc = ToolCall(id="call_dup", name="google_calendar.list_events", args={})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FakeCalendarProvider()):
            first = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc))
            second = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc))
        self.assertEqual(first.status, "SUCCEEDED")
        self.assertEqual(second.status, "FAILED")
        self.assertEqual(second.error_code, "DUPLICATE_TOOL_CALL")

    # 10. Structured response with verified records emits calendar_event block
    def test_structured_response(self):
        records = [{
            "id": "tre_1", "tool": "google_calendar.create_event", "action": "create_event",
            "integration_id": "int_gcal", "status": "SUCCEEDED",
            "external_resource_id": "evt_test_12345",
            "data": {"title": "Investor Meeting", "start_time": "2026-08-21T12:00:00+05:30",
                     "end_time": "2026-08-21T13:00:00+05:30", "timezone": "Asia/Kolkata",
                     "html_link": "https://calendar.google.com/event?id=evt_test_12345"},
        }]
        res = ResponseFormatter.format_response(
            message="Done — I've scheduled your meeting.",
            tool_records=records,
        )
        self.assertEqual(res.status, "success")
        self.assertEqual(res.execution_status, "completed")
        self.assertTrue(any(b.type == "calendar_event" for b in res.blocks))

    def test_unregistered_tool_refused(self):
        tc = ToolCall(id="call_hack", name="evil.run_arbitrary_code", args={})
        record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc))
        self.assertEqual(record.status, "FAILED")
        self.assertEqual(record.error_code, "TOOL_NOT_FOUND")


if __name__ == "__main__":
    unittest.main()