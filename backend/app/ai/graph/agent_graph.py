from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from app.ai.retrieval.retriever import AIRetriever
from app.ai.memory.memory_service import MemoryService
from app.ai.tools.tool_registry import ToolRegistry
from app.providers.manager import ProviderManager
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error


class AgentState(TypedDict):
    workspace_id: str
    agent_id: str
    user_id: str
    conversation_id: str
    agent_data: Dict[str, Any]
    user_query: str
    history: List[Dict[str, Any]]
    context: str
    cited_sources: List[str]
    system_prompt: str
    prompt: str
    loop_count: int
    actions: List[str]
    ai_text: str
    tool_call: Optional[Dict[str, Any]]
    tool_result: Optional[Dict[str, Any]]
    tool_calls: List[Dict[str, Any]]
    tool_records: List[Dict[str, Any]]
    status: str
    intent: str
    confidence: int
    context_packet: Optional[Dict[str, Any]]
    trace_id: str
    mode: str
    timings: Dict[str, Any]
    action_state: List[Dict[str, Any]]
    # Workflow Execution State
    workflow_id: Optional[str]
    workflow_nodes: List[Dict[str, Any]]
    workflow_edges: List[Dict[str, Any]]
    current_node_id: Optional[str]


# -------------------------------------------------------------
# Nodes for Standard Execution Graph
# -------------------------------------------------------------

async def retrieve_context_node(state: AgentState) -> Dict[str, Any]:
    """Retrieves document context using lightweight Context Engine + Dynamic Tool Registry."""
    import time
    from app.ai.context.engine import ContextEngine
    from app.ai.integration.dynamic_registry import DynamicToolRegistry
    from app.ai.gate import is_action_request

    t_start = time.time()

    # Compile dynamic tool instructions only for connected, permitted tools.
    # Lightweight: no network validation of tokens at request time.
    agent_tools = state["agent_data"].get("tools") or []
    tools_instructions, ready_ids = await DynamicToolRegistry.get_available_tools_prompt(
        workspace_id=state["workspace_id"],
        agent_id=state["agent_id"],
        agent_tools=agent_tools
    )

    # Action requests do NOT need RAG. A "schedule a calendar event" query must
    # not load unrelated knowledge PDFs (e.g. a resume) — tool execution is the
    # source of truth. Skipping retrieval avoids the embedding call, the vector
    # search, and a bloated LLM prompt (major latency + hallucination driver).
    skip_retrieval = is_action_request(state["user_query"])
    config_override = {"rag_enabled": not skip_retrieval}
    packet = await ContextEngine.build(
        workspace_id=state["workspace_id"],
        agent_id=state["agent_id"],
        agent_data=state["agent_data"],
        query=state["user_query"],
        history=state["history"],
        config_override=config_override
    )

    # Prepend dynamic tool prompt
    if tools_instructions:
        packet.tool_prompt = tools_instructions + (packet.tool_prompt or "")

    packet_dict = packet.model_dump()
    packet_dict["ready_tools"] = ready_ids

    timings = dict(state.get("timings") or {})
    timings["tools_loading_ms"] = int((time.time() - t_start) * 1000)

    if skip_retrieval:
        log_info(
            f"[Context] Skipping RAG retrieval for action request "
            f"agent_id={state['agent_id']} workspace_id={state['workspace_id']} "
            f"ready_tools={len(ready_ids)}"
        )

    return {
        "context": packet.rag_context,
        "cited_sources": packet.cited_sources,
        "context_packet": packet_dict,
        "timings": timings,
    }


