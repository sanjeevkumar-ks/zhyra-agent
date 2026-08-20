"""
Terminal-state contract tests (Requirement 36).

Every AgentRuntime execution and every streamed run MUST end with exactly one
deterministic terminal outcome (COMPLETED | FAILED | REAUTH_REQUIRED | TIMED_OUT)
and a non-empty user-visible message. No execution may end silently.
"""
import unittest
import asyncio
import sys
import os
import json
from unittest import mock

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.ai.tools.models import StructuredLLMResponse
from app.ai.runtime.agent_runtime import AgentRuntime
from app.services.conversation_service import ConversationService
from app.database.firestore import firestore_client

WS = "ws_usr_admin_"
AGENT = "agt_4794ff9c"

TERMINAL_EVENT_TYPES = {"run_completed", "run_failed", "run_timeout", "reauth_required"}


def _make_convo():
    return asyncio.run(ConversationService.create_conversation(
        workspace_id=WS, agent_id=AGENT, customer="Reliability Tester",
        channel="Playground", is_test=True))


def _collect(chunks: list) -> str:
    return "".join(chunks)


def _parse_events(joined: str) -> list:
    events = []
    for line in joined.split("\n"):
        line = line.strip()
        if line.startswith("__EVENT__:{"):
            try:
                events.append(json.loads(line[len("__EVENT__:"):]))
            except Exception:
                pass
    return events


class TestRuntimeTerminalContract(unittest.TestCase):

    def setUp(self):
        ToolExecutor = __import__("app.services.tool_executor", fromlist=["ToolExecutor"]).ToolExecutor
        ToolExecutor._recent_calls = {}

    # 1. Empty LLM response (no text, no tool calls) -> honest FAILED terminal
    def test_runtime_empty_llm_returns_non_empty_terminal(self):
        async def empty_llm(**kwargs):
            return StructuredLLMResponse(text="", tool_calls=[], model="gemini-3.5-flash",
                                         provider="gemini", finish_reason="BLOCKED:safety")

        with mock.patch("app.ai.graph.agent_graph.ProviderManager.generate_structured",
                        side_effect=empty_llm):
            res = asyncio.run(AgentRuntime.execute(
                workspace_id=WS, agent_id=AGENT,
                query="Schedule a reminder in google calendar for August 20, 2026 at 8pm",
                history=[], conversation_id="con_rt_empty", mode="live", trace_id="tr_empty"))
        self.assertEqual(res.get("terminal_state"), "FAILED")
        self.assertEqual(res.get("execution_status"), "failed")
        self.assertNotEqual(res.get("text", "").strip(), "")
        self.assertNotIn("created the event", res.get("text", "").lower())

    # 2. LLM provider error -> non-empty FAILED terminal, never silent
    def test_runtime_llm_provider_error_returns_terminal(self):
        async def boom(**kwargs):
            raise RuntimeError("Gemini API returned status 429: quota exceeded")

        with mock.patch("app.ai.graph.agent_graph.ProviderManager.generate_structured",
                        side_effect=boom):
            res = asyncio.run(AgentRuntime.execute(
                workspace_id=WS, agent_id=AGENT, query="Hello", history=[],
                conversation_id="con_rt_err", mode="live", trace_id="tr_err"))
        self.assertEqual(res.get("terminal_state"), "FAILED")
        self.assertEqual(res.get("error_code"), "LLM_PROVIDER_ERROR")
        self.assertNotEqual(res.get("text", "").strip(), "")
        self.assertNotIn("Gemini API", res.get("text", ""))

    # 3. Overall agent timeout -> TIMED_OUT terminal with user-visible message
    def test_runtime_overall_timeout_returns_timed_out(self):
        async def slow_graph(*args, **kwargs):
            await asyncio.sleep(5)
            return {"ai_text": "late"}

        with mock.patch("app.ai.runtime.agent_runtime.compiled_agent_graph.ainvoke",
                        side_effect=slow_graph):
            res = asyncio.run(AgentRuntime.execute(
                workspace_id=WS, agent_id=AGENT, query="Hello", history=[],
                conversation_id="con_rt_to", mode="live", trace_id="tr_to",
                timeout_seconds=1))
        self.assertEqual(res.get("terminal_state"), "TIMED_OUT")
        self.assertEqual(res.get("error_code"), "AGENT_TIMEOUT")
        self.assertNotEqual(res.get("text", "").strip(), "")

    # 4. Every runtime result carries a valid terminal_state
    def test_runtime_always_has_valid_terminal_state(self):
        valid = {"COMPLETED", "FAILED", "REAUTH_REQUIRED", "TIMED_OUT"}

        async def normal_llm(**kwargs):
            return StructuredLLMResponse(text="Hello there!", model="gemini-3.5-flash", provider="gemini")

        with mock.patch("app.ai.graph.agent_graph.ProviderManager.generate_structured",
                        side_effect=normal_llm):
            res = asyncio.run(AgentRuntime.execute(
                workspace_id=WS, agent_id=AGENT, query="Hello", history=[],
                conversation_id="con_rt_ok", mode="live", trace_id="tr_ok"))
        self.assertIn(res.get("terminal_state"), valid)
        self.assertNotEqual(res.get("text", "").strip(), "")


