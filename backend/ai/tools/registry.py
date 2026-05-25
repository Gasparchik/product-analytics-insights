from typing import Any


def get_tools_for_claude(source_type: str = "product_events") -> list[dict]:
    """Return tool definitions in Anthropic API format (name, description, input_schema)."""
    from backend.ai.tools.product_tools import PRODUCT_TOOLS_FOR_CLAUDE
    return PRODUCT_TOOLS_FOR_CLAUDE


def execute_tool(tool_name: str, tool_input: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a tool call by name and return its result dict."""
    from backend.ai.tools.product_tools import _HANDLERS
    handler = _HANDLERS.get(tool_name)
    if handler is None:
        return {"success": False, "data": {}, "chart_spec": None, "error": f"Unknown tool: {tool_name}"}
    try:
        return handler(tool_input, context)
    except Exception as e:
        return {"success": False, "data": {}, "chart_spec": None, "error": str(e)}
