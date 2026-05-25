import json
import logging
import time
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException

from backend.models import QuestionCreate
from backend.storage import JSONStorage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/questions", tags=["questions"])

questions_storage = JSONStorage("questions")
sources_storage = JSONStorage("sources")
analyses_storage = JSONStorage("analyses")

_SYSTEM_PROMPT = """\
You are a senior product analyst helping a PM analyze their product data.

Dataset context: {total_users} MAU users, {period_days}-day period.
Top events in dataset: {top_events}
Property columns available for segmentation: {property_columns}

Use tools to answer the user's question. Choose 1-3 tools that directly address it.
Do NOT call the same tool twice with the same inputs.
Do NOT make up data — only use numbers from tool results.

After tools return, give a concise, specific answer:
- Lead with the direct answer (1-2 sentences with exact numbers)
- Add context/comparison if relevant
- Suggest 1 follow-up investigation if actionable

If the question is off-topic or the data cannot support a clear answer, say so directly without calling tools.
"""


def _summarize_tool_result(result: dict) -> str:
    """Convert tool result to a compact human-readable string for the tools accordion."""
    if not result.get("success"):
        return f"Error: {result.get('error', 'unknown')}"
    data = result.get("data", {})
    try:
        # Compact JSON, limit length
        s = json.dumps(data, default=str)
        if len(s) > 600:
            s = s[:600] + "…"
        return s
    except Exception:
        return str(data)[:400]


async def _run_agent(question_id: str, source_id: str, text: str) -> None:
    """Background task: run the Q&A agent loop and update the question record when done."""
    from backend.ai.client import call_claude
    from backend.ai.tools.registry import get_tools_for_claude, execute_tool
    from backend.analyzers.utils import load_dataframe

    # Load all context upfront
    source = sources_storage.get(source_id)
    if not source:
        _fail_question(question_id, "Source not found")
        return

    analysis_run = analyses_storage.get(source_id) or {}
    try:
        df = load_dataframe(source)
    except Exception as e:
        _fail_question(question_id, f"Failed to load data: {e}")
        return

    mapping = source.get("metadata", {}).get("mapping", {})
    context = {"df": df, "source": source, "mapping": mapping, "analysis_run": analysis_run}

    # Build system prompt context
    eng = next((r["data"] for r in analysis_run.get("results", []) if r["name"] == "engagement"), {})
    total_users = eng.get("mau") or df["user_id"].nunique()
    period_days = len(eng.get("dau_series", [])) or 30
    top_events = [e["event_name"] for e in (eng.get("top_events") or [])[:10]]
    if not top_events and "event_name" in df.columns:
        top_events = df["event_name"].value_counts().head(10).index.tolist()
    property_cols = [c for c in df.columns if c not in ("user_id", "timestamp", "event_name")]

    system = _SYSTEM_PROMPT.format(
        total_users=total_users,
        period_days=period_days,
        top_events=", ".join(top_events) if top_events else "N/A",
        property_columns=", ".join(property_cols[:15]) if property_cols else "none",
    )

    tools_for_claude = get_tools_for_claude()
    messages: list[dict] = [{"role": "user", "content": text}]

    tools_used: list[dict] = []
    charts: list[dict] = []
    answer_text = ""

    for iteration in range(6):
        try:
            response = await call_claude(messages=messages, system=system, tools=tools_for_claude)
        except Exception as e:
            logger.error("Claude API error on iteration %d: %s", iteration, e)
            _fail_question(question_id, f"Claude API error: {e}")
            return

        has_tool_use = any(block.type == "tool_use" for block in response.content)

        if not has_tool_use:
            # Final text answer
            answer_text = "\n\n".join(
                block.text for block in response.content if block.type == "text"
            ).strip()
            break

        # Execute all tool calls in this turn
        tool_results_for_claude: list[dict] = []
        for block in response.content:
            if block.type != "tool_use":
                continue

            t_start = time.time()
            result = execute_tool(block.name, block.input, context)
            duration_ms = int((time.time() - t_start) * 1000)

            tools_used.append({
                "name": block.name,
                "inputs": dict(block.input),
                "output": _summarize_tool_result(result),
                "duration_ms": duration_ms,
            })

            if result.get("chart_spec"):
                charts.append(result["chart_spec"])

            tool_results_for_claude.append({
                "type": "tool_result",
                "tool_use_id": block.id,
                "content": json.dumps(result.get("data", {}), default=str),
            })

        # Extend conversation
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results_for_claude})
    else:
        answer_text = "Analysis complete. See tool results above."

    # Persist completed question
    q = questions_storage.get(question_id)
    if q:
        q["status"] = "completed"
        q["answer_text"] = answer_text or "No answer generated."
        q["tools_used"] = tools_used
        q["charts"] = charts
        q["completed_at"] = datetime.utcnow().isoformat()
        questions_storage.save(q)
    logger.info("Question %s completed with %d tool calls", question_id, len(tools_used))


def _fail_question(question_id: str, error: str) -> None:
    q = questions_storage.get(question_id)
    if q:
        q["status"] = "error"
        q["error"] = error
        q["completed_at"] = datetime.utcnow().isoformat()
        questions_storage.save(q)


@router.post("/")
async def ask_question(payload: QuestionCreate, background_tasks: BackgroundTasks):
    source = sources_storage.get(payload.source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    q = {
        "id": str(uuid.uuid4()),
        "source_id": payload.source_id,
        "text": payload.text,
        "status": "processing",
        "answer_text": None,
        "tools_used": [],
        "charts": [],
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "error": None,
    }
    questions_storage.save(q)
    background_tasks.add_task(_run_agent, q["id"], payload.source_id, payload.text)
    return q


@router.get("/source/{source_id}")
async def list_questions_for_source(source_id: str):
    questions = questions_storage.find(source_id=source_id)
    questions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return questions


@router.get("/{question_id}")
async def get_question(question_id: str):
    q = questions_storage.get(question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return q
