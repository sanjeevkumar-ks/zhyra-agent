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
    status: str
    intent: str
    confidence: int
    context_packet: Optional[Dict[str, Any]]
    # Workflow Execution State
    workflow_id: Optional[str]
    workflow_nodes: List[Dict[str, Any]]
    workflow_edges: List[Dict[str, Any]]
    current_node_id: Optional[str]

# -------------------------------------------------------------
# Nodes for Standard Execution Graph
# -------------------------------------------------------------

async def retrieve_context_node(state: AgentState) -> Dict[str, Any]:
    """Retrieves document context from knowledge base using optimized Context Engine and Dynamic Tool Registry."""
    from app.ai.context.engine import ContextEngine
    from app.ai.integration.dynamic_registry import DynamicToolRegistry
    
    # Compile dynamic tool instructions only for connected, permitted, and ready tools
    agent_tools = state["agent_data"].get("tools") or []
    tools_instructions, ready_tools = await DynamicToolRegistry.get_available_tools_prompt(
        workspace_id=state["workspace_id"],
        agent_id=state["agent_id"],
        agent_tools=agent_tools
    )
    
    packet = await ContextEngine.build(
        workspace_id=state["workspace_id"],
        agent_id=state["agent_id"],
        agent_data=state["agent_data"],
        query=state["user_query"],
        history=state["history"]
    )
    
    # Prepend dynamic tool prompt
    if tools_instructions:
        packet.tool_prompt = tools_instructions + (packet.tool_prompt or "")

    packet_dict = packet.model_dump()
    packet_dict["ready_tools"] = ready_tools

    return {
        "context": packet.rag_context,
        "cited_sources": packet.cited_sources,
        "context_packet": packet_dict
    }

async def generate_response_node(state: AgentState) -> Dict[str, Any]:
    """Generates next response turn using ProviderManager and tracks token usage."""
    packet_data = state.get("context_packet")
    ready_tools = []
    if packet_data:
        from app.ai.context.models import ContextPacket
        packet = ContextPacket(**packet_data)
        system_prompt = packet.system_prompt
        if packet.tool_prompt:
            system_prompt += packet.tool_prompt
        ready_tools = packet_data.get("ready_tools", [])
        
        prompt = f"Conversational History:\n{packet.conversation_history}\n"
        if packet.memory_context:
            prompt += f"{packet.memory_context}\n\n"
        if packet.rag_context:
            prompt += f"Context documents/policies:\n{packet.rag_context}\n\n"
    else:
        history_summary = MemoryService.get_short_term_context(state["history"])
        tools_instructions = ""
        agent_tools = state["agent_data"].get("tools") or []
        from app.services.conversation_service import ConversationService
        tools_instructions = await ConversationService._get_agent_tools_prompt(
            state["workspace_id"], agent_tools
        )
        overrides = state["agent_data"].get("overrides") or {}
        system_prompt = overrides.get("system_prompt", "") or f"You are {state['agent_data'].get('name')}. Purpose: {state['agent_data'].get('purpose')}."
        system_prompt += tools_instructions
        prompt = f"Conversational History:\n{history_summary}\nContext documents/policies:\n{state['context']}\n\n"

    system_prompt += (
        "\n\nFormatting Guidelines:\n"
        "- Never reply with a single dense paragraph.\n"
        "- Break your response into short, readable paragraphs (maximum 2-3 sentences each).\n"
        "- Use bullet points or numbered lists where appropriate to list details, steps, or features.\n"
        "- Use bold styling (**text**) to highlight key names, metrics, status values, dates, or prices.\n"
        "- Keep your response clear, organized, and scannable."
    )

    if state.get("tool_result"):
        import json
        prompt += f"TOOL_RESULT: {json.dumps(state['tool_result'])}\n"
    prompt += f"Customer: {state['user_query']}\nResponse:"

    agent_override = dict(state["agent_data"].get("overrides") or {})
    if "system_prompt" in agent_override:
        del agent_override["system_prompt"]

    import time
    start_time = time.time()

    from app.ai.integration.dynamic_registry import DynamicToolRegistry
    functions_schema = DynamicToolRegistry.get_tool_schemas(ready_tools) if ready_tools else None

    ai_text = await ProviderManager.generate_response(
        workspace_id=state["workspace_id"],
        prompt=prompt,
        system_prompt=system_prompt,
        agent_override=agent_override,
        functions=functions_schema
    )

    duration_ms = int((time.time() - start_time) * 1000)

    # Track / log token usage statistics to Firestore
    from app.ai.context.budget import ContextBudgetManager
    _, provider_settings = await ProviderManager.get_active_provider(state["workspace_id"])
    overrides = state["agent_data"].get("overrides") or {}
    model_name = overrides.get("model") or provider_settings.get("model", "gemini-3.5-flash")
    provider_name = provider_settings.get("provider", "gemini")

    safe_ai_text = ai_text or ""
    from app.services.conversation_service import ConversationService
    tool_call = ConversationService._parse_tool_call(safe_ai_text)

    try:
        from app.database.firestore import firestore_client
        usage_ref = firestore_client.collection("token_usage").document()
        
        sys_tokens = ContextBudgetManager.estimate_tokens(system_prompt)
        prompt_tokens = ContextBudgetManager.estimate_tokens(prompt)
        output_tokens = ContextBudgetManager.estimate_tokens(safe_ai_text)
        
        convo_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("conversation_history", "")) if packet_data else prompt_tokens
        mem_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("memory_context", "")) if packet_data else 0
        rag_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("rag_context", "")) if packet_data else 0
        tool_def_tokens = ContextBudgetManager.estimate_tokens(packet_data.get("tool_prompt", "")) if packet_data else 0
        tool_res_tokens = ContextBudgetManager.estimate_tokens(json.dumps(state.get("tool_result", {}))) if state.get("tool_result") else 0

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

    return {
        "ai_text": ai_text,
        "tool_call": tool_call,
        "loop_count": state["loop_count"] + 1,
        "prompt": prompt,
        "system_prompt": system_prompt
    }

