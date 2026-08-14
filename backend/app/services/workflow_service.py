import uuid
import json
from fastapi import HTTPException
from app.database.firestore import firestore_client
from app.providers.manager import ProviderManager
from app.utils.logger import log_info, log_error

class WorkflowService:
    @staticmethod
    async def list_workflows(workspace_id: str) -> list:
        coll = firestore_client.collection("workflows")
        docs = coll.stream()
        results = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                results.append(data)
        return results

    @staticmethod
    async def get_workflow(workspace_id: str, workflow_id: str) -> dict:
        doc_ref = firestore_client.collection("workflows").document(workflow_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found.")
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to workflow resource.")
        return data

    @classmethod
    async def create_workflow(cls, workspace_id: str, data: dict) -> dict:
        workflow_id = f"wf_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("workflows").document(workflow_id)
        
        # If this is marked as default, clear other defaults in the workspace
        if data.get("default_for_all_agents"):
            await cls._clear_other_defaults(workspace_id, workflow_id)
            
        full_data = {
            **data,
            "id": workflow_id,
            "workspace_id": workspace_id,
            "default_for_all_agents": bool(data.get("default_for_all_agents", False))
        }
        
        doc_ref.set(full_data)
        log_info(f"Workflow '{full_data.get('name')}' ({workflow_id}) created in workspace {workspace_id}")
        return full_data

    @classmethod
    async def update_workflow(cls, workspace_id: str, workflow_id: str, data: dict) -> dict:
        doc_ref = firestore_client.collection("workflows").document(workflow_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found.")
            
        existing = snap.to_dict()
        if existing.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to workflow resource.")
            
        filtered_updates = {k: v for k, v in data.items() if v is not None}
        
        if filtered_updates.get("default_for_all_agents"):
            await cls._clear_other_defaults(workspace_id, workflow_id)
            
        if filtered_updates:
            doc_ref.update(filtered_updates)
            log_info(f"Updated workflow {workflow_id} settings.")
            
        return (doc_ref.get()).to_dict()

    @staticmethod
    async def delete_workflow(workspace_id: str, workflow_id: str) -> None:
        doc_ref = firestore_client.collection("workflows").document(workflow_id)
        snap = doc_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found.")
            
        data = snap.to_dict()
        if data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to workflow resource.")
            
        doc_ref.delete()
        log_info(f"Deleted workflow {workflow_id} from workspace {workspace_id}")

        # Also remove references to this workflow from agents
        try:
            agents_coll = firestore_client.collection("agents")
            docs = agents_coll.stream()
            for doc in docs:
                adata = doc.to_dict()
                if adata.get("workspace_id") == workspace_id and adata.get("workflow_id") == workflow_id:
                    agents_coll.document(doc.id).update({"workflow_id": None})
        except Exception as e:
            log_error(f"Error removing workflow reference from agents: {e}")

    @staticmethod
    async def assign_workflow_to_agent(workspace_id: str, agent_id: str, workflow_id: str = None) -> dict:
        agent_ref = firestore_client.collection("agents").document(agent_id)
        snap = agent_ref.get()
        if not snap.exists:
            raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found.")
            
        adata = snap.to_dict()
        if adata.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized access to agent resource.")
            
        agent_ref.update({"workflow_id": workflow_id})
        log_info(f"Assigned workflow {workflow_id} to agent {agent_id} in workspace {workspace_id}")
        return {"agent_id": agent_id, "workflow_id": workflow_id}

    @staticmethod
    async def _clear_other_defaults(workspace_id: str, active_workflow_id: str) -> None:
        try:
            coll = firestore_client.collection("workflows")
            docs = coll.stream()
            for doc in docs:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id and data.get("id") != active_workflow_id and data.get("default_for_all_agents"):
                    coll.document(doc.id).update({"default_for_all_agents": False})
        except Exception as e:
            log_error(f"Error clearing other workflow defaults: {e}")

    @staticmethod
    async def generate_workflow(workspace_id: str, prompt: str) -> dict:
        """
        Uses LLM to generate a JSON workflow graph structure based on natural language input prompt.
        """
        system_prompt = (
            "You are an expert AI workflow designer. Given a user request, you must output a structured workflow graph in JSON format.\n"
            "The JSON must have the following structure:\n"
            "{\n"
            "  \"name\": \"<Workflow Name>\",\n"
            "  \"nodes\": [\n"
            "    {\n"
            "      \"id\": \"n1\",\n"
            "      \"type\": \"intent | knowledge | decision | booking | email | crm | calendar | api | payment | escalation | approval | human\",\n"
            "      \"label\": \"<Node Label>\",\n"
            "      \"desc\": \"<Short description of action>\",\n"
            "      \"x\": 100,\n"
            "      \"y\": 150,\n"
            "      \"trigger_condition\": \"Always run\",\n"
            "      \"tool\": \"<Optionally name of a tool or empty>\",\n"
            "      \"fallback\": \"<Optionally fallback action or empty>\"\n"
            "    }\n"
            "  ],\n"
            "  \"edges\": [\n"
            "    {\n"
            "      \"source\": \"n1\",\n"
            "      \"target\": \"n2\"\n"
            "    }\n"
            "  ]\n"
            "}\n"
            "Nodes must be placed logically on a grid (x between 50 and 1000, y between 50 and 400).\n"
            "Keep the graph clean and sensible. Return ONLY raw JSON, nothing else."
        )

        try:
            response_text = await ProviderManager.generate_response(
                workspace_id=workspace_id,
                prompt=f"Create a workflow for: {prompt}",
                system_prompt=system_prompt
            )
            
            # Extract JSON from response if LLM wrapped it in markdown code blocks
            clean_text = response_text.strip()
            if clean_text.startswith("```"):
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:]
                else:
                    clean_text = clean_text[3:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            parsed = json.loads(clean_text)
            return parsed
        except Exception as e:
            log_error("Failed to generate workflow via AI", exc=e)
            # Return a simple fallback workflow structure
            return {
                "name": "AI Generated Workflow",
                "nodes": [
                    {"id": "n1", "type": "intent", "label": "Understand Intent", "desc": "Classifies the user query", "x": 100, "y": 150, "trigger_condition": "Always run", "tool": "", "fallback": ""},
                    {"id": "n2", "type": "knowledge", "label": "Retrieve Knowledge", "desc": "Searches for answers", "x": 400, "y": 150, "trigger_condition": "Always run", "tool": "", "fallback": ""}
                ],
                "edges": [
                    {"source": "n1", "target": "n2"}
                ]
            }
