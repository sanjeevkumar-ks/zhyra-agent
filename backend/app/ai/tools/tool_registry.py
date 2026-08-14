from app.services.tool_executor import ToolExecutor
from app.utils.logger import log_info, log_error

class ToolRegistry:
    @staticmethod
    async def execute_tool(workspace_id: str, tool_name: str, method_name: str, args: dict) -> str:
        """
        Delegates tool execution to the existing backend ToolExecutor.
        """
        try:
            return await ToolExecutor.execute(workspace_id, tool_name, method_name, args)
        except Exception as e:
            log_error(f"ToolRegistry failed to execute tool {tool_name}.{method_name}", exc=e)
            return f"Error executing tool {tool_name}.{method_name}: {str(e)}"
