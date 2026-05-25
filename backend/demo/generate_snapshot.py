"""CLI script to generate demo/snapshot.json with pre-computed AI results.

Run once locally (costs your Anthropic tokens). The snapshot is committed to the
repo so the public demo never calls Claude at runtime.

Usage:
    python -m backend.demo.generate_snapshot           # generate and save
    python -m backend.demo.generate_snapshot --review  # print without saving
"""

import argparse
import asyncio
import json
import sys
import time
import uuid
from datetime import datetime
from pathlib import Path

# Add project root to path so imports work when run directly
ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

SNAPSHOT_PATH = Path(__file__).parent / "snapshot.json"
DEMO_SOURCE_ID = "demo"

QUESTIONS = [
    "Why is retention low for Google Ads users?",
    "What predicts paid conversion?",
    "Show me the signup funnel",
    "Compare retention by platform",
    "What do power users have in common?",
    "Did anything unusual happen with daily active users?",
]


def _summarize_tool_result(result: dict) -> str:
    if not result.get("success"):
        return f"Error: {result.get('error', 'unknown')}"
    data = result.get("data", {})
    try:
        s = json.dumps(data, default=str)
        return s[:600] + "…" if len(s) > 600 else s
    except Exception:
        return str(data)[:400]


async def _generate_insights(analysis_run: dict, source: dict) -> list[dict]:
    from backend.ai.insights_generator import generate_insights
    print("\n[...] Generating insights via Claude...")
    insights = await generate_insights(analysis_run, source)
    print(f"   -> {len(insights)} insights generated")
    return insights


async def _answer_question(text: str, source: dict, analysis_run: dict) -> dict:
    import time as _time
    from backend.ai.client import call_claude
    from backend.ai.tools.registry import get_tools_for_claude, execute_tool
    from backend.analyzers.utils import load_dataframe

    df = load_dataframe(source)
    mapping = source.get("metadata", {}).get("mapping", {})
    context = {"df": df, "source": source, "mapping": mapping, "analysis_run": analysis_run}

    eng = next((r["data"] for r in analysis_run.get("results", []) if r["name"] == "engagement"), {})
    total_users = eng.get("mau") or df["user_id"].nunique()
    period_days = len(eng.get("dau_series", [])) or 30
    top_events = [e["event_name"] for e in (eng.get("top_events") or [])[:10]]
    if not top_events and "event_name" in df.columns:
        top_events = df["event_name"].value_counts().head(10).index.tolist()
    property_cols = [c for c in df.columns if c not in ("user_id", "timestamp", "event_name")]

    system = (
        "You are a senior product analyst helping a PM analyze their product data.\n\n"
        f"Dataset context: {total_users} MAU users, {period_days}-day period.\n"
        f"Top events in dataset: {', '.join(top_events) if top_events else 'N/A'}\n"
        f"Property columns available for segmentation: {', '.join(property_cols[:15]) if property_cols else 'none'}\n\n"
        "Use tools to answer the user's question. Choose 1-3 tools that directly address it.\n"
        "Do NOT call the same tool twice with the same inputs.\n"
        "Do NOT make up data — only use numbers from tool results.\n\n"
        "After tools return, give a concise, specific answer:\n"
        "- Lead with the direct answer (1-2 sentences with exact numbers)\n"
        "- Add context/comparison if relevant\n"
        "- Suggest 1 follow-up investigation if actionable"
    )

    tools_for_claude = get_tools_for_claude()
    messages: list[dict] = [{"role": "user", "content": text}]
    tools_used: list[dict] = []
    charts: list[dict] = []
    answer_text = ""

    for _ in range(6):
        response = await call_claude(messages=messages, system=system, tools=tools_for_claude)
        has_tool_use = any(block.type == "tool_use" for block in response.content)

        if not has_tool_use:
            answer_text = "\n\n".join(
                block.text for block in response.content if block.type == "text"
            ).strip()
            break

        tool_results_for_claude: list[dict] = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            t_start = _time.time()
            result = execute_tool(block.name, block.input, context)
            duration_ms = int((_time.time() - t_start) * 1000)
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

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results_for_claude})
    else:
        answer_text = "Analysis complete. See tool results above."

    return {
        "question": text,
        "answer_markdown": answer_text,
        "tools_used": tools_used,
        "charts": charts,
    }


