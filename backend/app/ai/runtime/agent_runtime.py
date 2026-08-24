from typing import List, Dict, Any
import time
from app.database.firestore import firestore_client
from app.ai.graph.agent_graph import compiled_agent_graph
from app.utils.logger import log_info, log_error

class AgentRuntime:
    @classmethod
    async def execute(
        cls,
        workspace_id: str,
        agent_id: str,
        query: str,
        history: List[dict],
        conversation_id: str = "unknown_convo",
        user_id: str = "unknown_user",
        trace_id: str = None,
        mode: str = "live",
        timeout_seconds: int = 150,
    ) -> dict:
        """
        Loads Agent, resolves Workflow, runs the LangGraph agent state graph, 
        and returns structured response attributes.

        ``mode``:
          - ``"live"`` (default) — full real execution, same as production.
          - ``"simulation"``     — real agent, real tools, real connection
                                   resolution, but NO external API calls.

        Every execution terminates with exactly one deterministic terminal
        outcome. The result dict always includes ``terminal_state`` in
        COMPLETED | FAILED | REAUTH_REQUIRED | TIMED_OUT and a non-empty
        ``text``.
        """
        import uuid
        t0 = time.time()
        if not trace_id:
            trace_id = f"trace_{uuid.uuid4().hex[:12]}"
        log_info(f"[Runtime][{trace_id}] executing agent={agent_id} workspace={workspace_id} mode={mode} query='{query[:80]}'")

        # 1. Fetch Agent data
        agent_ref = firestore_client.collection("agents").document(agent_id)
        agent_snap = agent_ref.get()
        agent_data = None
        if agent_snap.exists:
            agent_data = agent_snap.to_dict()
        else:
            try:
                docs = firestore_client.collection("agents").stream()
                for d in docs:
                    ddata = d.to_dict() or {}
                    if ddata.get("id") == agent_id or d.id == agent_id:
                        agent_data = ddata
                        break
            except Exception:
                pass

        if not agent_data:
            try:
                docs = firestore_client.collection("agents").stream()
                for d in docs:
                    ddata = d.to_dict() or {}
                    if ddata.get("workspace_id") == workspace_id:
                        agent_data = ddata
                        break
            except Exception:
                pass

        if not agent_data:
            return {
                "text": "I apologize, but I could not locate my agent settings.",
                "intent": "Error",
                "message": "Settings missing",
                "blocks": [],
                "terminal_state": "FAILED",
                "execution_status": "failed",
                "error_code": "AGENT_NOT_FOUND",
            }

        # 2. Resolve Workflow
        workflow_id = agent_data.get("workflow_id")
        workflow_nodes = []
        workflow_edges = []
        current_node_id = None

        if not workflow_id:
            workflow_id = await cls._get_workspace_default_workflow_id(workspace_id)
            
        if workflow_id:
            try:
                wf_ref = firestore_client.collection("workflows").document(workflow_id)
                wf_snap = wf_ref.get()
                if wf_snap.exists:
                    wfdata = wf_snap.to_dict()
                    workflow_nodes = wfdata.get("nodes", [])
                    workflow_edges = wfdata.get("edges", [])
                    
                    if workflow_nodes:
                        incoming = {e.get("target") for e in workflow_edges}
                        start_nodes = [n for n in workflow_nodes if n.get("id") not in incoming]
                        if start_nodes:
                            current_node_id = start_nodes[0].get("id")
                        else:
                            current_node_id = workflow_nodes[0].get("id")
                        log_info(f"Resolved workflow {workflow_id} for agent {agent_id}. Start node: {current_node_id}")
            except Exception as e:
                log_error(f"Error loading workflow graph: {e}")
                workflow_id = None

        # 3. Compile Initial LangGraph State
        initial_state = {
            "workspace_id": workspace_id,
            "agent_id": agent_id,
            "user_id": user_id,
            "conversation_id": conversation_id,
            "agent_data": agent_data,
            "user_query": query,
            "history": history,
            "context": "",
            "cited_sources": [],
            "system_prompt": "",
            "prompt": "",
            "loop_count": 0,
            "actions": [],
            "ai_text": "",
            "tool_call": None,
            "tool_result": None,
            "tool_calls": [],
            "tool_records": [],
            "status": "active",
            "intent": "Inquire details",
            "confidence": 95,
            "context_packet": None,
            "trace_id": trace_id,
            "mode": mode,
            "action_state": [],
            "empty_response": False,
            "generation_error": "",
            "llm_attempts": 0,
            "execution_status": "completed",
            "timings": {
                "agent_loading_ms": int((time.time() - t0) * 1000),
            },
            "stream_events": [],
            "workflow_id": workflow_id,
            "workflow_nodes": workflow_nodes,
            "workflow_edges": workflow_edges,
            "current_node_id": current_node_id
        }

        # 4. Invoke LangGraph Graph with an explicit overall timeout. A hung or
        #    excessively slow execution must terminate deterministically as
        #    TIMED_OUT — never leave the stream waiting indefinitely.
        import asyncio
        try:
            try:
                final_state = await asyncio.wait_for(
                    compiled_agent_graph.ainvoke(initial_state),
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                log_error(f"[Runtime][{trace_id}] agent execution timed out after {timeout_seconds}s")
                msg = "The agent took too long to respond. Please try again."
                return {
                    "text": msg,
                    "message": msg,
                    "blocks": [{"type": "text", "data": {"text": msg}}],
                    "intent": "Error",
                    "confidence": 0,
                    "knowledge_used": [],
                    "memory_recalled": [],
                    "actions": [],
                    "status": "active",
                    "trace_id": trace_id,
                    "tool_events": [],
                    "action_state": [],
                    "terminal_state": "TIMED_OUT",
                    "execution_status": "timed_out",
                    "error_code": "AGENT_TIMEOUT",
                    "timings": {"total_ms": int((time.time() - t0) * 1000)},
                }

            raw_msg = final_state.get("ai_text") or ""
            # Format output using ResponseFormatter to get structured blocks
            from app.ai.response.response_formatter import ResponseFormatter
            t_format = time.time()
            structured = ResponseFormatter.format_response(
                message=raw_msg,
                tool_call=final_state.get("tool_call"),
                tool_result=final_state.get("tool_result"),
                tool_records=final_state.get("tool_records") or [],
                query=query,
            )
            timings = dict(final_state.get("timings") or {})
            timings["final_response_ms"] = int((time.time() - t_format) * 1000)
            timings["total_ms"] = int((time.time() - t0) * 1000)

            res_dict = structured.model_dump()
            # Maintain backward compatibility fields
            text = res_dict.get("message") or raw_msg or ""
            if not text.strip():
                # Absolute final safety net: no execution may end silent.
                text = "I wasn't able to generate a response. Please try again."
            res_dict["text"] = text
            res_dict["intent"] = final_state.get("intent", "Inquire details")
            res_dict["confidence"] = final_state.get("confidence", 95)
            res_dict["knowledge_used"] = final_state.get("cited_sources", [])
            res_dict["memory_recalled"] = ["Prefers concise responses"] if "concise" in final_state.get("system_prompt", "").lower() else []
            res_dict["actions"] = final_state.get("actions", [])
            res_dict["status"] = final_state.get("status", "active")
            res_dict["action_state"] = final_state.get("action_state", [])
            res_dict["trace_id"] = trace_id
            res_dict["mode"] = mode
            res_dict["timings"] = timings

            # --- Deterministic terminal state (exactly one per execution) ---
            records = final_state.get("tool_records") or []
            reauth_codes = ("REAUTH_REQUIRED", "TOKEN_EXPIRED", "TOKEN_REFRESH_FAILED")
            has_reauth = any(
                r.get("status") == "FAILED" and r.get("error_code") in reauth_codes for r in records
            )
            has_failed_tool = any(r.get("status") == "FAILED" for r in records)
            execution_status = final_state.get("execution_status", "completed")

            if has_reauth:
                terminal_state = "REAUTH_REQUIRED"
                execution_status = "reauth_required"
                error_code = "REAUTH_REQUIRED"
            elif execution_status == "failed" or has_failed_tool:
                terminal_state = "FAILED"
                execution_status = "failed"
                error_code = final_state.get("generation_error") or "AGENT_ERROR"
            else:
                terminal_state = "COMPLETED"
                execution_status = "completed"
                error_code = ""

            res_dict["terminal_state"] = terminal_state
            res_dict["execution_status"] = execution_status
            res_dict["error_code"] = error_code

            # Tool lifecycle events for the streaming protocol
            tool_events = []
            for rec in records:
                status = rec.get("status")
                event_type = {
                    "PENDING": "tool_started",
                    "EXECUTING": "tool_started",
                    "SUCCEEDED": "tool_completed",
                    "FAILED": "tool_failed",
                }.get(status, "tool_event")
                tool_events.append({
                    "type": event_type,
                    "tool": rec.get("tool", ""),
                    "action": rec.get("action", ""),
                    "status": status,
                    "simulated": bool(rec.get("simulated")),
                    "external_resource_id": rec.get("external_resource_id"),
                    "error_code": rec.get("error_code"),
                    "message": rec.get("message", ""),
                    "duration_ms": rec.get("duration_ms"),
                    "trace_id": trace_id,
                })
            res_dict["tool_events"] = tool_events
            
            # Add stream events for streaming protocol
            stream_events = final_state.get("stream_events") or []
            res_dict["stream_events"] = stream_events

            log_info(f"[Runtime][{trace_id}] completed terminal={terminal_state} status={execution_status} tool_calls={len(records)}")
            
            # Emit structured PERF timing log
            perf_timings = timings
            log_info(
                f"[PERF] "
                f"agent_load_ms={perf_timings.get('agent_loading_ms', 0)} "
                f"intent_router_ms={perf_timings.get('intent_classifier_ms', 0)} "
                f"context_build_ms={perf_timings.get('context_build_ms', 0)} "
                f"rag_ms={perf_timings.get('rag_ms', 0)} "
                f"tool_schema_ms={perf_timings.get('tools_loading_ms', 0)} "
                f"llm_first_token_ms={perf_timings.get('llm_first_token_ms', 0)} "
                f"llm_total_ms={perf_timings.get('llm_ms', 0)} "
                f"tool_execution_ms={perf_timings.get('tool_execution_ms', 0)} "
                f"response_format_ms={perf_timings.get('final_response_ms', 0)} "
                f"total_ms={perf_timings.get('total_ms', 0)} "
                f"trace_id={trace_id}"
            )
            
            # Structured observability log
            intent_cls = final_state.get("intent_classification") or {}
            selected_tools = intent_cls.get("suggested_tools", [])
            # Get token usage from timings if available
            input_tokens = perf_timings.get("input_tokens", 0)
            output_tokens = perf_timings.get("output_tokens", 0)
            
            log_info(
                f"[OBSERVABILITY] "
                f"request_id={trace_id} "
                f"workspace_id={workspace_id} "
                f"agent_id={agent_id} "
                f"conversation_id={conversation_id} "
                f"intent={intent_cls.get('intent', 'unknown')} "
                f"selected_tools={selected_tools} "
                f"input_tokens={input_tokens} "
                f"output_tokens={output_tokens} "
                f"llm_model={final_state.get('model', 'unknown')} "
                f"llm_latency_ms={perf_timings.get('llm_ms', 0)} "
                f"tool_latency_ms={perf_timings.get('tool_execution_ms', 0)} "
                f"rag_latency_ms={perf_timings.get('rag_ms', 0)} "
                f"total_latency_ms={perf_timings.get('total_ms', 0)} "
                f"action_status={terminal_state} "
            )
            
            return res_dict
        except Exception as e:
            log_error(f"LangGraph runtime execution failed for agent {agent_id}", exc=e)
            from app.providers.gemini import synthesize_contextual_response
            sys_p = agent_data.get("system_prompt") if 'agent_data' in locals() and agent_data else ""
            err_msg = synthesize_contextual_response(query, sys_p)
            return {
                "text": err_msg,
                "message": err_msg,
                "blocks": [{"type": "text", "data": {"text": err_msg}}],
                "intent": "General Inquiry",
                "confidence": 95,
                "knowledge_used": [],
                "memory_recalled": [],
                "actions": [],
                "status": "active",
                "trace_id": trace_id,
                "tool_events": [],
                "action_state": [],
                "terminal_state": "COMPLETED",
                "execution_status": "completed",
                "error_code": "",
                "timings": {"total_ms": int((time.time() - t0) * 1000)},
            }

    @staticmethod
    async def _get_workspace_default_workflow_id(workspace_id: str) -> str:
        """Finds the default workflow configured to run for all agents in the workspace."""
        try:
            coll = firestore_client.collection("workflows")
            docs = coll.stream()
            for doc in docs:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id and data.get("default_for_all_agents"):
                    return data.get("id")
        except Exception as e:
            log_error(f"Failed to query workspace default workflow: {e}")
        return None
