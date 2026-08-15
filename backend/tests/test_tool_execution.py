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

    def test_response_formatter_calendar_block(self):
        tool_result = {
            "success": True,
            "tool": "GoogleCalendar",
            "method": "create_event",
            "data": {
                "id": "evt_999",
                "summary": "Investor Call",
                "start": {"dateTime": "2026-08-16T13:00:00Z"},
                "end": {"dateTime": "2026-08-16T13:30:00Z"},
                "status": "confirmed"
            }
        }
        res = ResponseFormatter.format_response(
            message="Scheduled meeting 'Investor Call' for tomorrow at 1:00 PM.",
            tool_result=tool_result
        )
        data_dict = res.model_dump()
        self.assertIn("message", data_dict)
        self.assertTrue(len(data_dict.get("blocks", [])) > 0)

if __name__ == "__main__":
    unittest.main()
