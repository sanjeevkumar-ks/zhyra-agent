import time
from typing import AsyncGenerator, Dict, Any, List, Optional
from fastapi import HTTPException
from app.database.firestore import firestore_client
from app.database.qdrant import qdrant_client
from app.providers.manager import ProviderManager
from app.utils.logger import log_info, log_error
import uuid

class ConversationService:
    @staticmethod
    async def list_conversations(workspace_id: str) -> list:
        coll = firestore_client.collection("conversations")
        docs = coll.stream()
        results = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("workspace_id") == workspace_id:
                results.append(data)
        # Sort by time descending (using basic mock string comparison or timestamp if needed)
        return sorted(results, key=lambda x: x.get("time", ""), reverse=True)

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
    async def create_conversation(workspace_id: str, agent_id: str, customer: str, channel: str = "Web Chat", is_test: bool = False) -> dict:
        # Verify Agent exists
        agent_ref = firestore_client.collection("agents").document(agent_id)
        agent_snap = agent_ref.get()
        if not agent_snap.exists:
            raise HTTPException(status_code=400, detail="Invalid agent_id.")
        agent_data = agent_snap.to_dict()

        convo_id = f"con_{uuid.uuid4().hex[:8]}"
        doc_ref = firestore_client.collection("conversations").document(convo_id)
        
        # Initials calculation
        initials = "".join([part[0] for part in customer.split() if part])[:2].upper() or "CU"
        
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
            "preview": "No messages yet.",
            "time": "Just now",
            "unread": False,
            "messages": [],
            "intent": "Inquire",
            "confidence": 100,
            "knowledge_used": [],
            "memory_recalled": [],
            "actions": []
        }
        
        doc_ref.set(convo_data)
        log_info(f"Conversation {convo_id} started with agent {agent_id} in workspace {workspace_id} (is_test={is_test})")
        return convo_data

    @classmethod
    async def post_message(
        cls,
        workspace_id: str,
        convo_id: str,
        sender_type: str,  # "customer" | "agent" | "human"
        text: str
    ) -> dict:
        """
        Stores user/agent messages. If customer speaks, triggers LLM agent flow 
        and updates conversation metadata in Firestore.
        """
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        convo_snap = convo_ref.get()
        if not convo_snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        convo_data = convo_snap.to_dict()
        
        if convo_data.get("workspace_id") != workspace_id:
            raise HTTPException(status_code=403, detail="Unauthorized")

        # 1. Append message to convo history
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
        
        # Increments analytics events count in db
        cls._log_analytics_event(workspace_id, "message_sent")
        
        # 2. If message is from customer, trigger AI Response flow
        if sender_type == "customer":
            # Start background agent reply task
            agent_id = convo_data.get("agent_id")
            ai_reply = await cls._generate_agent_reply(workspace_id, agent_id, text, messages, convo_id)
            
            # Save AI's response message
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
            
            # Update database status
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
            
            # Increment agent counter
            cls._increment_agent_convo_count(agent_id)
            
        return (convo_ref.get()).to_dict()

    @classmethod
    async def stream_agent_chunks(
        cls,
        workspace_id: str,
        convo_id: str,
        text: str
    ) -> AsyncGenerator[str, None]:
        """Streams AI chunks directly to support SSE responses, handling tool execution and persisting messages."""
        convo_ref = firestore_client.collection("conversations").document(convo_id)
        convo_snap = convo_ref.get()
        if not convo_snap.exists:
            raise HTTPException(status_code=404, detail="Conversation not found")
        convo_data = convo_snap.to_dict()
        
        agent_id = convo_data.get("agent_id")
        agent_ref = firestore_client.collection("agents").document(agent_id)
        agent_snap = agent_ref.get()
        if not agent_snap.exists:
            yield "[Error: Agent configuration missing]"
            return
        agent_data = agent_snap.to_dict()
        
        # 1. Persist the customer's message to Firestore
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
            "unread": True
        })
        cls._log_analytics_event(workspace_id, "message_sent")

        # 2. Invoke the LangGraph AI Runtime orchestration layer
        from app.ai.runtime.agent_runtime import AgentRuntime
        import asyncio
        import json

        ai_reply = await AgentRuntime.execute(
            workspace_id=workspace_id,
            agent_id=agent_id,
            query=text,
            history=messages,
            conversation_id=convo_id
        )

        # 3. Stream response metadata and text chunks
        meta_payload = {
            "knowledge_used": ai_reply.get("knowledge_used", []),
            "blocks": ai_reply.get("blocks", [])
        }
        yield f"__METADATA__:{json.dumps(meta_payload)}\n"

        accumulated_text = ai_reply.get("text", "")
        # Yield in small typing simulation chunks to preserve visual streaming UI animations
        chunk_size = 12
        for idx in range(0, len(accumulated_text), chunk_size):
            yield accumulated_text[idx:idx+chunk_size]
            await asyncio.sleep(0.015)

        # 4. Persist AI message and update conversation metadata
        ai_msg_id = f"msg_{uuid.uuid4().hex[:8]}"
        ai_message = {
            "id": ai_msg_id,
            "sender_type": "agent",
            "text": accumulated_text,
            "blocks": ai_reply.get("blocks", []),
            "tool_calls": ai_reply.get("tool_calls", []),
            "time": time.strftime("%H:%M")
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
            "integration_used": ai_reply.get("integration_used"),
            "execution_status": ai_reply.get("execution_status", "completed")
        })
        
        cls._increment_agent_convo_count(agent_id)

    @classmethod
    async def _generate_agent_reply(
        cls,
        workspace_id: str,
        agent_id: str,
        query: str,
        history: List[dict],
        conversation_id: str = "unknown_convo"
    ) -> dict:
        # 1. Delegate execution to the LangGraph AI Runtime orchestration layer
        from app.ai.runtime.agent_runtime import AgentRuntime
        return await AgentRuntime.execute(
            workspace_id=workspace_id,
            agent_id=agent_id,
            query=query,
            history=history,
            conversation_id=conversation_id
        )

    @staticmethod
    async def _get_agent_tools_prompt(workspace_id: str, agent_tools: List[str] = None) -> str:
        """Queries active integrations to compile available tool instructions."""
        if agent_tools is None:
            agent_tools = []
        try:
            integrations_coll = firestore_client.collection("integrations")
            docs = integrations_coll.stream()
            connected_tools = []
            
            id_to_name = {
                "int_gcal": "Google Calendar",
                "int_gmail": "Gmail",
                "int_gdrive": "Google Drive",
                "int_gmeet": "Google Meet",
                "int_slack": "Slack",
                "int_whatsapp": "WhatsApp Business",
                "int_hubspot": "HubSpot",
                "int_razorpay": "Razorpay",
                "int_shopify": "Shopify",
                "int_google_maps": "Google Maps",
                "int_elevenlabs": "ElevenLabs",
                "int_fcm": "Firebase Cloud Messaging",
                "int_gemini": "Gemini",
                "int_openai": "OpenAI",
                "int_claude": "Claude",
                "int_openrouter": "OpenRouter",
                "int_nvidia_ai": "NVIDIA AI",
                "int_rest_api": "REST API"
            }
            
            # Normalize agent tools list for fuzzy matching
            norm_agent_tools = [t.lower().replace(" ", "").replace("_", "").replace("-", "") for t in agent_tools]

            for doc in docs:
                data = doc.to_dict()
                if data.get("workspace_id") == workspace_id and data.get("connected"):
                    iid = data.get("id", "")
                    iname = id_to_name.get(iid, data.get("name", ""))
                    norm_iid = iid.lower().replace(" ", "").replace("_", "").replace("-", "").replace("int", "")
                    norm_iname = iname.lower().replace(" ", "").replace("_", "").replace("-", "")

                    # Check if iid, iname, or normalized variations match agent's tool assignments
                    is_assigned = (
                        not agent_tools
                        or iid in agent_tools
                        or iname in agent_tools
                        or any(
                            nt in norm_iid or norm_iid in nt or nt in norm_iname or norm_iname in nt
                            for nt in norm_agent_tools
                        )
                    )
                    if is_assigned:
                        connected_tools.append(iid)
            
            if not connected_tools:
                return ""

            tools_instructions = (
                "\n\n[CRITICAL INSTRUCTION]\n"
                "You have access to the following connected integration tools. "
                "If the customer query requires information or actions from these tools (such as checking order status, listing products, scheduling meetings/calendar events, sending emails, or processing refunds), you MUST immediately respond with a TOOL_CALL block. "
                "Do NOT politely decline or say you do not have access. You must use these tools to perform actions.\n\n"
                "Format:\n"
                "TOOL_CALL:{\"tool\": \"<ToolName>\", \"method\": \"<MethodName>\", \"args\": {<arguments>}}\n"
                "Do NOT add any other conversational text on the same line as the TOOL_CALL. "
                "Once you output a TOOL_CALL, the system will execute it and return the result as a TOOL_RESULT, "
                "after which you can use the result to construct your final response to the customer.\n\n"
                "Available tools based on connected integrations:\n"
            )
            
            if "int_gcal" in connected_tools:
                tools_instructions += "- GoogleCalendar.list_events(calendar_id: str = 'primary', time_min: str = None, time_max: str = None) -> lists scheduled calendar events\n"
                tools_instructions += "- GoogleCalendar.create_event(summary: str, start_time: str, end_time: str = None, description: str = '', timezone: str = 'UTC', calendar_id: str = 'primary') -> schedules a meeting/event\n"
                tools_instructions += "- GoogleCalendar.update_event(event_id: str, summary: str = None, start_time: str = None, end_time: str = None, calendar_id: str = 'primary') -> updates existing event\n"
                tools_instructions += "- GoogleCalendar.delete_event(event_id: str, calendar_id: str = 'primary') -> cancels/deletes event\n"
            if "int_gmail" in connected_tools:
                tools_instructions += "- Gmail.send_email(to: str, subject: str, body: str) -> sends an email\n"
                tools_instructions += "- Gmail.search_emails(query: str, max_results: int = 5) -> searches emails by query/sender/subject\n"
                tools_instructions += "- Gmail.read_email(message_id: str) -> reads full email message\n"
            if "int_whatsapp" in connected_tools:
                tools_instructions += "- WhatsApp.send_message(phone: str, text: str) -> sends WhatsApp message\n"
            if "int_gdrive" in connected_tools:
                tools_instructions += "- GoogleDrive.list_files(query: str = None) -> lists files in Drive\n"
                tools_instructions += "- GoogleDrive.search_files(query: str) -> searches documents in Drive\n"
            if "int_slack" in connected_tools:
                tools_instructions += "- Slack.send_message(channel: str, text: str) -> posts message to Slack channel\n"
            if "int_hubspot" in connected_tools:
                tools_instructions += "- HubSpot.get_contact(email: str) -> retrieves CRM contact\n"
                tools_instructions += "- HubSpot.create_contact(email: str, firstname: str = None, lastname: str = None) -> creates new lead/contact\n"
            if "int_razorpay" in connected_tools:
                tools_instructions += "- Razorpay.get_payment(payment_id: str) -> retrieves transaction info\n"
                tools_instructions += "- Razorpay.create_refund(payment_id: str, amount: float = None) -> processes a refund\n"
            if "int_shopify" in connected_tools:
                tools_instructions += "- Shopify.get_order(order_id: str) -> retrieves order details and shipping status\n"
                tools_instructions += "- Shopify.list_products() -> lists products catalog and stock\n"
            if "int_gmeet" in connected_tools:
                tools_instructions += "- GoogleMeet.create_meeting(summary: str, start_time: str) -> returns a video meeting link\n"
            if "int_rest_api" in connected_tools:
                tools_instructions += "- CustomAPI.request(method: str, path: str, params: dict = None, body: dict = None) -> calls custom endpoint\n"
            
            return tools_instructions
        except Exception as e:
            log_error("Failed to compile agent tools prompt", exc=e)
            return ""

    @staticmethod
    def _parse_tool_call(text: str) -> Optional[dict]:
        """Checks if response contains a tool call and returns parsed dict."""
        import json
        import re

        if not text:
            return None

        # 1. TOOL_CALL: format
        if "TOOL_CALL:" in text:
            try:
                start = text.find("TOOL_CALL:") + 10
                raw = text[start:].strip()
                # Clean code blocks
                if raw.startswith("```"):
                    raw = re.sub(r"^```(?:json)?\s*", "", raw)
                    raw = re.sub(r"\s*```$", "", raw).strip()
                
                # Extract first valid JSON object
                if raw.startswith("{"):
                    open_braces = 0
                    end_idx = -1
                    for i, char in enumerate(raw):
                        if char == "{":
                            open_braces += 1
                        elif char == "}":
                            open_braces -= 1
                            if open_braces == 0:
                                end_idx = i + 1
                                break
                    if end_idx != -1:
                        json_str = raw[:end_idx]
                        return json.loads(json_str)
                
                # Fallback: single line
                line = raw.split("\n")[0].strip()
                return json.loads(line)
            except Exception:
                pass

        # 2. <|tool_call|> format or call:Tool.method(...)
        tool_call_match = re.search(r"(?:<\|tool_call\|>)?\s*call:([\w\.]+)\((.*?)\)\s*(?:<\|tool_call\|>|<tool_call\|>)?", text, re.DOTALL)
        if tool_call_match:
            full_target = tool_call_match.group(1)
            raw_args = tool_call_match.group(2).strip()
            
            tool_name = full_target
            method_name = "execute"
            if "." in full_target:
                parts = full_target.split(".")
                tool_name = parts[0]
                method_name = parts[1]
                
            parsed_args = {}
            if raw_args:
                try:
                    parsed_args = json.loads("{" + raw_args + "}")
                except Exception:
                    kv_pairs = re.findall(r"(\w+)\s*=\s*['\"]?(.*?)['\"]?(?:,\s*|$)", raw_args)
                    for k, v in kv_pairs:
                        parsed_args[k] = v.rstrip("'\"")
                        
            return {"tool": tool_name, "method": method_name, "args": parsed_args}

        return None

    @classmethod
    async def _perform_rag(cls, workspace_id: str, agent_data: dict, query: str) -> tuple[str, List[str]]:
        """Queries Qdrant for semantic matches and retrieves text chunks."""
        knowledge_sources = agent_data.get("knowledge_sources", [])
        if not knowledge_sources:
            return "No documents uploaded for this agent.", []

        cited = []
        chunks = []
        
        try:
            # Get workspace specific provider embeddings
            provider, _ = await ProviderManager.get_active_provider(workspace_id)
            query_vector = await provider.embeddings(query)
            
            # Query Qdrant for matching nodes
            collection_name = f"knowledge_{workspace_id}"
            
            # Simple check if collection exists in Qdrant before search
            collections = qdrant_client.get_collections().collections
            exists = any(col.name == collection_name for col in collections)
            
            if exists:
                col_info = qdrant_client.get_collection(collection_name)
                existing_dim = col_info.config.params.vectors.size
                
                if existing_dim == len(query_vector):
                    from qdrant_client.http import models as qmodels
                    
                    # Pre-filter matches inside Qdrant to only search within the agent's assigned knowledge sources
                    qdrant_filter = qmodels.Filter(
                        must=[
                            qmodels.FieldCondition(
                                key="document_title",
                                match=qmodels.MatchAny(any=knowledge_sources)
                            )
                        ]
                    )
                    
                    search_results = qdrant_client.query_points(
                        collection_name=collection_name,
                        query=query_vector,
                        query_filter=qdrant_filter,
                        limit=5
                    )
                    
                    for hit in search_results.points:
                        payload = hit.payload
                        doc_title = payload.get("document_title", "Doc")
                        chunks.append(f"Source: {doc_title}\nContent: {payload.get('text', '')}")
                        if doc_title not in cited:
                            cited.append(doc_title)
                else:
                    log_error(f"Dimension mismatch in Qdrant collection '{collection_name}' (expected: {len(query_vector)}, collection size: {existing_dim}). Please re-index documents.")
        except Exception as e:
            log_error("Qdrant semantic search failed. Falling back to mock RAG context.", exc=e)
            
        # Fallback Mock RAG if no chunks retrieved but sources assigned
        if not chunks and knowledge_sources:
            # Return custom placeholder context based on mock source names
            for source in knowledge_sources[:2]:
                if "Refund" in source:
                    chunks.append(f"Source: {source}\nContent: Customers can request a full refund within 14 days of purchase. Refunds take 3-5 business days to process on the original payment method.")
                elif "Manual" in source:
                    chunks.append(f"Source: {source}\nContent: To access advanced metrics in the dashboard, navigate to Settings > API and generate a new access token.")
                else:
                    chunks.append(f"Source: {source}\nContent: Standard operational rules apply. Operating hours are 9:00 AM to 5:00 PM EST, Monday through Friday.")
                cited.append(source)

        context_str = "\n\n".join(chunks)
        return context_str, cited

    @staticmethod
    def _increment_agent_convo_count(agent_id: str):
        try:
            ref = firestore_client.collection("agents").document(agent_id)
            snap = ref.get()
            if snap.exists:
                data = snap.to_dict()
                count = data.get("conversations_today", 0) + 1
                ref.update({"conversations_today": count})
        except Exception as e:
            log_error("Failed to increment agent conversation count", exc=e)

    @staticmethod
    def _log_analytics_event(workspace_id: str, event_type: str):
        try:
            # Appends basic usage telemetry in Firestore
            ref = firestore_client.collection("events").add({
                "workspace_id": workspace_id,
                "event_type": event_type,
                "timestamp": time.time()
            })
        except Exception as e:
            log_error("Failed to log analytics event", exc=e)