async def execute_tool_node(state: AgentState) -> Dict[str, Any]:
    """Executes a tool call after running preflight validation checks, returning a normalized outcome."""
    tool_call = state["tool_call"]
    if not tool_call:
        return {}
        
    tool_name = tool_call.get("tool", "")
    method_name = tool_call.get("method", "")
    args = tool_call.get("args", {})
    
    # Handle function_name patterns like calendar_create_event or GoogleCalendar.create_event
    if "." in tool_name:
        parts = tool_name.split(".", 1)
        tool_name = parts[0]
        method_name = parts[1]
    elif "_" in tool_name and not method_name:
        if tool_name.startswith("calendar_"):
            method_name = tool_name.replace("calendar_", "")
            tool_name = "GoogleCalendar"
        elif tool_name.startswith("gmail_"):
            method_name = tool_name.replace("gmail_", "")
            tool_name = "Gmail"
        elif tool_name.startswith("gdrive_"):
            method_name = tool_name.replace("gdrive_", "")
            tool_name = "GoogleDrive"
        elif tool_name.startswith("slack_"):
            method_name = tool_name.replace("slack_", "")
            tool_name = "Slack"
        elif tool_name.startswith("hubspot_"):
            method_name = tool_name.replace("hubspot_", "")
            tool_name = "HubSpot"
        elif tool_name.startswith("shopify_"):
            method_name = tool_name.replace("shopify_", "")
            tool_name = "Shopify"

    log_info(f"[Tool Execution Started] workspace_id={state['workspace_id']} agent_id={state['agent_id']} selected_tool_name={tool_name} method_name={method_name} tool_arguments={args}")

    # 1. Map tool name to integration ID
    integration_id = tool_name
    tool_name_lower = tool_name.lower()
    tool_to_id = {
        "googlecalendar": "int_gcal", "calendar": "int_gcal", "gcal": "int_gcal", "event": "int_gcal",
        "gmail": "int_gmail", "email": "int_gmail",
        "whatsapp": "int_whatsapp",
        "googledrive": "int_gdrive", "drive": "int_gdrive", "file": "int_gdrive",
        "hubspot": "int_hubspot", "crm": "int_hubspot",
        "razorpay": "int_razorpay",
        "shopify": "int_shopify", "store": "int_shopify",
        "googlemeet": "int_gmeet", "meet": "int_gmeet",
        "slack": "int_slack",
        "googlemaps": "int_google_maps", "maps": "int_google_maps",
        "elevenlabs": "int_elevenlabs",
        "firebase": "int_fcm", "fcm": "int_fcm",
        "customapi": "int_rest_api", "restapi": "int_rest_api"
    }
    for key, val in tool_to_id.items():
        if key in tool_name_lower or key in method_name.lower():
            integration_id = val
            break

    # 2. Run Preflight Check
    from app.ai.integration.preflight import IntegrationPreflight
    from app.ai.integration.normalizer import ToolResultNormalizer

    preflight = await IntegrationPreflight.check(state["workspace_id"], state["agent_id"], integration_id)
    
    if preflight.status != "READY":
        log_info(f"[Tool Execution Preflight Blocked] integration_name={integration_id} integration_status={preflight.status} message={preflight.message}")
        normalized_result = ToolResultNormalizer.normalize_error(
            tool_name, method_name, preflight.status, preflight.message
        )
    else:
        # 3. Execute Tool via Registry
        try:
            result = await ToolRegistry.execute_tool(state["workspace_id"], tool_name, method_name, args)
            log_info(f"[Tool Execution Completed] integration_name={integration_id} integration_status=READY selected_tool_name={tool_name} method_name={method_name}")
            
            # If the provider returned a dictionary error/result directly
            if isinstance(result, dict):
                normalized_result = result
            else:
                normalized_result = ToolResultNormalizer.normalize_response(tool_name, method_name, result)
        except Exception as e:
            log_error(f"[Tool Execution Failed] selected_tool_name={tool_name} method_name={method_name}", exc=e)
            normalized_result = ToolResultNormalizer.normalize_error(
                tool_name, method_name, "PROVIDER_ERROR", str(e)
            )

    actions = list(state.get("actions", []))
    actions.append(f"{tool_name}: {method_name} called")
    
    return {
        "tool_result": normalized_result,
        "actions": actions,
        "tool_call": None
    }