async def generate_response_node(state: AgentState) -> Dict[str, Any]:
    """Generates the next turn using structured tool calling (native functionCall)."""
    packet_data = state.get("context_packet")
    ready_ids = []
    if packet_data:
        from app.ai.context.models import ContextPacket
        packet = ContextPacket(**packet_data)
        system_prompt = packet.system_prompt
        if packet.tool_prompt:
            system_prompt += packet.tool_prompt
        ready_ids = packet_data.get("ready_tools", [])

        prompt = f"Conversational History:\n{packet.conversation_history}\n"
        if packet.memory_context:
            prompt += f"{packet.memory_context}\n\n"
        if packet.rag_context:
            prompt += f"Context documents/policies:\n{packet.rag_context}\n\n"
    else:
        history_summary = MemoryService.get_short_term_context(state["history"])
        tools_instructions = ""
        agent_tools = state["agent_data"].get("tools") or []
        from app.ai.integration.dynamic_registry import DynamicToolRegistry
        tools_instructions, ready_ids = await DynamicToolRegistry.get_available_tools_prompt(
            state["workspace_id"], state["agent_id"], agent_tools
        )
        overrides = state["agent_data"].get("overrides") or {}
        system_prompt = overrides.get("system_prompt", "") or f"You are {state['agent_data'].get('name')}. Purpose: {state['agent_data'].get('purpose')}."
        system_prompt += tools_instructions
        prompt = f"Conversational History:\n{history_summary}\nContext documents/policies:\n{state['context']}\n\n"

    import datetime
    from zoneinfo import ZoneInfo
    now_tz = datetime.datetime.now(ZoneInfo("Asia/Kolkata"))
    dt_str = now_tz.strftime("%A, %B %d, %Y %I:%M %p %Z")
    system_prompt += f"\n\n[CURRENT DATETIME CONTEXT]\nCurrent Date & Time: {dt_str}\nTimezone: Asia/Kolkata\n"

    system_prompt += (
        "\n[VERIFICATION RULES]\n"
        "- Never claim an action (scheduling a meeting, sending an email, etc.) was completed unless the system returns a verified TOOL_RESULT with a real resource ID.\n"
        "- If you need to schedule, send, search, or modify a connected integration, emit a function call. Do not describe the action as already done.\n"
        "- If the requested action has no available tool or the integration is not connected, state clearly that the action could not be completed.\n\n"
        "Formatting Guidelines:\n"
        "- Never reply with a single dense paragraph.\n"
        "- Break your response into short, readable paragraphs (maximum 2-3 sentences each).\n"
        "- Use bullet points or numbered lists where appropriate.\n"
        "- Use bold styling (**text**) to highlight key names, metrics, status values, dates, or prices.\n"
        "- Keep your response clear, organized, and scannable."
    )

    # Simulation mode is explicit: the model is told tool results are simulated
    # so it never phrases them as real external actions.
    if (state.get("mode") or "live") == "simulation":
        system_prompt += (
            "\n\n[MODE: SIMULATION]\n"
            "You are running in SIMULATION mode. Tool calls are resolved and "
            "validated against the real connection, but NO external API is called "
            "and NO real external action occurs. When a tool result comes back, "
            "clearly state it was simulated and do not claim a real action happened."
        )

    if state.get("tool_records"):
        import json
        prompt += f"TOOL_RESULT: {json.dumps(state['tool_records'])}\n"
    prompt += f"Customer: {state['user_query']}\nResponse:"

    agent_override = dict(state["agent_data"].get("overrides") or {})
    if "system_prompt" in agent_override:
        del agent_override["system_prompt"]

    import time
    start_time = time.time()

    from app.ai.integration.dynamic_registry import DynamicToolRegistry
    functions_schema = DynamicToolRegistry.get_tool_schemas(ready_ids) if ready_ids else None

    # Tool-binding verification (Requirement 3): log exactly what the LLM
    # instance receives so a tool binding break is visible in the logs.
    bound_tools = [s.get("name", "") for s in (functions_schema or [])]
    log_info(
        f"[Tool Binding] agent_id={state['agent_id']} workspace_id={state['workspace_id']} "
        f"mode={state.get('mode') or 'live'} tool_count={len(bound_tools)} "
        f"tool_names={bound_tools}"
    )

    structured = await ProviderManager.generate_structured(
        workspace_id=state["workspace_id"],
        prompt=prompt,
        system_prompt=system_prompt,
        agent_override=agent_override,
        functions=functions_schema
    )

    duration_ms = int((time.time() - start_time) * 1000)

    tool_calls = []
    for tc in (getattr(structured, "tool_calls", None) or []):
        tool_calls.append(tc.model_dump() if hasattr(tc, "model_dump") else dict(tc))

    # Track token usage statistics to Firestore
    try:
        from app.ai.context.budget import ContextBudgetManager
        _, provider_settings = await ProviderManager.get_active_provider(state["workspace_id"])
        overrides = state["agent_data"].get("overrides") or {}
        model_name = overrides.get("model") or provider_settings.get("model", "gemini-3.5-flash")
        provider_name = provider_settings.get("provider", "gemini")

        usage_ref = firestore_client.collection("token_usage").document()
        sys_tokens = ContextBudgetManager.estimate_tokens(system_prompt)
        prompt_tokens = ContextBudgetManager.estimate_tokens(prompt)
        output_tokens = ContextBudgetManager.estimate_tokens(structured.text)

        convo_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("conversation_history", "")) if packet_data else prompt_tokens
        mem_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("memory_context", "")) if packet_data else 0
        rag_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("rag_context", "")) if packet_data else 0
        tool_def_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("tool_prompt", "")) if packet_data else 0
        tool_res_tokens = ContextBudgetManager.estimate_tokens(json.dumps(state.get("tool_records", {}))) if state.get("tool_records") else 0

        usage_data = {
            "id": usage_ref.id,
            "workspace_id": state["workspace_id"],
            "agent_id": state["agent_id"],
            "conversation_id": state["conversation_id"],
            "model": model_name,
            "provider": provider_name,
            "system_prompt_tokens": sys_tokens,
            "conversation_tokens": convo_tokens,
            "memory_tokens": mem_tokens,
            "rag_tokens": rag_tokens,
            "tool_definition_tokens": tool_def_tokens,
            "tool_result_tokens": tool_res_tokens,
            "input_tokens": sys_tokens + prompt_tokens,
            "output_tokens": output_tokens,
            "total_tokens": sys_tokens + prompt_tokens + output_tokens,
            "latency_ms": duration_ms,
            "timestamp": time.time()
        }
        usage_ref.set(usage_data)
    except Exception as e:
        log_error("Failed to record token usage to Firestore", exc=e)

    timings = dict(state.get("timings") or {})
    timings["llm_ms"] = duration_ms

    return {
        "ai_text": structured.text,
        "tool_calls": tool_calls,
        "loop_count": state["loop_count"] + 1,
        "prompt": prompt,
        "system_prompt": system_prompt,
        "timings": timings,
    }


