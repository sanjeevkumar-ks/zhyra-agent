import unittest
import datetime
from zoneinfo import ZoneInfo
from app.ai.integration.normalizer import ToolResultNormalizer
from app.ai.response.response_formatter import ResponseFormatter
from app.integrations.providers.google_calendar import GoogleCalendarProvider

class TestToolVerificationTruth(unittest.TestCase):

    def test_missing_event_id_fails_verification(self):
        # Raw response without id
        raw_res = {"summary": "Investor Meeting", "start": {"dateTime": "2026-08-20T12:00:00+05:30"}}
        norm = ToolResultNormalizer.normalize_response("GoogleCalendar", "create_event", raw_res)
        self.assertFalse(norm["success"])
        self.assertEqual(norm["error_code"], "INVALID_EVENT_ID")

    def test_valid_event_id_passes_verification(self):
        raw_res = {"id": "gcal_evt_12345", "summary": "Investor Meeting", "start": {"dateTime": "2026-08-20T12:00:00+05:30"}, "end": {"dateTime": "2026-08-20T13:00:00+05:30"}}
        norm = ToolResultNormalizer.normalize_response("GoogleCalendar", "create_event", raw_res)
        self.assertTrue(norm["success"])
        self.assertEqual(norm["event_id"], "gcal_evt_12345")

    def test_response_formatter_overrides_hallucinated_success(self):
        tool_result = {
            "success": False,
            "integration": "google_calendar",
            "tool": "create_event",
            "error_code": "NOT_CONNECTED",
            "message": "Google Calendar authorization is missing."
        }
        res = ResponseFormatter.format_response(
            message="Sure! I've created the event in your Google Calendar as requested.",
            tool_result=tool_result
        )
        self.assertEqual(res.status, "failed")
        self.assertIn("couldn't complete", res.message.lower())
        self.assertFalse(any(b.type == "calendar_event" for b in res.blocks))
        self.assertTrue(any(b.type == "integration_error" for b in res.blocks))

    def test_response_formatter_none_tool_result_with_tool_call_fails(self):
        res = ResponseFormatter.format_response(
            message="Sure! I've created the event.",
            tool_call={"tool": "GoogleCalendar", "method": "create_event", "args": {}},
            tool_result=None
        )
        self.assertEqual(res.status, "failed")
        self.assertIn("couldn't complete", res.message.lower())

    def test_relative_date_resolution_tomorrow(self):
        provider = GoogleCalendarProvider()
        tz_str = "Asia/Kolkata"
        tz = ZoneInfo(tz_str)
        now = datetime.datetime.now(tz)
        expected_date = (now + datetime.timedelta(days=1)).date()

        parsed_dt = provider._resolve_datetime("tomorrow at 12 PM", tz_str)
        self.assertEqual(parsed_dt.date(), expected_date)
        self.assertEqual(parsed_dt.hour, 12)
        self.assertEqual(parsed_dt.minute, 0)

if __name__ == "__main__":
    unittest.main()