def should_execute_tool(state: AgentState) -> str:
    """Decides if we should run a tool or finalize generation."""
    if state.get("tool_call") and state["loop_count"] < 3:
        return "execute_tool"
    return "finalize"

async def finalize_node(state: AgentState) -> Dict[str, Any]:
    """Cleans up raw tool block text and classifies final response intent."""
    ai_text = state["ai_text"]
    if "TOOL_CALL:" in ai_text:
        lines = [l for l in ai_text.split("\n") if not l.strip().startswith("TOOL_CALL:")]
        ai_text = "\n".join(lines).strip()

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

    return {"ai_text": ai_text, "intent": intent, "status": status}

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
        # Run corresponding tool/API logic
        tool_name = node.get("tool") or ntype
        fallback = node.get("fallback", "")
        # Run a simple execution on the registered tool
        method = "execute"
        if ntype == "booking" or ntype == "calendar":
            method = "create_event" if "create" in ndesc.lower() else "list_events"
        elif ntype == "email":
            method = "send_email"
        elif ntype == "crm":
            method = "get_order" if "order" in ndesc.lower() else "list_products"
            
        result = await ToolRegistry.execute_tool(state["workspace_id"], tool_name, method, {})
        if "Error" in result and fallback:
            actions.append(f"Tool {tool_name} failed. Falling back to: {fallback}")
        updates["tool_result"] = result
    elif ntype == "escalation" or ntype == "human":
        updates["status"] = "escalated"
    elif ntype == "intent":
        updates["intent"] = nlabel
        
    # Find next node based on edges
    # Standard linear next node selection or custom condition logic
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
    
    workflow.add_edge("execute_tool", "generate_response")
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