async def execute_tool_node(state: AgentState) -> Dict[str, Any]:
    """Executes structured tool calls via the verified ToolExecutor."""
    from app.services.tool_executor import ToolExecutor
    from app.ai.tools.models import ToolCall
    import time

    t_start = time.time()
    tool_calls = state.get("tool_calls") or []
    if not tool_calls:
        return {}

    records = []
    results = []
    trace_id = state.get("trace_id") or ""
    mode = state.get("mode") or "live"
    for tc_dict in tool_calls:
        tc = ToolCall(**tc_dict) if isinstance(tc_dict, dict) else tc_dict
        # Make tool-call IDs unique per request (LLM may emit generic ids like "call_0")
        if not tc.id or tc.id.startswith("call_") or tc.id.startswith("tc"):
            tc.id = f"{trace_id or 'req'}_{tc.id or 'tc'}"
        log_info(
            f"[Tool Execution Started] trace_id={trace_id} mode={mode} "
            f"selected_tool_name={tc.name} tool_arguments={tc.args}"
        )
        record = await ToolExecutor.execute_tool_call(
            workspace_id=state["workspace_id"],
            agent_id=state["agent_id"],
            tool_call=tc,
            conversation_id=state["conversation_id"],
            user_id=state["user_id"],
            mode=mode,
        )
        records.append(record.to_dict())
        results.append(record.to_user_payload())
        log_info(
            f"[Tool Execution Completed] trace_id={trace_id} "
            f"selected_tool_name={tc.name} status={record.status} simulated={record.simulated} "
            f"error_code={record.error_code} external_resource_id={record.external_resource_id} duration_ms={record.duration_ms}"
        )

        # Record issue to Firestore if a real (non-simulated) tool execution failed
        if record.status == "FAILED" and not record.simulated:
            try:
                issue_ref = firestore_client.collection("issues").document()
                issue_ref.set({
                    "id": issue_ref.id,
                    "workspace_id": state["workspace_id"],
                    "agent_id": state["agent_id"],
                    "agent_name": state["agent_data"].get("name", "Agent"),
                    "title": f"{tc.name} Action Failed: {record.error_code or 'ERROR'}",
                    "severity": "high" if record.error_code in ["REAUTH_REQUIRED", "TOKEN_EXPIRED", "TOKEN_REFRESH_FAILED"] else "medium",
                    "status": "open",
                    "integration": record.integration_id,
                    "occurrences": 1,
                    "first_detected": time.time(),
                    "last_detected": time.time(),
                    "error_details": record.message,
                    "timestamp": time.time()
                })
            except Exception as err:
                log_error("Failed to log issue to Firestore", exc=err)

    # Build deterministic final message from verified results.
    # No second LLM call: verified results are authoritative and faster.
    ai_text = _build_result_message(results)

    actions = list(state.get("actions", []))
    for rec in records:
        actions.append(f"{rec.get('tool')}: {rec.get('action')} -> {rec.get('status')}")

    timings = dict(state.get("timings") or {})
    timings["tool_execution_ms"] = int((time.time() - t_start) * 1000)

    return {
        "ai_text": ai_text,
        "tool_result": results[0] if results else None,
        "tool_records": records,
        "tool_calls": [],
        "actions": actions,
        "timings": timings,
    }


