from app.database.firestore import firestore_client
from app.utils.logger import log_info, log_error
import time

class ZhyraContextResolver:
    @staticmethod
    async def build_workspace_summary(workspace_id: str) -> str:
        """
        Gathers live metadata about the current workspace (agents, integrations,
        workflows, issues) to give the Master Agent grounding context.
        """
        try:
            summary = []
            summary.append("--- LIVE WORKSPACE STATUS & CONTROLLER CONTEXT ---")
            summary.append(f"Workspace ID: {workspace_id}")
            
            # 1. Fetch Agents
            agents_coll = firestore_client.collection("agents")
            agents_stream = agents_coll.stream()
            agents_list = []
            for doc in agents_stream:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    agents_list.append(data)
            
            summary.append("\nRegistered AI Agents:")
            if not agents_list:
                summary.append("- No agents registered yet.")
            else:
                for agent in agents_list:
                    a_id = agent.get("id")
                    a_name = agent.get("name", "Unnamed")
                    a_type = agent.get("agent_type", "specialist")
                    a_status = agent.get("status", "active")
                    a_purpose = agent.get("purpose", "No purpose declared")
                    summary.append(f"- {a_name} ({a_type}): ID={a_id}, Status={a_status.upper()}, Purpose='{a_purpose}'")
            
            # 2. Fetch Workflows
            workflows_coll = firestore_client.collection("workflows")
            workflows_stream = workflows_coll.stream()
            workflows_list = []
            for doc in workflows_stream:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id:
                    workflows_list.append(data)
            
            summary.append("\nWorkflows:")
            if not workflows_list:
                summary.append("- No workflows defined yet.")
            else:
                for wf in workflows_list:
                    w_id = wf.get("id")
                    w_name = wf.get("name", "Unnamed")
                    is_def = wf.get("default_for_all_agents", False)
                    summary.append(f"- {w_name}: ID={w_id}, DefaultForAll={is_def}")
            
            # 3. Fetch Integrations
            from app.services.integration_service import IntegrationService
            integrations = await IntegrationService.list_integrations(workspace_id)
            summary.append("\nConnected Integrations:")
            connected = [i for i in integrations if i.get("connected", False)]
            if not connected:
                summary.append("- No integrations connected yet.")
            else:
                for i in connected:
                    summary.append(f"- {i.get('name')}: Connected as '{i.get('connected_account')}'")
                    
            # 4. Check for active issues / alerts
            issues = []
            for agent in agents_list:
                if agent.get("status") == "paused":
                    issues.append(f"Agent '{agent.get('name')}' is PAUSED.")
            for i in integrations:
                if i.get("id") in ("int_gmail", "int_gcal") and not i.get("connected", False):
                    issues.append(f"Critical integration '{i.get('name')}' is DISCONNECTED.")
            
            summary.append("\nNeeds Attention / Diagnostic Alerts:")
            if not issues:
                summary.append("- No urgent operational issues detected. Workspace is healthy.")
            else:
                for issue in issues:
                    summary.append(f"- [ALERT] {issue}")
                    
            summary.append("\nAlways use these details to answer queries. If asked about an agent or integration state, refer directly to this workspace snapshot.")
            summary.append("--------------------------------------------------")
            return "\n".join(summary)
            
        except Exception as e:
            log_error("Failed to build Zhyra workspace summary context", exc=e)
            return "--- LIVE WORKSPACE SNAPSHOT TEMPORARILY UNAVAILABLE ---"
