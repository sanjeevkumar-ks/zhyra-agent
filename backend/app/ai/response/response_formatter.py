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
        blocks: List[ResponseBlock] = []
        execution_status = "completed"
        integration_used = None

        # Process tool execution details
        if tool_call:
            tool_name = tool_call.get("tool", "")
            method_name = tool_call.get("method", "")
            integration_used = tool_name

            if tool_result:
                is_success = tool_result.get("success", False)
                if is_success:
                    execution_status = "completed"
                    # calendar event block
                    if "calendar" in tool_name.lower() and "create" in method_lower(method_name):
                        blocks.append(ResponseBlockBuilder.calendar_event(
                            title=tool_result.get("title", "Event"),
                            date=tool_result.get("date", "Tomorrow"),
                            time=tool_result.get("time", "1:00 PM"),
                            status="created",
                            event_id=tool_result.get("event_id")
                        ))
                    # email block
                    elif "gmail" in tool_name.lower() and "send" in method_lower(method_name):
                        blocks.append(ResponseBlockBuilder.email(
                            to=tool_call.get("args", {}).get("to", ""),
                            subject=tool_call.get("args", {}).get("subject", ""),
                            status="sent"
                        ))
                    else:
                        blocks.append(ResponseBlockBuilder.confirmation(
                            message=f"Action '{method_name}' on '{tool_name}' executed successfully."
                        ))
                else:
                    # Tool failed
                    err_code = tool_result.get("error_code", "PROVIDER_ERROR")
                    execution_status = err_code.lower()
                    blocks.append(ResponseBlockBuilder.integration_error(
                        provider=tool_name,
                        status=err_code,
                        action=tool_result.get("action", "Reconnect Integration")
                    ))
            else:
                # Preflight or other check blocked execution
                blocks.append(ResponseBlockBuilder.integration_error(
                    provider=tool_name,
                    status="NOT_CONNECTED",
                    action="Connect Integration"
                ))
                execution_status = "not_connected"

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
