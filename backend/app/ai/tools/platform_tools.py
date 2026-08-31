from fastapi import HTTPException
from app.services.agent_service import AgentService
from app.services.workflow_service import WorkflowService
from app.services.integration_service import IntegrationService
from app.services.analytics_service import AnalyticsService
from app.services.conversation_service import ConversationService
from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error

class PlatformToolExecutor:
    @classmethod
    async def execute(cls, workspace_id: str, action: str, args: dict) -> dict:
        """Executes internal workspace platform actions for Zhyra Master Agent."""
        try:
            method = getattr(cls, f"_{action}", None)
            if not method:
                return {"success": False, "error_code": "METHOD_NOT_FOUND", "message": f"Platform action '{action}' not found."}
            return await method(workspace_id, args)
        except Exception as e:
            log_error(f"Platform tool execution failed for action={action}", exc=e)
            return {"success": False, "error_code": "EXECUTION_ERROR", "message": str(e)}

    @classmethod
    async def _list_agents(cls, workspace_id: str, args: dict) -> dict:
        agents = await AgentService.list_agents(workspace_id)
        # Simplify data returned to context to preserve token usage
        summary = []
        for a in agents:
            summary.append({
                "id": a.get("id"),
                "name": a.get("name"),
                "purpose": a.get("purpose"),
                "status": a.get("status"),
                "agent_type": a.get("agent_type", "specialist"),
                "role": a.get("role"),
                "capabilities": a.get("capabilities", []),
                "conversations_today": a.get("conversations_today", 0)
            })
        return {"success": True, "agents": summary}

    @classmethod
    async def _get_agent(cls, workspace_id: str, args: dict) -> dict:
        agent_id_or_name = args.get("agent_id") or args.get("name")
        if not agent_id_or_name:
            return {"success": False, "error_code": "INVALID_ARGUMENTS", "message": "Missing agent_id or name."}
        
        # Try to resolve by ID or Name
        target_agent = None
        agents = await AgentService.list_agents(workspace_id)
        for a in agents:
            if a.get("id") == agent_id_or_name or a.get("name", "").lower() == agent_id_or_name.lower():
                target_agent = a
                break
                
        if not target_agent:
            return {"success": False, "error_code": "AGENT_NOT_FOUND", "message": f"Agent '{agent_id_or_name}' not found."}
            
        return {"success": True, "agent": target_agent}

    @classmethod
    async def _pause_agent(cls, workspace_id: str, args: dict) -> dict:
        agent_id_or_name = args.get("agent_id") or args.get("name")
        if not agent_id_or_name:
            return {"success": False, "error_code": "INVALID_ARGUMENTS", "message": "Missing agent_id or name."}
            
        target_id = None
        target_name = None
        agents = await AgentService.list_agents(workspace_id)
        for a in agents:
            if a.get("id") == agent_id_or_name or a.get("name", "").lower() == agent_id_or_name.lower():
                target_id = a.get("id")
                target_name = a.get("name")
                if a.get("agent_type") == "master":
                    return {"success": False, "error_code": "PROTECTED_AGENT", "message": "The Zhyra Master Agent cannot be paused."}
                break
                
        if not target_id:
            return {"success": False, "error_code": "AGENT_NOT_FOUND", "message": f"Agent '{agent_id_or_name}' not found."}
            
        updated = await AgentService.update_agent(workspace_id, target_id, {"status": "paused"})
        
        # Track event in audit trail
        AnalyticsService.record_event(
            workspace_id=workspace_id,
            event_type="zhyra.agent_paused",
            agent_id=target_id,
            metadata={"reason": args.get("reason") or "Direct request from User"}
        )
        
        return {"success": True, "message": f"Agent '{target_name}' has been successfully paused.", "agent": updated}

    @classmethod
    async def _resume_agent(cls, workspace_id: str, args: dict) -> dict:
        agent_id_or_name = args.get("agent_id") or args.get("name")
        if not agent_id_or_name:
            return {"success": False, "error_code": "INVALID_ARGUMENTS", "message": "Missing agent_id or name."}
            
        target_id = None
        target_name = None
        agents = await AgentService.list_agents(workspace_id)
        for a in agents:
            if a.get("id") == agent_id_or_name or a.get("name", "").lower() == agent_id_or_name.lower():
                target_id = a.get("id")
                target_name = a.get("name")
                break
                
        if not target_id:
            return {"success": False, "error_code": "AGENT_NOT_FOUND", "message": f"Agent '{agent_id_or_name}' not found."}
            
        updated = await AgentService.update_agent(workspace_id, target_id, {"status": "active"})
        
        # Track event in audit trail
        AnalyticsService.record_event(
            workspace_id=workspace_id,
            event_type="zhyra.agent_resumed",
            agent_id=target_id,
            metadata={"reason": args.get("reason") or "Direct request from User"}
        )
        
        return {"success": True, "message": f"Agent '{target_name}' has been successfully resumed.", "agent": updated}

    @classmethod
    async def _list_workflows(cls, workspace_id: str, args: dict) -> dict:
        workflows = await WorkflowService.list_workflows(workspace_id)
        summary = [{"id": w.get("id"), "name": w.get("name"), "default_for_all_agents": w.get("default_for_all_agents", False)} for w in workflows]
        return {"success": True, "workflows": summary}

    @classmethod
    async def _list_integrations(cls, workspace_id: str, args: dict) -> dict:
        integrations = await IntegrationService.list_integrations(workspace_id)
        summary = [{
            "id": i.get("id"),
            "name": i.get("name"),
            "category": i.get("category"),
            "connected": i.get("connected", False),
            "health": i.get("health", 100),
            "connected_account": i.get("connected_account")
        } for i in integrations]
        return {"success": True, "integrations": summary}

    @classmethod
    async def _get_workspace_analytics(cls, workspace_id: str, args: dict) -> dict:
        range_key = args.get("range") or "30d"
        metrics = await AnalyticsService.get_dashboard_analytics(workspace_id, range_key)
        return {"success": True, "analytics": metrics}

    @classmethod
    async def _get_agent_conversations(cls, workspace_id: str, args: dict) -> dict:
        agent_id = args.get("agent_id")
        limit = args.get("limit") or 10
        convos = await ConversationService.list_conversations(workspace_id, agent_id=agent_id, limit=limit)
        return {"success": True, "conversations": convos}

    @classmethod
    async def _get_agent_issues(cls, workspace_id: str, args: dict) -> dict:
        # Resolve real issues like paused agents or disconnected integrations
        issues = []
        
        agents = await AgentService.list_agents(workspace_id)
        for a in agents:
            if a.get("status") == "paused":
                issues.append({
                    "type": "agent_paused",
                    "severity": "warning",
                    "agent_id": a.get("id"),
                    "agent_name": a.get("name"),
                    "message": f"Agent '{a.get('name')}' is currently paused and cannot handle requests."
                })
                
        integrations = await IntegrationService.list_integrations(workspace_id)
        for i in integrations:
            # If it's a critical integration that should be connected but is not
            if i.get("id") in ("int_gmail", "int_gcal") and not i.get("connected", False):
                issues.append({
                    "type": "integration_disconnected",
                    "severity": "critical",
                    "integration_id": i.get("id"),
                    "integration_name": i.get("name"),
                    "message": f"Critical integration '{i.get('name')}' is disconnected."
                })
                
        return {"success": True, "issues": issues}

    @classmethod
    async def _delegate_to_agent(cls, workspace_id: str, args: dict) -> dict:
        """Delegates a specific sub-task or query to a real enabled specialist agent in the workspace."""
        target_ref = args.get("agent_id") or args.get("name") or args.get("agent")
        task = args.get("task") or args.get("query") or args.get("instructions")

        if not target_ref or not task:
            return {
                "success": False,
                "error_code": "INVALID_ARGUMENTS",
                "message": "Both target agent (agent_id or name) and task prompt are required."
            }

        available = await AgentService.get_available_agents(workspace_id)
        target_agent = None
        for a in available:
            if a.get("id") == target_ref or a.get("name", "").lower() == str(target_ref).lower():
                target_agent = a
                break

        if not target_agent:
            return {
                "success": False,
                "error_code": "AGENT_NOT_FOUND",
                "message": f"Agent '{target_ref}' not found in active workspace registry."
            }

        if target_agent.get("status") == "paused":
            return {
                "success": False,
                "error_code": "AGENT_PAUSED",
                "message": f"Agent '{target_agent['name']}' is currently paused and cannot accept delegated tasks."
            }

        try:
            from app.ai.runtime.agent_runtime import AgentRuntime
            res = await AgentRuntime.execute(
                workspace_id=workspace_id,
                agent_id=target_agent["id"],
                query=task,
                history=[],
                conversation_id=f"delegated_{target_agent['id']}"
            )
            return {
                "success": True,
                "delegated_agent": target_agent["name"],
                "target_agent_id": target_agent["id"],
                "result": res.get("text", ""),
                "terminal_state": res.get("terminal_state", "COMPLETED")
            }
        except Exception as e:
            log_error(f"Delegation to agent {target_agent['id']} failed", exc=e)
            return {
                "success": False,
                "error_code": "DELEGATION_FAILED",
                "message": f"Execution failed for delegated agent '{target_agent['name']}': {str(e)}"
            }