def _build_result_message(results: List[Dict[str, Any]]) -> str:
    """Deterministic user-facing message from verified tool execution records."""
    if not results:
        return ""
    parts = []
    for res in results:
        status = res.get("status")
        simulated = bool(res.get("simulated"))
        if simulated:
            action = res.get("action") or "action"
            parts.append(
                f"[Simulation] The {action} was resolved but NOT executed — "
                "no real external action occurred."
            )
            continue
        if status == "SUCCEEDED":
            tool = res.get("tool") or ""
            if "create_event" in (res.get("action") or "") or "calendar" in str(tool).lower():
                title = (res.get("data") or {}).get("title") or "your meeting"
                start = (res.get("data") or {}).get("start_time") or ""
                parts.append(
                    f"Done — I've scheduled **{title}**"
                    + (f" for {start}." if start else ".")
                )
            elif "send_email" in (res.get("action") or "") or "gmail" in str(tool).lower():
                parts.append("Done — I've sent the email.")
            elif "send_message" in (res.get("action") or "") or "slack" in str(tool).lower():
                parts.append("Done — I've posted the message to Slack.")
            else:
                parts.append("Action completed successfully.")
        else:
            message = res.get("message") or "The action could not be completed."
            parts.append(f"I couldn't complete the action because: {message}")
    return "\n".join(parts)


async def finalize_node(state: AgentState) -> Dict[str, Any]:
    """Verification gate + sanitization + intent classification."""
    from app.services.conversation_service import ConversationService
    ai_text = ConversationService.sanitize_tool_call_text(state.get("ai_text", ""))

    # Verification gate: never pass through a success claim without a verified
    # result. The query is passed so the structural action gate applies even
    # when the model phrases its success claim in an unexpected way.
    ai_text = ConversationService._enforce_verification_gate(
        ai_text,
        tool_records=state.get("tool_records") or [],
        tool_result=state.get("tool_result"),
        query=state.get("user_query", ""),
    )

    # Structured action state for the frontend (Requirement 31).
    action_state = ConversationService.build_action_state(state.get("tool_records") or [])

    # Query lower for classification
    query_lower = state["user_query"].lower()
    intent = "Inquire details"
    status = state.get("status", "active")

    if "appointment" in query_lower or "schedule" in query_lower or "book" in query_lower or "meet" in query_lower:
        intent = "Book Appointment / Schedule Meeting"
    elif "refund" in query_lower or "cancel" in query_lower or "charge" in query_lower:
        intent = "Refund / Cancellation"
        if "angry" in query_lower or "terrible" in query_lower:
            status = "escalated"
    elif "price" in query_lower or "cost" in query_lower or "discount" in query_lower:
        intent = "Pricing Question"
    elif "product" in query_lower or "inventory" in query_lower or "order" in query_lower or "shipping" in query_lower:
        intent = "Shopify Order / Commerce"

    return {"ai_text": ai_text, "intent": intent, "status": status, "action_state": action_state}


def should_execute_tool(state: AgentState) -> str:
    """Decides if we should run a tool or finalize generation."""
    if (state.get("tool_calls") or []) and state["loop_count"] < 3:
        return "execute_tool"
    return "finalize"


# -------------------------------------------------------------
# Nodes for Workflow-Driven Execution Graph
# -------------------------------------------------------------

