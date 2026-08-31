from fastapi import APIRouter, Depends, HTTPException
from app.middleware.auth import get_current_user, AuthUser
from app.services.auth_service import AuthService
from app.services.workspace_service import WorkspaceService
from app.schemas.workspaces import WorkspaceResponse, WorkspaceUpdate, WorkspaceAIConfig

router = APIRouter()

async def get_user_workspace_id(current_user: AuthUser = Depends(get_current_user)) -> str:
    user_record = await AuthService.verify_and_register_user(current_user)
    workspace_id = user_record.get("workspace_id")
    if not workspace_id:
        raise HTTPException(status_code=400, detail="User does not have an active workspace associated.")
    return workspace_id

@router.get("/me", response_model=WorkspaceResponse)
async def get_workspace(workspace_id: str = Depends(get_user_workspace_id)):
    """Fetches general settings metadata for workspace."""
    return await WorkspaceService.get_workspace(workspace_id)

@router.post("/provision-zhyra")
async def provision_zhyra(workspace_id: str = Depends(get_user_workspace_id)):
    """Auto-provisions the Zhyra Master Agent for the authenticated workspace."""
    from app.services.agent_service import AgentService
    return await AgentService.provision_zhyra_master_agent(workspace_id)

@router.put("/me", response_model=WorkspaceResponse)
async def update_workspace(
    payload: WorkspaceUpdate,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Updates general details (industry, language, timezone)."""
    return await WorkspaceService.update_workspace(workspace_id, payload.model_dump())

@router.put("/me/ai-config", response_model=WorkspaceResponse)
async def update_workspace_ai_config(
    payload: WorkspaceAIConfig,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Updates default AI settings for workspace (Provider, Model, temperature)."""
    return await WorkspaceService.update_ai_config(workspace_id, payload.model_dump())

@router.post("/command")
async def execute_workspace_command(
    payload: dict,
    workspace_id: str = Depends(get_user_workspace_id)
):
    """Parses natural language workspace commands and executes actions."""
    query = payload.get("query", "").strip()
    if not query:
        return {"action": "GENERAL_QUESTION", "message": "Query cannot be empty."}

    system_prompt = """
You are the central command center for Zhyra AI OS.
Your job is to analyze the user's natural language command, determine the appropriate action, extract the parameters, and format it as JSON.

Available Actions:
1. CREATE_AGENT: Create a new AI employee/agent.
   Parameters: name (string), purpose (string), status (string, default "active"), model (string, default "gemini-3.5-flash")
2. CREATE_WORKFLOW: Create a new workflow reasoning graph.
   Parameters: name (string)
3. GENERAL_QUESTION: Answer general questions, system status, or list agents/workflows if asked.
   Parameters: answer (string)

Return ONLY a JSON object in this format:
{
  "action": "CREATE_AGENT" | "CREATE_WORKFLOW" | "GENERAL_QUESTION",
  "parameters": { ... },
  "message": "A friendly success/status message explaining what you did or answering their question."
}
"""
    prompt = f"User Command: {query}"
    
    import json
    from app.providers.manager import ProviderManager
    from app.services.agent_service import AgentService
    from app.services.workflow_service import WorkflowService

    try:
        response_text = await ProviderManager.generate_response(
            workspace_id=workspace_id,
            prompt=prompt,
            system_prompt=system_prompt
        )
        
        # Clean up any potential markdown code blocks
        clean_text = response_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()
        
        data = json.loads(clean_text)
        action = data.get("action")
        params = data.get("parameters", {})
        message = data.get("message", "Processed successfully.")
        
        if action == "CREATE_AGENT":
            agent_data = {
                "name": params.get("name", "New Agent"),
                "purpose": params.get("purpose", "Help with tasks"),
                "status": params.get("status", "active"),
                "model": params.get("model", "gemini-3.5-flash"),
                "workflow_id": "",
                "overrides": {},
                "tools": [],
                "knowledge_ids": []
            }
            new_agent = await AgentService.create_agent(workspace_id, agent_data)
            return {
                "action": action,
                "message": f"Successfully created Agent **{new_agent.get('name')}**. {message}",
                "data": new_agent
            }
            
        elif action == "CREATE_WORKFLOW":
            wf_data = {
                "name": params.get("name", "New Workflow"),
                "nodes": [],
                "edges": [],
                "default_for_all_agents": False
            }
            new_wf = await WorkflowService.create_workflow(workspace_id, wf_data)
            return {
                "action": action,
                "message": f"Successfully created Workflow **{new_wf.get('name')}**. {message}",
                "data": new_wf
            }
            
        else:
            return {
                "action": "GENERAL_QUESTION",
                "message": message
            }
            
    except Exception as e:
        # Robust fallback if LLM key is missing or JSON parsing fails
        if "agent" in query.lower() or "employee" in query.lower():
            try:
                # Extract a name candidate if possible
                words = query.split()
                name_cand = "Custom Agent"
                for idx, w in enumerate(words):
                    if w.lower() in ("named", "called") and idx + 1 < len(words):
                        name_cand = words[idx + 1].strip(".,'\"").capitalize()
                
                agent_data = {
                    "name": name_cand,
                    "purpose": query,
                    "status": "active",
                    "model": "gemini-3.5-flash",
                    "workflow_id": "",
                    "overrides": {},
                    "tools": [],
                    "knowledge_ids": []
                }
                new_agent = await AgentService.create_agent(workspace_id, agent_data)
                return {
                    "action": "CREATE_AGENT",
                    "message": f"I processed your command and successfully created the Agent **{new_agent.get('name')}**.",
                    "data": new_agent
                }
            except Exception:
                pass
        elif "workflow" in query.lower() or "flow" in query.lower():
            try:
                wf_data = {
                    "name": "Custom Workflow",
                    "nodes": [],
                    "edges": [],
                    "default_for_all_agents": False
                }
                new_wf = await WorkflowService.create_workflow(workspace_id, wf_data)
                return {
                    "action": "CREATE_WORKFLOW",
                    "message": f"I processed your command and successfully created the Workflow **{new_wf.get('name')}**.",
                    "data": new_wf
                }
            except Exception:
                pass
                
        return {
            "action": "GENERAL_QUESTION",
            "message": f"I processed your request: '{query}'. If you have any questions about Zhyra or want to configure agents, let me know how I can assist."
        }
