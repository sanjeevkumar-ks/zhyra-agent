import unittest
import asyncio
import sys
import os
import time
import json
from unittest import mock

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ai.tools import tool_registry
from app.ai.tools.models import ToolCall
from app.ai.integration.dynamic_registry import DynamicToolRegistry
from app.services.tool_executor import ToolExecutor
from app.ai.response.response_formatter import ResponseFormatter
from app.services.conversation_service import ConversationService
from app.database.firestore import firestore_client

WS = "ws_usr_admin_"
AGENT = "agt_4794ff9c"          # Gmail + Google Meet + Google Calendar
OTHER_AGENT = "agt_nova_ws_us"  # Zendesk + Stripe + Order DB


class FakeCalendarProvider:
    async def execute(self, workspace_id: str, method: str, args: dict) -> dict:
        return {
            "success": True,
            "integration": "google_calendar",
            "tool": method,
            "data": {
                "event_id": "evt_test_abc123",
                "title": "Investor Meeting",
                "start_time": "2026-08-21T12:00:00+05:30",
                "end_time": "2026-08-21T13:00:00+05:30",
                "timezone": "Asia/Kolkata",
                "html_link": "https://calendar.google.com/event?id=evt_test_abc123",
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


class FakeCalendarService:
    class _Exec:
        def __init__(self, payload): self._payload = payload
        def execute(self): return self._payload

    class _Events:
        def insert(self, calendarId, body):
            return FakeCalendarService._Exec({
                "id": "evt_real_1",
                "summary": body.get("summary", ""),
                "start": {"dateTime": body.get("start", {}).get("dateTime")},
                "end": {"dateTime": body.get("end", {}).get("dateTime")},
                "htmlLink": "https://calendar.google.com/event?id=evt_real_1",
            })
        def get(self, calendarId, eventId):
            return FakeCalendarService._Exec({"id": eventId})
        def list(self, **kw):
            return FakeCalendarService._Exec({"items": []})

    def events(self):
        return FakeCalendarService._Events()


class TestPlaygroundRuntime(unittest.TestCase):

    def setUp(self):
        ToolExecutor._recent_calls = {}

    # 1. Playground loads the real agent (session scoped to authenticated workspace)
    def test_playground_loads_real_agent(self):
        convo = asyncio.run(ConversationService.create_conversation(
            workspace_id=WS, agent_id=AGENT, customer="Playground Tester", channel="Playground", is_test=True
        ))
        try:
            self.assertEqual(convo["workspace_id"], WS)
            self.assertTrue(convo["is_test"])
            self.assertEqual(convo["agent_id"], AGENT)
            self.assertEqual(convo["agent_name"], "Nila")
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    # 2. Playground resolves workspace (agent from another workspace is rejected)
    def test_playground_validates_workspace(self):
        # Inject a foreign-workspace agent then verify the playground refuses it.
        foreign_agent_id = "agt_foreign_ws"
        firestore_client.collection("agents").document(foreign_agent_id).set({
            "id": foreign_agent_id, "name": "Foreign", "workspace_id": "other_workspace_xyz", "tools": []
        })
        try:
            with self.assertRaises(Exception) as ctx:
                asyncio.run(ConversationService.create_conversation(
                    workspace_id=WS, agent_id=foreign_agent_id, customer="X", channel="Playground", is_test=True
                ))
            self.assertEqual(getattr(ctx.exception, "status_code", 0), 403)
        finally:
            firestore_client.collection("agents").document(foreign_agent_id).delete()

    # 3. Playground loads only the agent's ASSIGNED tools
    def test_playground_loads_assigned_tools(self):
        assigned = DynamicToolRegistry._get_assigned_ids(AGENT)
        self.assertIn("int_gcal", assigned)
        self.assertIn("int_gmail", assigned)
        self.assertIn("int_gmeet", assigned)
        ready = tool_registry.get_ready_tool_keys(assigned)
        self.assertIn("google_calendar.create_event", ready)
        self.assertIn("gmail.send_email", ready)
        # The agent does NOT have Slack -> slack tools must not be ready
        self.assertNotIn("slack.send_message", ready)

    # 4. Playground resolves the real connection (lightweight, no network)
    def test_playground_resolves_real_connection(self):
        from app.ai.integration.preflight import IntegrationPreflight
        preflight = asyncio.run(IntegrationPreflight.check(WS, AGENT, "int_gcal", lightweight=True))
        self.assertEqual(preflight.status, "READY")

    # 5. Structured tool call is detected and resolved via the registry
    def test_structured_tool_call_detected(self):
        tc = ToolCall(id="call_1", name="calendar_create_event", args={"summary": "X", "start_time": "2026-08-21T12:00:00"})
        resolved = tool_registry.resolve(tc.name, method=tc.action)
        self.assertIsNotNone(resolved)
        self.assertEqual(resolved["canonical"], "google_calendar.create_event")

    # 6. Tool executes and returns a REAL verified resource ID
    def test_tool_executes_verified(self):
        tc = ToolCall(id="call_2", name="google_calendar.create_event",
                      args={"summary": "Investor Meeting", "start_time": "2026-08-21T12:00:00"})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FakeCalendarProvider()):
            record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc, conversation_id="con_test"))
        self.assertEqual(record.status, "SUCCEEDED")
        self.assertEqual(record.external_resource_id, "evt_test_abc123")

    # 7. Tool result returns to the runtime as a user payload
    def test_tool_result_returns(self):
        tc = ToolCall(id="call_3", name="google_calendar.list_events", args={})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FakeCalendarProvider()):
            record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc, conversation_id="con_test"))
        payload = record.to_user_payload()
        self.assertEqual(payload["status"], "SUCCEEDED")
        self.assertEqual(payload["external_resource_id"], "evt_test_abc123")
        self.assertIn("data", payload)

    # 8. Final response is generated from the verified result (calendar block)
    def test_final_response_generated(self):
        records = [{
            "id": "tre_1", "tool": "google_calendar.create_event", "action": "create_event",
            "integration_id": "int_gcal", "status": "SUCCEEDED",
            "external_resource_id": "evt_test_abc123",
            "data": {"title": "Investor Meeting", "start_time": "2026-08-21T12:00:00+05:30",
                     "end_time": "2026-08-21T13:00:00+05:30", "timezone": "Asia/Kolkata",
                     "html_link": "https://calendar.google.com/event?id=evt_test_abc123"},
        }]
        res = ResponseFormatter.format_response(message="Done — I've scheduled your meeting.", tool_records=records)
        self.assertEqual(res.status, "success")
        self.assertTrue(any(b.type == "calendar_event" for b in res.blocks))

    # 9. Raw TOOL_CALL never appears in the assistant message
    def test_raw_tool_call_never_appears(self):
        raw = 'TOOL_CALL:{"tool": "calendar_create_event", "args": {"summary": "X"}}\n\nSure, done!'
        cleaned = ConversationService.sanitize_tool_call_text(raw)
        self.assertNotIn("TOOL_CALL", cleaned)
        # Verification gate blocks unverified success claims
        gated = ConversationService._enforce_verification_gate(
            "Sure! I've scheduled the meeting.", tool_records=[])
        self.assertNotIn("scheduled", gated.lower())

    # 10. A failed tool can never produce success
    def test_failed_tool_cannot_produce_success(self):
        tc = ToolCall(id="call_4", name="google_calendar.create_event", args={"summary": "X"})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FailingCalendarProvider()):
            record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc, conversation_id="con_test"))
        self.assertEqual(record.status, "FAILED")
        self.assertEqual(record.error_code, "REAUTH_REQUIRED")
        self.assertIsNone(record.external_resource_id)

    # 11. OAuth expiration produces REAUTH_REQUIRED (never fake success)
    def test_oauth_expiry_reauth_required(self):
        tc = ToolCall(id="call_5", name="google_calendar.create_event", args={"summary": "X"})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FailingCalendarProvider()):
            record = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc, conversation_id="con_test"))
        self.assertEqual(record.error_code, "REAUTH_REQUIRED")
        self.assertNotEqual(record.status, "SUCCEEDED")

    # 12. Token refresh happens ONLY when needed
    def test_token_refresh_only_when_needed(self):
        from app.integrations.oauth_helpers import google_access_token_valid
        now = time.time()
        # Valid token with future expiry -> no refresh
        self.assertTrue(google_access_token_valid({"access_token": "t", "expires_at": now + 3600}))
        # Expired token -> refresh needed
        self.assertFalse(google_access_token_valid({"access_token": "t", "expires_at": now - 10}))
        # No expiry metadata -> assume valid, refresh only if API rejects it
        self.assertTrue(google_access_token_valid({"access_token": "t"}))
        # OAuth client mismatch -> refresh needed (detected upfront)
        import app.integrations.oauth_helpers as oauth_helpers
        with mock.patch.object(oauth_helpers, "GOOGLE_CLIENT_ID", "current_client"):
            self.assertFalse(google_access_token_valid(
                {"access_token": "t", "client_id": "other_client"}))
        # No token at all -> refresh needed
        self.assertFalse(google_access_token_valid({}))

        # Provider-level: valid token must NOT trigger a refresh
        from app.integrations.providers.google_calendar import GoogleCalendarProvider
        provider = GoogleCalendarProvider()
        refresh_calls = {"n": 0}
        async def no_refresh(*a, **k):
            refresh_calls["n"] += 1
            return {"access_token": "fresh", "expires_at": now + 3600, "client_id": "client"}
        with mock.patch.object(provider, "_get_calendar_service", return_value=FakeCalendarService()), \
             mock.patch("app.integrations.providers.google_calendar.load_credentials",
                        return_value={"access_token": "t", "expires_at": now + 3600, "refresh_token": "rt"}), \
             mock.patch("app.integrations.oauth_helpers.refresh_google_token", side_effect=no_refresh), \
             mock.patch("app.integrations.providers.google_calendar.save_credentials"):
            res = asyncio.run(provider.execute(WS, "create_event", {"summary": "X"}))
        self.assertTrue(res.get("success"))
        self.assertEqual(refresh_calls["n"], 0, "Valid token must not be refreshed")

        # Expired token -> refresh exactly once
        refresh_calls["n"] = 0
        with mock.patch.object(provider, "_get_calendar_service", return_value=FakeCalendarService()), \
             mock.patch("app.integrations.providers.google_calendar.load_credentials",
                        return_value={"access_token": "old", "expires_at": now - 10, "refresh_token": "rt"}), \
             mock.patch("app.integrations.oauth_helpers.refresh_google_token", side_effect=no_refresh), \
             mock.patch("app.integrations.providers.google_calendar.save_credentials"):
            res = asyncio.run(provider.execute(WS, "create_event", {"summary": "X"}))
        self.assertTrue(res.get("success"))
        self.assertEqual(refresh_calls["n"], 1, "Expired token must be refreshed exactly once")

    # 13. Duplicate execution is prevented
    def test_duplicate_execution_prevented(self):
        tc = ToolCall(id="call_dup", name="google_calendar.list_events", args={})
        with mock.patch("app.services.integration_service.IntegrationService._get_provider",
                        return_value=FakeCalendarProvider()):
            first = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc, conversation_id="con_dup"))
            second = asyncio.run(ToolExecutor.execute_tool_call(WS, AGENT, tc, conversation_id="con_dup"))
        self.assertEqual(first.status, "SUCCEEDED")
        self.assertEqual(second.status, "FAILED")
        self.assertEqual(second.error_code, "DUPLICATE_TOOL_CALL")

    # 14. Streaming emits the structured SSE protocol (ACK + events + [DONE])
    def test_streaming_works(self):
        async def fake_execute(**kwargs):
            return {
                "text": "I couldn't complete the action because: Google Calendar authorization has expired.",
                "blocks": [{"type": "text", "data": {"text": "I couldn't complete the action."}}],
                "tool_events": [{
                    "type": "tool_failed", "tool": "calendar_create_event", "action": "create_event",
                    "status": "FAILED", "error_code": "REAUTH_REQUIRED",
                    "message": "Google Calendar authorization has expired.", "simulated": False,
                    "external_resource_id": None, "trace_id": "trace_test",
                }],
                "timings": {"agent_loading_ms": 1, "llm_ms": 2, "tool_execution_ms": 3, "total_ms": 10},
                "knowledge_used": [], "execution_status": "reauth_required", "integration_used": "int_gcal",
                "intent": "Book Appointment / Schedule Meeting", "confidence": 90,
                "actions": ["calendar_create_event: create_event -> FAILED"], "status": "active",
            }

        convo = asyncio.run(ConversationService.create_conversation(
            workspace_id=WS, agent_id=AGENT, customer="Playground Tester", channel="Playground", is_test=True))
        try:
            async def collect():
                chunks = []
                async for c in ConversationService.stream_agent_chunks(WS, convo["id"], "Schedule a meeting", mode="live"):
                    chunks.append(c)
                return chunks
            with mock.patch("app.ai.runtime.agent_runtime.AgentRuntime.execute", side_effect=fake_execute):
                chunks = asyncio.run(collect())

            joined = "".join(chunks)
            self.assertIn("__ACK__", joined)
            self.assertIn('"type": "agent_started"', joined)
            self.assertIn('"type": "assistant_status"', joined)
            self.assertIn('"type": "tool_failed"', joined)
            self.assertIn('"type": "timing"', joined)
            self.assertIn("REAUTH_REQUIRED", joined)
            # Simulated mode is honored through the stream
            async def collect_sim():
                out = []
                async for c in ConversationService.stream_agent_chunks(WS, convo["id"], "Schedule a meeting", mode="simulation"):
                    out.append(c)
                return "".join(out)
            with mock.patch("app.ai.runtime.agent_runtime.AgentRuntime.execute", side_effect=fake_execute):
                sim_joined = asyncio.run(collect_sim())
            self.assertIn('"mode": "simulation"', sim_joined)
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    # 15. Agent switching reloads the tool registry for the new agent
    def test_agent_switching_reloads_tools(self):
        assigned_a = DynamicToolRegistry._get_assigned_ids(AGENT)
        assigned_b = DynamicToolRegistry._get_assigned_ids(OTHER_AGENT)
        self.assertIn("int_gcal", assigned_a)
        self.assertNotIn("int_gcal", assigned_b)
        self.assertNotIn("int_gmail", assigned_b)

    # 16. A new conversation is a fresh session (no stale state)
    def test_new_conversation_resets_state(self):
        c1 = asyncio.run(ConversationService.create_conversation(
            workspace_id=WS, agent_id=AGENT, customer="Tester", channel="Playground", is_test=True))
        c2 = asyncio.run(ConversationService.create_conversation(
            workspace_id=WS, agent_id=AGENT, customer="Tester", channel="Playground", is_test=True))
        try:
            self.assertNotEqual(c1["id"], c2["id"])
            self.assertEqual(c1["messages"], [])
            self.assertEqual(c2["messages"], [])
        finally:
            firestore_client.collection("conversations").document(c1["id"]).delete()
            firestore_client.collection("conversations").document(c2["id"]).delete()


if __name__ == "__main__":
    unittest.main()