async def execute_workflow_node(state: AgentState) -> Dict[str, Any]:
    """Runs a single workflow node step, executing type-specific behaviors."""
    current_id = state["current_node_id"]
    nodes = state["workflow_nodes"]
    edges = state["workflow_edges"]

    node = next((n for n in nodes if n["id"] == current_id), None)
    if not node:
        return {"current_node_id": None}

    ntype = node.get("type")
    nlabel = node.get("label")
    ndesc = node.get("desc", "")
    actions = list(state.get("actions", []))
    actions.append(f"Workflow: {nlabel} ({ntype}) executed")

    # Initialize updates dict
    updates = {"actions": actions}

    # 1. Type specific logic
    if ntype == "knowledge":
        # Run retrieval and update context
        context_str, cited = await AIRetriever.retrieve_context(
            state["workspace_id"], state["agent_data"], state["user_query"]
        )
        updates["context"] = state.get("context", "") + "\n\n" + context_str
        updates["cited_sources"] = list(set(state.get("cited_sources", []) + cited))
    elif ntype in ["booking", "email", "crm", "calendar", "api", "payment"]:
        # Run corresponding tool/API logic. Only registered tools may execute.
        tool_name = node.get("tool") or ntype
        fallback = node.get("fallback", "")
        method = "execute"
        if ntype == "booking" or ntype == "calendar":
            method = "create_event" if "create" in ndesc.lower() else "list_events"
        elif ntype == "email":
            method = "send_email"
        elif ntype == "crm":
            method = "get_order" if "order" in ndesc.lower() else "list_products"

        from app.ai.tools import tool_registry
        resolved = tool_registry.resolve(tool_name, method)
        if not resolved:
            actions.append(f"Workflow tool {tool_name}.{method} is not registered — skipped (only registered tools may execute).")
        else:
            result = await ToolRegistry.execute_tool(state["workspace_id"], tool_name, method, {})
            if isinstance(result, dict) and result.get("status") == "FAILED" and fallback:
                actions.append(f"Tool {tool_name} failed. Falling back to: {fallback}")
            updates["tool_result"] = result
    elif ntype == "escalation" or ntype == "human":
        updates["status"] = "escalated"
    elif ntype == "intent":
        updates["intent"] = nlabel

    # Find next node based on edges
    next_edge = next((e for e in edges if e["source"] == current_id), None)
    if next_edge:
        updates["current_node_id"] = next_edge["target"]
    else:
        updates["current_node_id"] = None

    return updates


def should_continue_workflow(state: AgentState) -> str:
    """Decides whether to execute next workflow node or generate final response."""
    if state.get("current_node_id"):
        return "workflow_step"
    return "generate_response"


# -------------------------------------------------------------
# Graph Construction
# -------------------------------------------------------------

def build_agent_graph() -> StateGraph:
    workflow = StateGraph(AgentState)

    # Define standard nodes
    workflow.add_node("retrieve_context", retrieve_context_node)
    workflow.add_node("generate_response", generate_response_node)
    workflow.add_node("execute_tool", execute_tool_node)
    workflow.add_node("finalize", finalize_node)

    # Define workflow nodes
    workflow.add_node("workflow_step", execute_workflow_node)

    # Setup routing helper based on workflow status
    def route_start(state: AgentState) -> str:
        from app.ai.gate import is_action_request
        # Direct action/tool requests ALWAYS take the standard tool path so the
        # request is handled by the real tool pipeline. An unrelated workflow
        # (e.g. "User Signup -> Send Welcome Email") must not hijack
        # "schedule a calendar event" and inject its own tool results into the
        # response gate (which could validate an unrelated success claim).
        if is_action_request(state.get("user_query", "")):
            return "retrieve_context"
        if state.get("workflow_id") and state.get("current_node_id"):
            return "workflow_step"
        return "retrieve_context"

    workflow.set_conditional_entry_point(
        route_start,
        {
            "workflow_step": "workflow_step",
            "retrieve_context": "retrieve_context"
        }
    )

    # Standard Flow edges
    workflow.add_edge("retrieve_context", "generate_response")

    workflow.add_conditional_edges(
        "generate_response",
        should_execute_tool,
        {
            "execute_tool": "execute_tool",
            "finalize": "finalize"
        }
    )

    # execute_tool -> finalize directly. Verified results produce the final
    # message deterministically (no second LLM round trip).
    workflow.add_edge("execute_tool", "finalize")
    workflow.add_edge("finalize", END)

    # Workflow execution edges
    workflow.add_conditional_edges(
        "workflow_step",
        should_continue_workflow,
        {
            "workflow_step": "workflow_step",
            "generate_response": "generate_response"
        }
    )

    return workflow.compile()


# Single compiled instance
compiled_agent_graph = build_agent_graph()