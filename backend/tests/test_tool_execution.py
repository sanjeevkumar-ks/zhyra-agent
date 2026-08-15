import unittest
import asyncio
import sys
import os

# Ensure backend root is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ai.integration.preflight import IntegrationPreflight, PreflightResult
from app.ai.integration.dynamic_registry import DynamicToolRegistry
from app.ai.integration.normalizer import ToolResultNormalizer
from app.services.tool_executor import ToolExecutor
from app.ai.response.response_formatter import ResponseFormatter

class TestToolExecutionLayer(unittest.TestCase):

    def test_normalizer_success(self):
        result = ToolResultNormalizer.normalize_response("GoogleCalendar", "create_event", {"id": "evt_123", "summary": "Investor Call", "start": {"dateTime": "2026-08-16T13:00:00Z"}})
        self.assertTrue(result["success"])
        self.assertEqual(result["event_id"], "evt_123")
        self.assertEqual(result["title"], "Investor Call")

    def test_normalizer_error(self):
        result = ToolResultNormalizer.normalize_error("Gmail", "send_email", "NOT_CONNECTED", "Gmail is disconnected")
        self.assertFalse(result["success"])
        self.assertEqual(result["error_code"], "NOT_CONNECTED")
        self.assertEqual(result["provider"], "Gmail")

    def test_dynamic_registry_descriptions(self):
        desc = DynamicToolRegistry._get_tool_description("int_gcal")
        self.assertIn("GoogleCalendar.create_event", desc)
        self.assertIn("GoogleCalendar.list_events", desc)
        self.assertIn("GoogleCalendar.update_event", desc)
        self.assertIn("GoogleCalendar.delete_event", desc)

    def test_dynamic_registry_tool_schemas(self):
        schemas = DynamicToolRegistry.get_tool_schemas(["int_gcal"])
        names = [s["name"] for s in schemas]
        self.assertIn("calendar_create_event", names)
        self.assertIn("calendar_list_events", names)

    def test_parse_calendar_tool_call(self):
        from app.services.conversation_service import ConversationService
        raw_text = 'TOOL_CALL:{"tool": "calendar_create_event", "args": {"summary": "Investor Meeting", "start_time": "2026-08-16T15:00:00Z"}}'
        parsed = ConversationService._parse_tool_call(raw_text)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["tool"], "GoogleCalendar")
        self.assertEqual(parsed["method"], "create_event")
        self.assertEqual(parsed["args"]["summary"], "Investor Meeting")

    def test_tool_dispatcher_resolution(self):
        target = ToolExecutor.TOOL_DISPATCHER.get("GoogleCalendar.createEvent")
        self.assertIsNotNone(target)
        self.assertEqual(target[0], "int_gcal")
        self.assertEqual(target[1], "create_event")

    def test_response_formatter_calendar_block(self):
        tool_result = {
            "success": True,
            "integration": "google_calendar",
            "tool": "createEvent",
            "data": {
                "event_id": "evt_999",
                "title": "Investor Meeting",
                "start_time": "2026-08-16T15:00:00+05:30",
                "end_time": "2026-08-16T16:00:00+05:30",
                "html_link": "https://calendar.google.com/event?id=evt_999"
            }
        }
        res = ResponseFormatter.format_response(
            message="Scheduled meeting 'Investor Meeting' for tomorrow at 3:00 PM.",
            tool_result=tool_result
        )
        data_dict = res.model_dump()
        self.assertIn("message", data_dict)
        self.assertTrue(len(data_dict.get("blocks", [])) > 0)

if __name__ == "__main__":
    unittest.main()
