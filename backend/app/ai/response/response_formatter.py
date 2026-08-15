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
        status: str = "success"
    ) -> StructuredAgentResponse:
        """
        Formats final LLM agent response and tool execution outcome 
        into a structured response with Pydantic block nodes.
        """
        if message is None:
            message = ""

        blocks: List[ResponseBlock] = []
        execution_status = "completed"
        integration_used = None

        if tool_result or tool_call:
            res_dict = tool_result or {}
            is_success = res_dict.get("success", True)
            integration_used = res_dict.get("integration") or (tool_call.get("tool") if tool_call else "GoogleCalendar")
            tool_name = res_dict.get("tool") or (tool_call.get("method") if tool_call else "createEvent")
            
            data_res = res_dict.get("data", res_dict)
            if not isinstance(data_res, dict):
                data_res = {}

            if is_success:
                execution_status = "completed"
                if "calendar" in str(integration_used).lower() or "gcal" in str(integration_used).lower() or "event" in str(tool_name).lower():
                    title = data_res.get("title") or res_dict.get("title") or "Investor Meeting"
                    start = data_res.get("start_time") or res_dict.get("start_time") or res_dict.get("start", "")
                    event_id = data_res.get("event_id") or res_dict.get("event_id", "")
                    blocks.append(ResponseBlockBuilder.calendar_event(
                        title=title,
                        date=start,
                        time=start,
                        status="created" if "create" in str(tool_name).lower() else "active",
                        event_id=event_id
                    ))
                elif "gmail" in str(integration_used).lower() or "email" in str(tool_name).lower():
                    blocks.append(ResponseBlockBuilder.email(
                        to=data_res.get("to") or (tool_call.get("args", {}).get("to", "") if tool_call else ""),
                        subject=data_res.get("subject") or (tool_call.get("args", {}).get("subject", "") if tool_call else ""),
                        status="sent"
                    ))
            else:
                err_code = res_dict.get("error_code", "PROVIDER_ERROR")
                execution_status = err_code.lower()
                blocks.append(ResponseBlockBuilder.integration_error(
                    provider=str(integration_used),
                    status=err_code,
                    action=res_dict.get("action", "Reconnect Integration")
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

def method_lower(method: Any) -> str:
    if not method:
        return ""
    return str(method).lower()
