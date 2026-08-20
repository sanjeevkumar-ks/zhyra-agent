import unittest
import asyncio
import sys
import os
from unittest import mock

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ai.gate import (
    is_action_request,
    asserts_success,
    has_verified_action_record,
    enforce_action_gate,
    build_action_state,
)
from app.services.conversation_service import ConversationService


class TestActionGate(unittest.TestCase):

    def test_is_action_request(self):
        self.assertTrue(is_action_request("Schedule a reminder in google calendar"))
        self.assertTrue(is_action_request("send an email to the team"))
        self.assertTrue(is_action_request("book a meeting tomorrow"))
        self.assertTrue(is_action_request("create an event on August 20"))
        self.assertTrue(is_action_request("What time is my appointment?"))
        self.assertFalse(is_action_request("Hello"))
        self.assertFalse(is_action_request("What is our refund policy?"))
        self.assertFalse(is_action_request(""))

    def test_asserts_success_catches_creative_phrasing(self):
        # These escape a simple exact-keyword list but must still be caught.
        self.assertTrue(asserts_success("I've added the event to your Google Calendar."))
        self.assertTrue(asserts_success("Your meeting with the investor has been placed on the calendar."))
        self.assertTrue(asserts_success("I have scheduled the event for 6 PM."))
        self.assertTrue(asserts_success("Done — I've scheduled your meeting."))
        self.assertTrue(asserts_success("The calendar event was created successfully."))
        self.assertTrue(asserts_success("Your reminder has been set."))
        self.assertTrue(asserts_success("All set, the event is on your calendar."))
        self.assertFalse(asserts_success("I wasn't able to complete that action."))
        self.assertFalse(asserts_success("Google Calendar authorization has expired."))
        self.assertFalse(asserts_success("Which date works best for you?"))

    def test_verified_record_allows_success(self):
        records = [{"status": "SUCCEEDED", "simulated": False,
                    "external_resource_id": "evt_real_123", "id": "tre_1",
                    "tool": "google_calendar.create_event", "action": "create_event"}]
        msg = "Done — I've scheduled your meeting."
        out = enforce_action_gate(msg, "Schedule a meeting tomorrow", records)
        self.assertEqual(out, msg)

    def test_simulated_record_does_not_allow_success(self):
        records = [{"status": "SUCCEEDED", "simulated": True, "id": "tre_1",
                    "external_resource_id": "sim_abc"}]
        msg = "Done — I've scheduled your meeting."
        out = enforce_action_gate(msg, "Schedule a meeting tomorrow", records)
        self.assertNotEqual(out, msg)
        self.assertIn("wasn't able to complete", out)

    def test_failed_record_keeps_honest_message(self):
        records = [{"status": "FAILED", "simulated": False, "id": "tre_1",
                    "error_code": "REAUTH_REQUIRED", "external_resource_id": None}]
        msg = "I couldn't complete the action because: Google Calendar authorization has expired."
        out = enforce_action_gate(msg, "Schedule a meeting tomorrow", records)
        self.assertEqual(out, msg)

    def test_no_record_blocks_any_success_phrasing(self):
        # The core bug: model claims success with zero tool execution.
        msg = "I've added the event to your Google Calendar. Event created: Title: meeting with investor"
        out = enforce_action_gate(msg, "Schedule a reminder in google calendar on August 20, 2026 at 6 pm", [])
        self.assertNotEqual(out, msg)
        self.assertIn("wasn't able to complete", out)

    def test_non_action_query_uses_keyword_gate(self):
        # A non-action query that claims an action is still caught by keyword gate.
        out = ConversationService._enforce_verification_gate(
            "I've added the event to your Google Calendar.", query="")
        self.assertIn("wasn't able to complete", out)

    def test_hard_gate_via_service(self):
        # Full path: query + no records + success phrasing -> blocked.
        out = ConversationService._enforce_verification_gate(
            "I've added the event to your Google Calendar.",
            tool_records=[],
            query="Schedule a reminder in google calendar",
        )
        self.assertIn("wasn't able to complete", out)
        # With a real verified record the same message is allowed.
        out2 = ConversationService._enforce_verification_gate(
            "Done — I've scheduled your meeting.",
            tool_records=[{"status": "SUCCEEDED", "simulated": False,
                           "external_resource_id": "evt_real_123", "id": "tre_1",
                           "tool": "google_calendar.create_event", "action": "create_event"}],
            query="Schedule a meeting",
        )
        self.assertEqual(out2, "Done — I've scheduled your meeting.")

    def test_build_action_state(self):
        state = build_action_state([
            {"id": "tre_1", "tool": "google_calendar.create_event", "action": "create_event",
             "status": "SUCCEEDED", "simulated": False, "external_resource_id": "evt_real_123"},
            {"id": "tre_2", "tool": "gmail.send_email", "action": "send_email",
             "status": "FAILED", "simulated": False, "external_resource_id": None,
             "error_code": "REAUTH_REQUIRED"},
            {"id": "tre_3", "tool": "google_calendar.list_events", "action": "list_events",
             "status": "SUCCEEDED", "simulated": True, "external_resource_id": "sim_x"},
        ])
        self.assertEqual(state[0]["status"], "created")
        self.assertEqual(state[0]["resource_id"], "evt_real_123")
        self.assertEqual(state[0]["type"], "calendar_event")
        self.assertEqual(state[1]["status"], "failed")
        self.assertEqual(state[1]["error_code"], "REAUTH_REQUIRED")
        self.assertEqual(state[2]["status"], "simulated")

    def test_verified_record_must_match_action_domain(self):
        # A gmail send success must NOT validate a calendar-event claim.
        records = [{"status": "SUCCEEDED", "simulated": False, "id": "tre_g",
                    "tool": "gmail.send_email", "action": "send_email",
                    "external_resource_id": "msg_123"}]
        msg = "Done — I've scheduled your meeting on Google Calendar."
        out = enforce_action_gate(msg, "Schedule a meeting tomorrow", records)
        self.assertIn("wasn't able to complete", out)

        # A matching calendar record DOES validate the claim.
        records_cal = [{"status": "SUCCEEDED", "simulated": False, "id": "tre_c",
                        "tool": "google_calendar.create_event", "action": "create_event",
                        "external_resource_id": "evt_real_123"}]
        out2 = enforce_action_gate(msg, "Schedule a meeting tomorrow", records_cal)
        self.assertEqual(out2, msg)

    def test_unrelated_tool_result_cannot_validate_claim(self):
        # Workflow-injected gmail result must not validate a calendar claim.
        gmail_result = {"success": True, "integration": "gmail", "tool": "send_email",
                        "data": {"message_id": "msg_1"}}
        msg = "I've added the event to your Google Calendar."
        out = enforce_action_gate(msg, "Schedule a reminder in google calendar", [], gmail_result)
        self.assertIn("wasn't able to complete", out)

        # Matching calendar result with a real resource id DOES validate.
        cal_result = {"success": True, "integration": "google_calendar", "tool": "create_event",
                      "data": {"event_id": "evt_real_123"}}
        out2 = enforce_action_gate(msg, "Schedule a reminder in google calendar", [], cal_result)
        self.assertEqual(out2, msg)

        # Calendar success WITHOUT a real event id is NOT verified.
        cal_no_id = {"success": True, "integration": "google_calendar", "tool": "create_event",
                     "data": {}}
        out3 = enforce_action_gate(msg, "Schedule a reminder in google calendar", [], cal_no_id)
        self.assertIn("wasn't able to complete", out3)

    def test_runtime_blocks_prose_only_hallucination(self):
        """The exact observed bug: LLM returns a success claim with NO tool call.
        The full AgentRuntime must deliver the honest refusal, never the claim."""
        from app.ai.runtime.agent_runtime import AgentRuntime

        hallucinated = ("I've added the event to your Google Calendar. Event created: "
                        "Title: meeting with investor Date & Time: August 20, 2026 at 6:00 PM IST")

        class FakeStructured:
            def __init__(self, text, tool_calls=None):
                self.text = text
                self.tool_calls = tool_calls or []

        async def fake_generate_structured(workspace_id, prompt, system_prompt=None,
                                           agent_override=None, functions=None):
            return FakeStructured(hallucinated, [])

        async def run():
            with mock.patch("app.ai.graph.agent_graph.ProviderManager.generate_structured",
                            side_effect=fake_generate_structured):
                return await AgentRuntime.execute(
                    workspace_id="ws_usr_admin_",
                    agent_id="agt_4794ff9c",
                    query="Schedule a reminder in google calendar on August 20, 2026 at 6 pm",
                    history=[],
                    conversation_id="con_int_gate",
                    mode="live",
                    trace_id="trace_int_gate",
                )

        res = asyncio.run(run())
        self.assertEqual(res.get("tool_events"), [])
        self.assertEqual(res.get("action_state"), [])
        text = res.get("text", "")
        self.assertNotIn("added the event", text.lower())
        self.assertIn("wasn't able to complete", text)

    def test_runtime_allows_verified_calendar_success(self):
        """When a real verified calendar record exists, the success message flows."""
        from app.ai.runtime.agent_runtime import AgentRuntime

        class FakeStructured:
            def __init__(self, text, tool_calls=None):
                self.text = text
                self.tool_calls = tool_calls or []

        async def fake_generate_structured(workspace_id, prompt, system_prompt=None,
                                           agent_override=None, functions=None):
            # Model emits a native calendar tool call.
            return FakeStructured("", [
                {"id": "call_0", "name": "calendar_create_event", "action": "execute",
                 "args": {"summary": "meeting with investor", "start_time": "2026-08-21T12:00:00"},
                 "raw_name": "calendar_create_event"}
            ])

        async def fake_execute_tool_call(workspace_id, agent_id, tool_call, conversation_id="", user_id="", mode="live"):
            from app.ai.tools.models import ToolExecutionRecord
            import time
            rec = ToolExecutionRecord(
                id="tre_real", tool_call_id=tool_call.id, workspace_id=workspace_id,
                agent_id=agent_id, conversation_id=conversation_id, tool=tool_call.name,
                action="create_event", integration_id="int_gcal", status="SUCCEEDED",
                started_at=time.time(), completed_at=time.time(), duration_ms=500,
                external_resource_id="evt_real_123",
                data={"title": "meeting with investor", "start_time": "2026-08-21T12:00:00"},
            )
            return rec

        async def run():
            with mock.patch("app.ai.graph.agent_graph.ProviderManager.generate_structured",
                            side_effect=fake_generate_structured), \
                 mock.patch("app.services.tool_executor.ToolExecutor.execute_tool_call",
                            side_effect=fake_execute_tool_call):
                return await AgentRuntime.execute(
                    workspace_id="ws_usr_admin_",
                    agent_id="agt_4794ff9c",
                    query="Schedule a meeting with investor tomorrow at 12 PM",
                    history=[],
                    conversation_id="con_int_ok",
                    mode="live",
                    trace_id="trace_int_ok",
                )

        res = asyncio.run(run())
        self.assertEqual(len(res.get("tool_events", [])), 1)
        self.assertEqual(res["tool_events"][0]["type"], "tool_completed")
        self.assertEqual(res["tool_events"][0]["external_resource_id"], "evt_real_123")
        self.assertEqual(res.get("action_state", [])[0]["status"], "created")
        self.assertEqual(res.get("action_state", [])[0]["resource_id"], "evt_real_123")
        self.assertIn("scheduled", (res.get("text") or "").lower())

    def test_retrieval_skipped_when_rag_disabled(self):
        from app.ai.context.retrieval import RetrievalContextBuilder
        from app.ai.context.models import ContextConfig

        async def run():
            return await RetrievalContextBuilder.build(
                "ws_usr_admin_",
                {"knowledge_sources": ["Sanjeev_kumar.pdf"]},
                "Schedule a calendar event",
                ContextConfig(rag_enabled=False),
                2500,
            )
        result = asyncio.run(run())
        self.assertEqual(result, ("", 0, []))

    def test_retrieval_skips_embedding_when_no_collection(self):
        from app.ai.context.retrieval import RetrievalContextBuilder
        from app.ai.context.models import ContextConfig
        from app.database.qdrant import qdrant_client

        class FakeCollections:
            collections = []

        class FakeClient:
            def get_collections(self):
                return FakeCollections()

        with mock.patch.object(qdrant_client, "get_collections",
                               side_effect=FakeClient().get_collections):
            async def run():
                return await RetrievalContextBuilder.build(
                    "ws_usr_admin_",
                    {"knowledge_sources": ["Sanjeev_kumar.pdf"]},
                    "What is the refund policy?",
                    ContextConfig(),
                    2500,
                )
            result = asyncio.run(run())
        self.assertEqual(result, ("", 0, []))
        # No fallback mock RAG is fabricated by default.
        self.assertNotIn("Sanjeev_kumar.pdf", result[0])


if __name__ == "__main__":
    unittest.main()