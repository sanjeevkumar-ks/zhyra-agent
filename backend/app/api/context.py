from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import get_current_user, AuthUser
from app.api.workspaces import get_user_workspace_id
from app.database.firestore import firestore_client
from app.ai.context.models import ContextConfig
import time

router = APIRouter()

@router.get("/analytics")
async def get_token_analytics(workspace_id: str = Depends(get_user_workspace_id)):
    """
    Compiles token usage statistics for the workspace, including per-agent,
    per-model, and per-component token counts.
    """
    try:
        coll = firestore_client.collection("token_usage")
        docs = coll.stream()
        
        records = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                records.append(data)
                
        # Aggregate metrics
        total_input = 0
        total_output = 0
        total_tokens = 0
        
        per_agent = {}
        per_model = {}
        component_breakdown = {
            "system_prompt": 0,
            "conversation": 0,
            "memory": 0,
            "rag": 0,
            "tools": 0,
            "tool_results": 0
        }
        
        for r in records:
            total_input += r.get("input_tokens", 0)
            total_output += r.get("output_tokens", 0)
            total_tokens += r.get("total_tokens", 0)
            
            agent_id = r.get("agent_id", "unknown")
            per_agent[agent_id] = per_agent.get(agent_id, 0) + r.get("total_tokens", 0)
            
            model = r.get("model", "unknown")
            per_model[model] = per_model.get(model, 0) + r.get("total_tokens", 0)
            
            component_breakdown["system_prompt"] += r.get("system_prompt_tokens", 0)
            component_breakdown["conversation"] += r.get("conversation_tokens", 0)
            component_breakdown["memory"] += r.get("memory_tokens", 0)
            component_breakdown["rag"] += r.get("rag_tokens", 0)
            component_breakdown["tools"] += r.get("tool_definition_tokens", 0)
            component_breakdown["tool_results"] += r.get("tool_result_tokens", 0)

        # Estimate savings (e.g. 1000 input tokens = $0.0015, 1000 output = $0.002)
        estimated_cost = (total_input / 1000) * 0.0015 + (total_output / 1000) * 0.002
        
        return {
            "total_tokens_used": total_tokens,
            "total_input_tokens": total_input,
            "total_output_tokens": total_output,
            "estimated_cost_usd": round(estimated_cost, 4),
            "usage_count": len(records),
            "tokens_per_agent": per_agent,
            "tokens_per_model": per_model,
            "component_tokens": component_breakdown
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query token analytics: {str(e)}")

@router.get("/debug/{conversation_id}")
async def get_conversation_debug_context(
    conversation_id: str,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """
    Exposes token breakdown and details of recent transactions 
    for authorized developer debugging. Excludes credentials.
    """
    try:
        coll = firestore_client.collection("token_usage")
        docs = coll.stream()
        
        matches = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id and data.get("conversation_id") == conversation_id:
                matches.append(data)
                
        # Sort by timestamp descending
        matches.sort(key=lambda x: x.get("timestamp", 0.0), reverse=True)
        
        return {
            "conversation_id": conversation_id,
            "debug_logs": matches[:10]  # Return last 10 entries
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query debug logs: {str(e)}")

@router.get("/config")
async def get_context_engine_config():
    """Returns default optimization config configurations."""
    return ContextConfig().model_dump()
