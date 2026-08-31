import time
import json
import uuid
import asyncio
from typing import AsyncGenerator, Dict, Any, List, Optional
from fastapi import HTTPException
from app.database.firestore import firestore_client
from app.database.qdrant import qdrant_client
from app.providers.manager import ProviderManager
from app.utils.logger import log_info, log_error

class ConversationService:

    # ------------------------------------------------------------------ #
    # Static helpers required by agent_graph.py finalize_node and         #
    # response_formatter.py.  These were missing and caused an            #
    # AttributeError on every single message, making every agent reply    #
    # return terminal_state="FAILED".                                     #
    # ------------------------------------------------------------------ #

    @staticmethod
    def sanitize_tool_call_text(text: str) -> str:
        """Strip any raw TOOL_CALL:{...} JSON blobs the LLM may emit verbatim."""
        import re
        return re.sub(r'TOOL_CALL:\{.*?\}', '', text or '', flags=re.DOTALL).strip()

    @staticmethod
    def _enforce_verification_gate(
        message: str,
        tool_records=None,
        tool_result=None,
        query: str = "",
    ) -> str:
        """Structural action-success gate. Delegates to app.ai.gate.enforce_action_gate.

        When no query is given (e.g. from unit tests), the message text itself
        is used to detect action intent, so success claims are correctly blocked
        even without a separate user query string.
        """
        from app.ai.gate import enforce_action_gate
        effective_query = query or message or ""
        return enforce_action_gate(message, effective_query, tool_records, tool_result)


    @staticmethod
    def build_action_state(tool_records=None):
        """Structured action-state list for the frontend. Delegates to app.ai.gate."""
        from app.ai.gate import build_action_state
        return build_action_state(tool_records)

    @staticmethod
    def _parse_tool_call(text: str):
        """Parse a legacy text-format TOOL_CALL:{...} blob into a normalized dict.

        Resolves the raw tool name through the ToolExecutor TOOL_DISPATCHER to
        return the canonical integration name and action method. Returns a dict:
          ``tool``    — integration display name (e.g. "GoogleCalendar")
          ``method``  — action method (e.g. "create_event")
          ``args``    — arguments dict
        Returns ``None`` if the text does not contain a valid TOOL_CALL blob.
        Used by providers that fall back to text-mode tool calling.
        """
        import re
        import json
        if not text:
            return None
        m = re.search(r'TOOL_CALL:\s*(\{.*\})', text, re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group(1))
        except (json.JSONDecodeError, ValueError):
            return None

        raw_tool = data.get("tool") or ""
        args = data.get("args") or {}

        # Resolve through TOOL_DISPATCHER to get integration name and action
        try:
            from app.services.tool_executor import ToolExecutor
            entry = ToolExecutor.TOOL_DISPATCHER.get(raw_tool)
            if entry:
                # entry = (integration_id, action) — but we need the display name
                # Look up in dispatcher to find a key like "GoogleCalendar.create_event"
                action = entry[1]
                # Find the display-name key with this action
                for key, val in ToolExecutor.TOOL_DISPATCHER.items():
                    if val[1] == action and val[0] == entry[0] and "." in key:
                        integration_name = key.split(".")[0]
                        if not integration_name.startswith(("calendar_", "gcal_", "gmail_", "google_")):
                            return {"tool": integration_name, "method": action, "args": args}
        except Exception:
            pass

        # Fallback: try tool_registry canonical
        try:
            from app.ai.tools import tool_registry as _tr
            resolved = _tr.resolve(raw_tool)
            if resolved:
                canonical = resolved.get("canonical", raw_tool)
                if "." in canonical:
                    _, action = canonical.split(".", 1)
                else:
                    action = data.get("method") or "execute"
                return {"tool": raw_tool, "method": action, "args": args}
        except Exception:
            pass

        return {"tool": raw_tool, "method": data.get("method") or "execute", "args": args}

    @staticmethod
    async def list_conversations(
        workspace_id: str,
        environment: str = "production",
        agent_id: Optional[str] = None,
        channel: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None
    ) -> list:
        coll = firestore_client.collection("conversations")
        docs = coll.stream()
        results = []
        target_env = (environment or "production").lower()

        for doc in docs:
            data = doc.to_dict() or {}
            if data.get("workspace_id") != workspace_id:
                continue

            doc_env = (data.get("environment") or (
                "playground" if (data.get("is_test") or data.get("channel") == "Playground" or data.get("customer") == "Playground Tester")
                else "production"
            )).lower()

            if doc_env != target_env:
                continue

            if agent_id and data.get("agent_id") != agent_id:
                continue

            if channel and data.get("channel", "").lower() != channel.lower():
                continue

            if status and data.get("status", "").lower() != status.lower():
                continue

            if search:
                s_query = search.lower()
                customer_name = (data.get("customer") or "").lower()
                agent_name = (data.get("agent_name") or "").lower()
                preview = (data.get("preview") or "").lower()
                convo_id = (data.get("id") or "").lower()
                msg_texts = " ".join([m.get("text", "").lower() for m in data.get("messages", []) if isinstance(m, dict)])

                if not (s_query in customer_name or s_query in agent_name or s_query in preview or s_query in convo_id or s_query in msg_texts):
                    continue

            # Normalize the "time" field for Pydantic schema validation
            if not data.get("time"):
                ts = data.get("created_at") or data.get("updated_at")
                if ts:
                    try:
                        import datetime
                        dt = datetime.datetime.fromtimestamp(float(ts))
                        data["time"] = dt.strftime("%I:%M %p")
                    except Exception:
                        data["time"] = "Just now"
                else:
                    data["time"] = "Just now"

            results.append(data)

        def sort_key(x):
            ts = x.get("updated_at") or x.get("created_at")
            if ts is not None:
                try:
                    return float(ts)
                except (ValueError, TypeError):
                    pass
            t_str = x.get("time")
            if t_str:
                if "just now" in str(t_str).lower():
                    return time.time()
                return 1.0
            return 0.0

        sorted_results = sorted(results, key=sort_key, reverse=True)
        return sorted_results[:limit]


    @staticmethod
    async def get_conversation(workspace_id: str, convo_id: str) -> dict:
        doc_ref = firestore_client.collection("conversations").document(convo_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Conversation {convo_id} not found.")
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to conversation resource.")
        return data

    @staticmethod
    async def create_conversation(
        workspace_id: str,
        agent_id: str,
        customer: str,
        channel: str = "Web Chat",
        is_test: bool = False,
        environment: Optional[str] = None
    ) -> dict:
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
            raise HTTPException(status_code=400, detail="Invalid agent_id.")

        if agent_data.get("workspace_id") != workspace_id:
            raise HTTPException(
                status_code=403,
                detail="Agent does not belong to the current workspace."
            )

        convo_id = f"con_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("conversations").document(convo_id)
        
        initials = "".join([part[0] for part in customer.split() if part])[:2].upper() or "CU"
        env = environment or ("playground" if is_test or channel == "Playground" else "production")
        
        convo_data = {
            "id": convo_id,
            "workspace_id": workspace_id,
            "customer": customer,
            "initials": initials,
            "channel": channel,
            "agent_id": agent_id,
            "agent_name": agent_data.get("name", "Agent"),
            "status": "active",
            "is_test": is_test,
            "environment": env,
            "human_handling": False,
            "assigned_to": None,
            "preview": "No messages yet.",
            "time": "Just now",
            "created_at": time.time(),
            "updated_at": time.time(),
            "unread": False,
            "messages": [],
            "intent": "Inquire",
            "confidence": 100,
            "knowledge_used": [],
            "memory_recalled": [],
            "actions": []
        }
        
        doc_ref.set(convo_data)
        log_info(f"Conversation {convo_id} started with agent {agent_id} in workspace {workspace_id} (env={env})")
        return convo_data

    @staticmethod
    async def take_over_conversation(workspace_id: str, convo_id: str, user_name: str = "Human Support Agent") -> dict:
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        snap = convo_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        messages = data.get("messages", [])
        system_msg = {
            "id": f"msg_{uuid.uuid4().hex[:8]}",
            "sender_type": "human",
            "text": f"Human agent {user_name} has taken over this conversation.",
            "time": time.strftime("%H:%M")
        }
        messages.append(system_msg)

        updates = {
            "status": "human_takeover",
            "human_handling": True,
            "messages": messages,
            "unread": False,
            "preview": f"Human takeover active by {user_name}"
        }
        convo_ref.update(updates)
        return (convo_ref.get()).to_dict()

    @staticmethod
    async def reopen_conversation(workspace_id: str, convo_id: str) -> dict:
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        snap = convo_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        messages = data.get("messages", [])
        system_msg = {
            "id": f"msg_{uuid.uuid4().hex[:8]}",
            "sender_type": "agent",
            "text": "AI employee has resumed response automation.",
            "time": time.strftime("%H:%M")
        }
        messages.append(system_msg)

        updates = {
            "status": "active",
            "human_handling": False,
            "messages": messages,
            "unread": False,
            "preview": "AI employee active"
        }
        convo_ref.update(updates)
        return (convo_ref.get()).to_dict()

    @staticmethod
    async def resolve_conversation(workspace_id: str, convo_id: str) -> dict:
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        snap = convo_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        convo_ref.update({"status": "resolved", "unread": False})
        return (convo_ref.get()).to_dict()

    @staticmethod
    async def assign_conversation(workspace_id: str, convo_id: str, assignee: str) -> dict:
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        snap = convo_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        convo_ref.update({"assigned_to": assignee})
        return (convo_ref.get()).to_dict()

    @classmethod
    async def post_message(
        cls,
        workspace_id: str,
        convo_id: str,
        sender_type: str,  # "customer" | "agent" | "human"
        text: str
    ) -> dict:
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        convo_snap = convo_ref.get()
        if not convo_snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        convo_data = convo_snap.to_dict()
        
        if convo_data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        current_time = time.strftime("%H:%M")
        new_message = {
            "id": msg_id,
            "sender_type": sender_type,
            "text": text,
            "time": current_time
        }
        
        messages = convo_data.get("messages", [])
        messages.append(new_message)
        
        updates = {
            "messages": messages,
            "preview": text[:60] + ("..." if len(text) > 60 else ""),
            "time": "Just now",
            "unread": (sender_type == "customer")
        }
        
        convo_ref.update(updates)
        
        agent_id = convo_data.get("agent_id")

        if sender_type == "customer":
            cls._log_analytics_event(workspace_id, "user_message", agent_id=agent_id, conversation_id=convo_id, metadata={"text": text})
        else:
            cls._log_analytics_event(workspace_id, "agent_message", agent_id=agent_id, conversation_id=convo_id, metadata={"text": text})
        
        if sender_type == "customer" and not convo_data.get("human_handling"):
            ai_reply = await cls._generate_agent_reply(workspace_id, agent_id, text, messages, convo_id)
            
            ai_msg_id = f"msg_{uuid.uuid4().hex[:8]}"
            ai_message = {
                "id": ai_msg_id,
                "sender_type": "agent",
                "text": ai_reply["text"],
                "blocks": ai_reply.get("blocks", []),
                "tool_calls": ai_reply.get("tool_calls", []),
                "time": time.strftime("%H:%M")
            }
            messages.append(ai_message)
            
            cls._log_analytics_event(workspace_id, "agent_message", agent_id=agent_id, conversation_id=convo_id, metadata={"text": ai_reply["text"]})
            
            convo_ref.update({
                "messages": messages,
                "preview": ai_reply["text"][:60] + ("..." if len(ai_reply["text"]) > 60 else ""),
                "unread": False,
                "intent": ai_reply.get("intent", "General inquiry"),
                "confidence": ai_reply.get("confidence", 95),
                "knowledge_used": ai_reply.get("knowledge_used", []),
                "memory_recalled": ai_reply.get("memory_recalled", []),
                "actions": ai_reply.get("actions", []),
                "status": ai_reply.get("status", convo_data.get("status")),
                "integration_used": ai_reply.get("integration_used"),
                "execution_status": ai_reply.get("execution_status", "completed")
            })
            
            cls._increment_agent_convo_count(agent_id)
            
        return (convo_ref.get()).to_dict()

    @classmethod
    async def stream_agent_chunks(
        cls,
        workspace_id: str,
        convo_id: str,
        text: str,
        mode: str = "live",
        heartbeat_interval: float = 10.0,
        stream_timeout: float = 180.0,
    ) -> AsyncGenerator[str, None]:
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        convo_snap = convo_ref.get()
        if not convo_snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        convo_data = convo_snap.to_dict()
        if convo_data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to conversation resource.")

        agent_id = convo_data.get("agent_id")
        agent_ref = firestore_client.collection("agents").document(agent_id)
        agent_snap = agent_ref.get()
        if not agent_snap.exists:
            yield "__ACK__:{\"status\":\"error\",\"message\":\"Agent configuration missing\"}\n"
            return
        agent_data = agent_snap.to_dict()
        if agent_data.get("workspace_id") != workspace_id:
            yield "__ACK__:{\"status\":\"error\",\"message\":\"Agent does not belong to this workspace\"}\n"
            return

        trace_id = f"trace_{uuid.uuid4().hex[:12]}"
        yield f"__ACK__:{json.dumps({'trace_id': trace_id, 'status': 'processing', 'mode': mode})}\n"
        yield f"__EVENT__:{json.dumps({'type': 'agent_started', 'agent_id': agent_id, 'agent_name': agent_data.get('name', ''), 'trace_id': trace_id, 'mode': mode})}\n"
        yield f"__EVENT__:{json.dumps({'type': 'assistant_status', 'status': 'thinking', 'trace_id': trace_id})}\n"

        current_time = time.strftime("%H:%M")
        customer_msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        new_message = {
            "id": customer_msg_id,
            "sender_type": "customer",
            "text": text,
            "time": current_time
        }
        messages = convo_data.get("messages", [])
        messages.append(new_message)

        convo_ref.update({
            "messages": messages,
            "preview": text[:60] + ("..." if len(text) > 60 else ""),
            "time": "Just now",
            "unread": True,
            "mode": mode,
        })
        cls._log_analytics_event(workspace_id, "message_sent")

        from app.ai.runtime.agent_runtime import AgentRuntime

        exec_task = asyncio.create_task(
            AgentRuntime.execute(
                workspace_id=workspace_id,
                agent_id=agent_id,
                query=text,
                history=messages,
                conversation_id=convo_id,
                trace_id=trace_id,
                mode=mode,
            )
        )
        t_exec = time.time()
        ai_reply = None
        try:
            while not exec_task.done():
                done, _ = await asyncio.wait({exec_task}, timeout=heartbeat_interval)
                if done:
                    break
                if time.time() - t_exec > stream_timeout:
                    exec_task.cancel()
                    log_error(f"[Stream][{trace_id}] stream timeout after {stream_timeout}s")
                    timeout_msg = "The agent took too long to respond. Please try again."
                    yield f"__EVENT__:{json.dumps({'type': 'assistant_message', 'trace_id': trace_id, 'content': timeout_msg})}\n"
                    yield f"__EVENT__:{json.dumps({'type': 'run_timeout', 'trace_id': trace_id, 'error_code': 'AGENT_TIMEOUT', 'message': timeout_msg})}\n"
                    return
                yield f"__EVENT__:{json.dumps({'type': 'heartbeat', 'trace_id': trace_id})}\n"
            ai_reply = exec_task.result()
        except asyncio.CancelledError:
            exec_task.cancel()
            raise
        except Exception as e:
            log_error(f"[Stream][{trace_id}] AgentRuntime execution failed", exc=e)
            ai_reply = {
                "text": "I encountered an issue processing your request.",
                "message": "I encountered an issue processing your request.",
                "blocks": [{"type": "text", "data": {"text": "I encountered an issue processing your request."}}],
                "tool_events": [],
                "timings": {},
                "knowledge_used": [],
                "execution_status": "failed",
                "terminal_state": "FAILED",
                "error_code": "AGENT_RUNTIME_ERROR",
                "action_state": [],
            }

        accumulated_text = ai_reply.get("text") or ""
        if not accumulated_text.strip():
            accumulated_text = "I wasn't able to generate a response. Please try again."

        terminal_state = ai_reply.get("terminal_state") or (
            "REAUTH_REQUIRED" if ai_reply.get("execution_status") == "reauth_required"
            else "FAILED" if ai_reply.get("execution_status") in ("failed", "timed_out", "error")
            else "COMPLETED"
        )
        execution_status = ai_reply.get("execution_status") or (
            "completed" if terminal_state == "COMPLETED" else "failed"
        )
        error_code = ai_reply.get("error_code") or ""
        integration_used = ai_reply.get("integration_used")

        try:
            stream_events = ai_reply.get("stream_events") or []
            for event in stream_events:
                yield f"__EVENT__:{json.dumps(event)}\n"
            
            tool_events = ai_reply.get("tool_events") or []
            for event in tool_events:
                yield f"__EVENT__:{json.dumps(event)}\n"
            
            timings = ai_reply.get("timings") or {}
            yield f"__EVENT__:{json.dumps({'type': 'timing', 'trace_id': trace_id, 'timings': timings})}\n"
            
            meta_payload = {
                "trace_id": trace_id,
                "mode": mode,
                "knowledge_used": ai_reply.get("knowledge_used", []),
                "blocks": ai_reply.get("blocks", []),
                "execution_status": execution_status,
                "terminal_state": terminal_state,
                "error_code": error_code,
                "integration_used": integration_used,
                "action_state": ai_reply.get("action_state", []),
                "timings": timings,
            }
            yield f"__METADATA__:{json.dumps(meta_payload)}\n"
            
            chunk_size = 24
            for idx in range(0, len(accumulated_text), chunk_size):
                yield accumulated_text[idx:idx + chunk_size] + "\n"
            yield f"__EVENT__:{json.dumps({'type': 'assistant_message', 'trace_id': trace_id, 'content': accumulated_text})}\n"

            ai_msg_id = f"msg_{uuid.uuid4().hex[:8]}"
            ai_message = {
                "id": ai_msg_id,
                "sender_type": "agent",
                "text": accumulated_text,
                "blocks": ai_reply.get("blocks", []),
                "tool_calls": ai_reply.get("tool_calls", []),
                "time": time.strftime("%H:%M"),
            }
            messages.append(ai_message)

            convo_ref.update({
                "messages": messages,
                "preview": accumulated_text[:60] + ("..." if len(accumulated_text) > 60 else ""),
                "unread": False,
                "intent": ai_reply.get("intent", "Inquire details"),
                "confidence": ai_reply.get("confidence", 95),
                "knowledge_used": ai_reply.get("knowledge_used", []),
                "actions": ai_reply.get("actions", []),
                "status": ai_reply.get("status", convo_data.get("status", "active")),
                "integration_used": integration_used,
                "execution_status": execution_status,
                "action_state": ai_reply.get("action_state", []),
                "mode": mode,
            })

            cls._increment_agent_convo_count(agent_id)
            cls._persist_trace(trace_id, workspace_id, agent_id, convo_id, mode, ai_reply)
        except Exception as e:
            log_error(f"[Stream][{trace_id}] emit/persist failed", exc=e)
            yield f"__EVENT__:{json.dumps({'type': 'run_failed', 'trace_id': trace_id, 'error_code': 'STREAM_INTERNAL_ERROR', 'message': 'Something went wrong completing this request. Please try again.'})}\n"
            return

        if terminal_state == "REAUTH_REQUIRED":
            yield f"__EVENT__:{json.dumps({'type': 'reauth_required', 'trace_id': trace_id, 'integration': integration_used or '', 'message': accumulated_text})}\n"
        elif terminal_state == "TIMED_OUT":
            yield f"__EVENT__:{json.dumps({'type': 'run_timeout', 'trace_id': trace_id, 'error_code': 'AGENT_TIMEOUT', 'message': accumulated_text})}\n"
        elif execution_status == "failed":
            yield f"__EVENT__:{json.dumps({'type': 'run_failed', 'trace_id': trace_id, 'error_code': error_code or 'AGENT_ERROR', 'message': accumulated_text})}\n"
        else:
            yield f"__EVENT__:{json.dumps({'type': 'run_completed', 'trace_id': trace_id, 'execution_status': execution_status, 'terminal_state': terminal_state})}\n"

    @staticmethod
    def _persist_trace(trace_id: str, workspace_id: str, agent_id: str, conversation_id: str, mode: str, ai_reply: dict):
        try:
            trace_doc = {
                "id": trace_id,
                "workspace_id": workspace_id,
                "agent_id": agent_id,
                "conversation_id": conversation_id,
                "mode": mode,
                "request_start": time.time(),
                "execution_status": ai_reply.get("execution_status", "completed"),
                "terminal_state": ai_reply.get("terminal_state", "COMPLETED"),
                "error_code": ai_reply.get("error_code", ""),
                "status": ai_reply.get("status", "active"),
                "intent": ai_reply.get("intent", ""),
                "timings": ai_reply.get("timings") or {},
                "knowledge_used": ai_reply.get("knowledge_used", [])[:10],
                "actions": ai_reply.get("actions", [])[:20],
                "action_state": ai_reply.get("action_state", []),
                "tool_events": [
                    {k: v for k, v in e.items() if k not in ("args", "data")}
                    for e in (ai_reply.get("tool_events") or [])
                ],
            }
            firestore_client.collection("traces").document(trace_id).set(trace_doc)
        except Exception as e:
            log_error(f"Failed to persist trace {trace_id}", exc=e)

    @classmethod
    async def _generate_agent_reply(
        cls,
        workspace_id: str,
        agent_id: str,
        query: str,
        history: List[dict],
        conversation_id: str = "unknown_convo"
    ) -> dict:
        from app.ai.runtime.agent_runtime import AgentRuntime
        return await AgentRuntime.execute(
            workspace_id=workspace_id,
            agent_id=agent_id,
            query=query,
            history=history,
            conversation_id=conversation_id
        )

    @staticmethod
    def _log_analytics_event(workspace_id: str, event_type: str, agent_id: Optional[str] = None, conversation_id: Optional[str] = None, metadata: Optional[dict] = None):
        try:
            event_id = f"evt_{uuid.uuid4().hex[:8]}"
            firestore_client.collection("analytics_events").document(event_id).set({
                "id": event_id,
                "workspace_id": workspace_id,
                "event_type": event_type,
                "agent_id": agent_id,
                "conversation_id": conversation_id,
                "metadata": metadata or {},
                "timestamp": time.time()
            })
        except Exception as e:
            log_error(f"Failed to log analytics event: {e}")

    @staticmethod
    def _increment_agent_convo_count(agent_id: str):
        try:
            agent_ref = firestore_client.collection("agents").document(agent_id)
            agent_snap = agent_ref.get()
            if agent_snap.exists:
                data = agent_snap.to_dict()
                cnt = data.get("conversations_today", 0) + 1
                agent_ref.update({"conversations_today": cnt})
        except Exception as e:
            log_error(f"Failed to increment agent convo count: {e}")