async def run(review_only: bool) -> None:
    from backend.storage import JSONStorage
    from backend.analyzers.utils import load_dataframe
    from backend.analyzers.product_events import engagement, retention, funnel, segments
    from concurrent.futures import ThreadPoolExecutor
    import asyncio as _asyncio

    sources_storage = JSONStorage("sources")
    analyses_storage = JSONStorage("analyses")

    source = sources_storage.get(DEMO_SOURCE_ID)
    if not source:
        print("[ERROR] Demo source not found. Open the app, click 'Try demo' once, then re-run this script.")
        sys.exit(1)

    print(f"[OK] Found demo source: {source.get('name')} ({source.get('id')})")

    # Load or run analysis
    analysis_run = analyses_storage.get(DEMO_SOURCE_ID)
    if not analysis_run:
        print("[...] Running analyzers on demo dataset...")
        df = load_dataframe(source)
        mapping = source.get("metadata", {}).get("mapping", {})

        def _run_sync(name, fn):
            try:
                result = fn(df, mapping)
                chart_specs = result.pop("chart_specs", [])
                return {"name": name, "data": result, "chart_specs": chart_specs, "error": None}
            except Exception as e:
                return {"name": name, "data": {}, "chart_specs": [], "error": str(e)}

        executor = ThreadPoolExecutor(max_workers=4)
        loop = _asyncio.get_event_loop()
        tasks = [
            loop.run_in_executor(executor, _run_sync, name, fn)
            for name, fn in [
                ("engagement", engagement.analyze),
                ("retention", retention.analyze),
                ("funnel", funnel.analyze),
                ("segments", segments.analyze),
            ]
        ]
        results = list(await _asyncio.gather(*tasks))
        analysis_run = {
            "id": DEMO_SOURCE_ID,
            "source_id": DEMO_SOURCE_ID,
            "status": "done",
            "results": results,
        }
        analyses_storage.save(analysis_run)
        print("   → Analyzers done")

    # Generate insights
    insights = await _generate_insights(analysis_run, source)

    print("\n--- INSIGHTS ---")
    for i, ins in enumerate(insights, 1):
        title = ins['title'].encode('ascii', 'replace').decode('ascii')
        desc = ins['description'][:200].encode('ascii', 'replace').decode('ascii')
        print(f"\n[{i}] [{ins['severity'].upper()}] {title}")
        print(f"    {desc}...")
        if ins.get("metrics", {}).get("metric_value"):
            mv = str(ins['metrics']['metric_value']).encode('ascii', 'replace').decode('ascii')
            ml = str(ins['metrics'].get('metric_label', '')).encode('ascii', 'replace').decode('ascii')
            print(f"    Metric: {mv} -- {ml}")

    # Generate Q&A
    qna = []
    print(f"\n--- Q&A ({len(QUESTIONS)} questions) ---")
    for question in QUESTIONS:
        print(f"\n[Q] {question}")
        entry = await _answer_question(question, source, analysis_run)
        qna.append(entry)
        print(f"   Tools used: {[t['name'] for t in entry['tools_used']]}")
        preview = entry['answer_markdown'][:300].encode('ascii', 'replace').decode('ascii')
        print(f"   Answer preview: {preview}...")
        # Small delay to avoid rate limits
        await asyncio.sleep(2)

    snapshot = {
        "dataset_version": "taskflow-v1",
        "generated_at": datetime.utcnow().isoformat(),
        "insights": insights,
        "qna": qna,
    }

    if review_only:
        print("\n\n[DONE] Review complete. Run without --review to save snapshot.json.")
        return

    SNAPSHOT_PATH.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"\n[SAVED] {SNAPSHOT_PATH}")
    print(f"        {len(insights)} insights, {len(qna)} Q&A entries")
    print("\nNow review snapshot.json, edit if needed, then commit it.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate demo snapshot")
    parser.add_argument("--review", action="store_true", help="Print results without saving")
    args = parser.parse_args()
    asyncio.run(run(review_only=args.review))