class TestStreamTerminalContract(unittest.TestCase):

    def setUp(self):
        ToolExecutor = __import__("app.services.tool_executor", fromlist=["ToolExecutor"]).ToolExecutor
        ToolExecutor._recent_calls = {}

    def _run_stream(self, convo_id, execute_mock, text="Hello", heartbeat=10.0, stream_timeout=60.0):
        async def collect():
            out = []
            async for c in ConversationService.stream_agent_chunks(
                WS, convo_id, text, mode="live",
                heartbeat_interval=heartbeat, stream_timeout=stream_timeout,
            ):
                out.append(c)
            return out
        with mock.patch("app.ai.runtime.agent_runtime.AgentRuntime.execute",
                        side_effect=execute_mock):
            return asyncio.run(collect())

    def test_stream_completed_emits_exactly_one_terminal(self):
        convo = _make_convo()
        try:
            async def completed(**kwargs):
                return {"text": "Hello there!", "blocks": [], "tool_events": [],
                        "timings": {"total_ms": 5}, "knowledge_used": [],
                        "execution_status": "completed", "terminal_state": "COMPLETED",
                        "error_code": "", "action_state": []}
            chunks = self._run_stream(convo["id"], completed)
            joined = _collect(chunks)
            events = _parse_events(joined)
            terminals = [e for e in events if e["type"] in TERMINAL_EVENT_TYPES]
            self.assertEqual(len(terminals), 1)
            self.assertEqual(terminals[0]["type"], "run_completed")
            self.assertIn("assistant_message", [e["type"] for e in events])
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    def test_stream_failed_emits_run_failed_and_message(self):
        convo = _make_convo()
        try:
            async def failed(**kwargs):
                return {"text": "The AI model didn't return a response. Please try again.",
                        "blocks": [], "tool_events": [], "timings": {},
                        "knowledge_used": [], "execution_status": "failed",
                        "terminal_state": "FAILED", "error_code": "EMPTY_MODEL_RESPONSE",
                        "action_state": []}
            chunks = self._run_stream(convo["id"], failed)
            joined = _collect(chunks)
            events = _parse_events(joined)
            terminals = [e for e in events if e["type"] in TERMINAL_EVENT_TYPES]
            self.assertEqual(len(terminals), 1)
            self.assertEqual(terminals[0]["type"], "run_failed")
            self.assertEqual(terminals[0]["error_code"], "EMPTY_MODEL_RESPONSE")
            msgs = [e for e in events if e["type"] == "assistant_message"]
            self.assertTrue(msgs and msgs[-1]["content"].strip())
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    def test_stream_reauth_emits_reauth_terminal(self):
        convo = _make_convo()
        try:
            async def reauth(**kwargs):
                return {"text": "Google Calendar needs to be reconnected before I can schedule this.",
                        "blocks": [], "tool_events": [], "timings": {},
                        "knowledge_used": [], "execution_status": "reauth_required",
                        "terminal_state": "REAUTH_REQUIRED", "error_code": "REAUTH_REQUIRED",
                        "integration_used": "int_gcal", "action_state": []}
            chunks = self._run_stream(convo["id"], reauth)
            events = _parse_events(_collect(chunks))
            terminals = [e for e in events if e["type"] in TERMINAL_EVENT_TYPES]
            self.assertEqual(len(terminals), 1)
            self.assertEqual(terminals[0]["type"], "reauth_required")
            self.assertEqual(terminals[0]["integration"], "int_gcal")
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    def test_stream_heartbeat_keeps_connection_alive(self):
        convo = _make_convo()
        try:
            async def slow(**kwargs):
                await asyncio.sleep(0.4)
                return {"text": "Done.", "blocks": [], "tool_events": [], "timings": {},
                        "knowledge_used": [], "execution_status": "completed",
                        "terminal_state": "COMPLETED", "error_code": "", "action_state": []}
            chunks = self._run_stream(convo["id"], slow, heartbeat=0.05, stream_timeout=60.0)
            events = _parse_events(_collect(chunks))
            heartbeats = [e for e in events if e["type"] == "heartbeat"]
            self.assertGreater(len(heartbeats), 0)
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    def test_stream_timeout_emits_run_timeout(self):
        convo = _make_convo()
        try:
            async def never(**kwargs):
                await asyncio.sleep(30)
                return {"text": "never", "blocks": [], "tool_events": [], "timings": {},
                        "knowledge_used": [], "execution_status": "completed",
                        "terminal_state": "COMPLETED", "error_code": "", "action_state": []}
            chunks = self._run_stream(convo["id"], never, heartbeat=0.05, stream_timeout=0.3)
            events = _parse_events(_collect(chunks))
            terminals = [e for e in events if e["type"] in TERMINAL_EVENT_TYPES]
            self.assertEqual(len(terminals), 1)
            self.assertEqual(terminals[0]["type"], "run_timeout")
            self.assertEqual(terminals[0]["error_code"], "AGENT_TIMEOUT")
            msgs = [e for e in events if e["type"] == "assistant_message"]
            self.assertTrue(msgs and msgs[-1]["content"].strip())
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    def test_stream_runtime_exception_emits_run_failed(self):
        convo = _make_convo()
        try:
            async def crash(**kwargs):
                raise RuntimeError("boom")
            chunks = self._run_stream(convo["id"], crash)
            events = _parse_events(_collect(chunks))
            terminals = [e for e in events if e["type"] in TERMINAL_EVENT_TYPES]
            self.assertEqual(len(terminals), 1)
            self.assertEqual(terminals[0]["type"], "run_failed")
        finally:
            firestore_client.collection("conversations").document(convo["id"]).delete()

    def test_ten_identical_runs_all_terminate(self):
        """10 identical executions must each end with a terminal state."""
        for i in range(10):
            convo = _make_convo()
            try:
                async def normal(**kwargs):
                    return {"text": f"Run {i} done.", "blocks": [], "tool_events": [],
                            "timings": {}, "knowledge_used": [], "execution_status": "completed",
                            "terminal_state": "COMPLETED", "error_code": "", "action_state": []}
                chunks = self._run_stream(convo["id"], normal, text="What is on my calendar tomorrow?")
                events = _parse_events(_collect(chunks))
                terminals = [e for e in events if e["type"] in TERMINAL_EVENT_TYPES]
                self.assertEqual(len(terminals), 1, f"run {i} did not end with exactly one terminal")
                self.assertIn(terminals[0]["type"], TERMINAL_EVENT_TYPES)
            finally:
                firestore_client.collection("conversations").document(convo["id"]).delete()


if __name__ == "__main__":
    unittest.main()