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
        mode: str = "live"
    ) -> dict:
        """
        Loads Agent, resolves Workflow, runs the LangGraph agent state graph, 
        and returns structured response attributes.

        ``mode``:
          - ``"live"`` (default) — full real execution, same as production.
          - ``"simulation"``     — real agent, real tools, real connection
                                   resolution, but NO external API calls.
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
            return {"text": "I apologize, but I could not locate my agent settings.", "intent": "Error", "message": "Settings missing", "blocks": []}

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
            "timings": {
                "agent_loading_ms": int((time.time() - t0) * 1000),
            },
            "workflow_id": workflow_id,
            "workflow_nodes": workflow_nodes,
            "workflow_edges": workflow_edges,
            "current_node_id": current_node_id
        }

        # 4. Invoke LangGraph Graph
        try:
            final_state = await compiled_agent_graph.ainvoke(initial_state)
            
            raw_msg = final_state.get("ai_text") or ""
            # Format output using ResponseFormatter to get structured blocks
            from app.ai.response.response_formatter import ResponseFormatter
            t_format = time.time()
            structured = ResponseFormatter.format_response(
                message=raw_msg,
                tool_call=final_state.get("tool_call"),
                tool_result=final_state.get("tool_result"),
                tool_records=final_state.get("tool_records") or []
            )
            timings = dict(final_state.get("timings") or {})
            timings["final_response_ms"] = int((time.time() - t_format) * 1000)
            timings["total_ms"] = int((time.time() - t0) * 1000)

            res_dict = structured.model_dump()
            # Maintain backward compatibility fields
            res_dict["text"] = res_dict.get("message") or raw_msg or ""
            res_dict["intent"] = final_state.get("intent", "Inquire details")
            res_dict["confidence"] = final_state.get("confidence", 95)
            res_dict["knowledge_used"] = final_state.get("cited_sources", [])
            res_dict["memory_recalled"] = ["Prefers concise responses"] if "concise" in final_state.get("system_prompt", "").lower() else []
            res_dict["actions"] = final_state.get("actions", [])
            res_dict["status"] = final_state.get("status", "active")
            res_dict["trace_id"] = trace_id
            res_dict["mode"] = mode
            res_dict["timings"] = timings

            # Tool lifecycle events for the streaming protocol
            tool_events = []
            for rec in (final_state.get("tool_records") or []):
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

            log_info(f"[Runtime][{trace_id}] completed in status={final_state.get('status')} tool_calls={len(final_state.get('tool_records') or [])}")
            return res_dict
        except Exception as e:
            log_error(f"LangGraph runtime execution failed for agent {agent_id}", exc=e)
            err_msg = f"I encountered an issue processing your request: {str(e)}"
            return {
                "text": err_msg,
                "message": err_msg,
                "blocks": [{"type": "text", "data": {"text": err_msg}}],
                "intent": "Error",
                "confidence": 0,
                "knowledge_used": [],
                "memory_recalled": [],
                "actions": [],
                "status": "active",
                "trace_id": trace_id,
                "tool_events": []
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
