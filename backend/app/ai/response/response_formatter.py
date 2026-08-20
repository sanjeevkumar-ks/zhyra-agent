from typing import List, Dict, Any, Optional
from app.ai.response.models import StructuredAgentResponse, ResponseBlock
from app.ai.response.block_builder import ResponseBlockBuilder

class ResponseFormatter:
    @classmethod
    def format_response(
        cls,
        message: str,
        tool_call: Optional[Dict[str, Any]] = None,
        tool_result: Optional[Dict[str, Any]] = None,
        status: str = "success",
        tool_records: List[Dict[str, Any]] = None,
        query: str = "",
    ) -> StructuredAgentResponse:
        """
        Formats final LLM agent response and tool execution outcome 
        into a structured response with Pydantic block nodes.

        The verification gate is enforced here and in the graph finalize node:
        an LLM success claim is never surfaced without a verified tool record.
        """
        from app.services.conversation_service import ConversationService

        tool_records = tool_records or []
        verified_records = [r for r in tool_records if r.get("status") == "SUCCEEDED"]

        message = ConversationService.sanitize_tool_call_text(message or "")
        message = ConversationService._enforce_verification_gate(
            message, tool_records=tool_records, tool_result=tool_result, query=query
        )

        blocks: List[ResponseBlock] = []
        execution_status = "completed"
        integration_used = None

        if verified_records:
            # Deterministic success blocks from verified execution records.
            record = verified_records[0]
            integration_used = record.get("integration_id")
            record_data = record.get("data") or {}
            tool_name = record.get("tool") or ""
            action = record.get("action") or ""
            tool_str = f"{tool_name} {action}".lower()

            if record.get("simulated"):
                # Simulation mode: the action was NOT executed against a real
                # API. Render a text-only result and never a real resource card.
                execution_status = "completed"
                status = "simulated"
                message = message or "[Simulation] The action was resolved but not executed."
            elif "create_event" in tool_str or "calendar" in tool_str or "gcal" in tool_str:
                event_id = record.get("external_resource_id")
                title = record_data.get("title") or "Scheduled Event"
                start = record_data.get("start_time") or record_data.get("start") or ""
                url = record_data.get("html_link") or ""
                timezone = record_data.get("timezone") or ""
                blocks.append(ResponseBlockBuilder.calendar_event(
                    title=title,
                    date=start,
                    time=start,
                    status="created" if "create" in tool_str else "active",
                    event_id=event_id or "",
                    url=url,
                    timezone=timezone
                ))
            elif "send_email" in tool_str or "gmail" in tool_str:
                blocks.append(ResponseBlockBuilder.email(
                    to=record_data.get("to") or (tool_call.get("args", {}).get("to", "") if tool_call else ""),
                    subject=record_data.get("subject") or (tool_call.get("args", {}).get("subject", "") if tool_call else ""),
                    status="sent"
                ))

        elif tool_result or tool_call:
            res_dict = tool_result if tool_result is not None else {}
            # If tool_result was not executed (None), success is False
            is_success = res_dict.get("success", False) if tool_result is not None else False
            integration_used = res_dict.get("integration") or (tool_call.get("tool") if tool_call else "GoogleCalendar")
            tool_name = res_dict.get("tool") or (tool_call.get("method") if tool_call else "create_event")
            
            data_res = res_dict.get("data", res_dict)
            if not isinstance(data_res, dict):
                data_res = {}

            integ_str = str(integration_used).lower()
            tool_str = str(tool_name).lower()

            # Additional check: For calendar event creation, require valid external event_id
            if is_success and ("calendar" in integ_str or "gcal" in integ_str or "event" in tool_str):
                event_id = data_res.get("event_id") or res_dict.get("event_id")
                if not event_id or event_id == "unknown_id":
                    is_success = False
                    res_dict["success"] = False
                    res_dict["error_code"] = "MISSING_RESOURCE_ID"
                    res_dict["message"] = "Google Calendar did not return a valid event ID."

            if is_success:
                execution_status = "completed"
                status = "success"

                if not message or any(err_kw in message.lower() for err_kw in ["couldn't", "failed", "error"]):
                    if "calendar" in integ_str or "gcal" in integ_str or "event" in tool_str:
                        message = "Done — I've scheduled your meeting."
                    elif "gmail" in integ_str or "email" in tool_str:
                        message = "Done — I've sent the email."
                    elif "slack" in integ_str:
                        message = "Done — I've posted the message to Slack."
                    else:
                        message = "Action completed successfully."
                
                if "calendar" in integ_str or "gcal" in integ_str or "event" in tool_str:
                    title = data_res.get("title") or res_dict.get("title") or "Scheduled Event"
                    start = data_res.get("start_time") or res_dict.get("start_time") or res_dict.get("start", "")
                    event_id = data_res.get("event_id") or res_dict.get("event_id", "")
                    url = data_res.get("html_link") or res_dict.get("html_link", "")
                    timezone = data_res.get("timezone") or res_dict.get("timezone", "")
                    
                    blocks.append(ResponseBlockBuilder.calendar_event(
                        title=title,
                        date=start,
                        time=start,
                        status="created" if "create" in tool_str else "active",
                        event_id=event_id,
                        url=url,
                        timezone=timezone
                    ))
                elif "gmail" in integ_str or "email" in tool_str:
                    blocks.append(ResponseBlockBuilder.email(
                        to=data_res.get("to") or (tool_call.get("args", {}).get("to", "") if tool_call else ""),
                        subject=data_res.get("subject") or (tool_call.get("args", {}).get("subject", "") if tool_call else ""),
                        status="sent"
                    ))
            else:
                err_code = res_dict.get("error_code") or res_dict.get("status") or "EXECUTION_FAILED"
                execution_status = err_code.lower()
                status = "failed"
                err_message = res_dict.get("message") or "Tool execution could not be completed."
                action_text = res_dict.get("action") or "Verify integration settings and permissions."

                # Override any hallucinated success text from LLM
                success_keywords = ["created", "scheduled", "added", "booked", "done — i've", "i've scheduled", "i've created", "i've added"]
                if not message or any(kw in message.lower() for kw in success_keywords):
                    message = f"I couldn't complete the action because: {err_message}"

                blocks.append(ResponseBlockBuilder.integration_error(
                    provider=str(integration_used),
                    status=err_code,
                    action=action_text,
                    message=err_message
                ))
        elif tool_records:
            # Tool was attempted but none succeeded.
            failed = [r for r in tool_records if r.get("status") == "FAILED"]
            if failed:
                execution_status = "failed"
                status = "failed"
                err_message = failed[0].get("message") or "Tool execution could not be completed."
                integration_used = failed[0].get("integration_id")
                blocks.append(ResponseBlockBuilder.integration_error(
                    provider=str(integration_used),
                    status=failed[0].get("error_code") or "EXECUTION_FAILED",
                    action="Verify integration settings and permissions.",
                    message=err_message
                ))

        # Always prepend or append the main text message
        if message:
            blocks.insert(0, ResponseBlockBuilder.text(message))

        return StructuredAgentResponse(
            status=status,
            message=message,
            blocks=blocks,
            tool_calls=[tool_call] if tool_call else [],
            integration_used=integration_used,
            execution_status=execution_status
        )
