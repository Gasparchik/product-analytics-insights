import json
import logging
import uuid
from datetime import datetime
from typing import Any

from backend.ai.client import call_claude

logger = logging.getLogger(__name__)

_SUBMIT_TOOL: dict[str, Any] = {
    "name": "submit_insights",
    "description": "Submit 3-5 product insights based on the analyzed data",
    "input_schema": {
        "type": "object",
        "properties": {
            "insights": {
                "type": "array",
                "minItems": 3,
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {
                            "type": "string",
                            "enum": [
                                "anomaly",
                                "segment_difference",
                                "correlation",
                                "funnel_drop",
                                "retention_pattern",
                                "engagement_pattern",
                            ],
                        },
                        "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                        "category": {
                            "type": "string",
                            "enum": ["Retention", "Engagement", "Funnel", "Acquisition", "Segmentation"],
                        },
                        "tags": {
                            "type": "array",
                            "items": {
                                "type": "string",
                                "enum": [
                                    "activation",
                                    "retention",
                                    "engagement",
                                    "funnel",
                                    "segmentation",
                                    "monetization",
                                    "onboarding",
                                    "churn_risk",
                                    "power_users",
                                    "mobile",
                                    "desktop",
                                ],
                            },
                        },
                        "title": {"type": "string", "maxLength": 80},
                        "description": {"type": "string"},
                        "metric_value": {
                            "type": "string",
                            "description": "Optional key metric to highlight (e.g. '-40%', '3.2x'). Only for the single most impactful number in this insight.",
                        },
                        "metric_label": {
                            "type": "string",
                            "description": "Label for metric_value (e.g. 'D3 retention vs desktop'). Required when metric_value is set.",
                        },
                    },
                    "required": ["type", "severity", "category", "tags", "title", "description"],
                },
            }
        },
        "required": ["insights"],
    },
}

_SYSTEM_PROMPT = """\
You are a senior product analyst helping a product manager understand their product data.
You analyze pre-computed metrics from product event data and generate 3-5 actionable insights.

Your insights MUST be:
- Specific: use exact numbers from the data (percentages, counts, ratios)
- Comparative: highlight gaps between segments, drops vs benchmarks, anomalies vs averages
- Actionable: tell the PM what to investigate or do next — not just what you see
- Diverse: cover different aspects (retention, engagement, funnel, segments) — not all on the same topic

Good insight examples:
- "D7 retention is 23% — if this dataset is a typical B2B SaaS product, this is ~12pp below the 35% median. The sharpest drop occurs between D1 (41%) and D3 (28%), pointing to onboarding failure before users reach the core value moment."
- "The top 10% of users by event count generate 58% of all events. These power users have 4x the avg session length. Understanding what they do differently in week 1 could unlock retention for the rest."
- "Overall funnel conversion from signup to first conversion event is 14%. The largest single drop is between step 2 and step 3 (−61%), which is the likely bottleneck for growth."

Bad insight examples (NEVER generate these):
- "DAU is 1,247." (no comparison, no action)
- "Many users come back." (vague)
- "Retention is good." (no specifics)
- "Users engage with events." (meaningless)

RULES:
- NEVER invent or extrapolate numbers not present in the data
- If a metric is null or missing, skip insights that depend on it
- If data is sparse (< 100 users), note this limitation explicitly
- Vary insight types — include at most 2 insights of the same category
- For metric_value, only provide it for the single most impactful numeric comparison in the insight
- Title must be under 80 chars, no exclamation marks, no vague words like "significant" or "interesting"
"""


def build_summary_for_llm(analysis_run: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    """Distill analyzer results into a compact JSON summary for Claude."""
    results_by_name = {r["name"]: r.get("data", {}) for r in analysis_run.get("results", [])}
    eng = results_by_name.get("engagement", {})
    ret = results_by_name.get("retention", {})
    fun = results_by_name.get("funnel", {})
    seg = results_by_name.get("segments", {})

    dau_series = eng.get("dau_series", [])
    period_days = len(dau_series)

    # 7-day trend direction
    recent_dau = [d["dau"] for d in dau_series[-7:]] if len(dau_series) >= 7 else [d["dau"] for d in dau_series]
    dau_trend = "stable"
    if len(recent_dau) >= 4:
        half = len(recent_dau) // 2
        first_avg = sum(recent_dau[:half]) / half
        second_avg = sum(recent_dau[half:]) / (len(recent_dau) - half)
        if second_avg > first_avg * 1.05:
            dau_trend = "growing"
        elif second_avg < first_avg * 0.95:
            dau_trend = "declining"

    top_events = eng.get("top_events", [])
    total_event_count = sum(e.get("count", 0) for e in top_events)

    summary: dict[str, Any] = {
        "dataset": {
            "total_users_mau": eng.get("mau"),
            "total_events_in_top10": total_event_count,
            "period_days": period_days,
        },
        "engagement": {
            "dau": eng.get("dau"),
            "wau": eng.get("wau"),
            "mau": eng.get("mau"),
            "dau_mau_stickiness": eng.get("stickiness_dau_mau"),
            "trend_last_7d": dau_trend,
            "new_users": eng.get("new_users"),
            "returning_users": eng.get("returning_users"),
            "new_user_pct": round(eng.get("new_pct", 0) * 100, 1) if eng.get("new_pct") is not None else None,
            "avg_events_per_user": eng.get("avg_events_per_user"),
            "avg_session_minutes": eng.get("avg_session_minutes"),
            "top_5_events": [
                {
                    "event": e["event_name"],
                    "count": e["count"],
                    "share_pct": round(e["count"] / total_event_count * 100, 1) if total_event_count else 0,
                }
                for e in top_events[:5]
            ],
        },
    }

    # Retention
    def pct(v: Any) -> float | None:
        if v is None:
            return None
        return round(float(v) * 100, 1)

    cohort_heatmap = ret.get("cohort_heatmap", [])
    best_cohort = worst_cohort = None
    if cohort_heatmap:
        valid = [c for c in cohort_heatmap if c.get("d7") is not None]
        if valid:
            best = max(valid, key=lambda x: x["d7"])
            worst = min(valid, key=lambda x: x["d7"])
            best_cohort = {"label": best["cohort"], "d7_retention_pct": pct(best["d7"]), "size": best["size"]}
            worst_cohort = {"label": worst["cohort"], "d7_retention_pct": pct(worst["d7"]), "size": worst["size"]}

    summary["retention"] = {
        "d1_pct": pct(ret.get("d1")),
        "d3_pct": pct(ret.get("d3")),
        "d7_pct": pct(ret.get("d7")),
        "d14_pct": pct(ret.get("d14")),
        "d30_pct": pct(ret.get("d30")),
        "best_cohort_by_d7": best_cohort,
        "worst_cohort_by_d7": worst_cohort,
    }

    # Funnel
    if not fun.get("skipped"):
        steps = fun.get("steps", [])
        # find biggest drop
        biggest_drop = None
        for i in range(1, len(steps)):
            prev_users = steps[i - 1].get("users", 0)
            curr_users = steps[i].get("users", 0)
            if prev_users > 0:
                drop_pct = round((prev_users - curr_users) / prev_users * 100, 1)
                if biggest_drop is None or drop_pct > biggest_drop["drop_pct"]:
                    biggest_drop = {
                        "from_step": steps[i - 1].get("event"),
                        "to_step": steps[i].get("event"),
                        "drop_pct": drop_pct,
                    }
        summary["funnel"] = {
            "steps": [
                {"event": s.get("event"), "users": s.get("users"), "conversion_pct": round(s.get("pct", 0) * 100, 1)}
                for s in steps
            ],
            "overall_conversion_pct": round(fun.get("overall_conversion", 0) * 100, 1),
            "biggest_drop": biggest_drop,
        }

    # Segments (including per-segment D7 retention if available)
    if not seg.get("skipped"):
        seg_data = []
        for prop in seg.get("properties", [])[:3]:
            seg_data.append({
                "property": prop["property"],
                "top_values": [
                    {
                        "value": v["value"],
                        "users": v["users"],
                        "share_pct": round(v.get("pct", 0) * 100, 1),
                        **({"d7_retention_pct": v["d7_retention_pct"]}
                           if v.get("d7_retention_pct") is not None else {}),
                    }
                    for v in prop.get("top_values", [])[:4]
                ],
            })
        if seg_data:
            summary["segments"] = seg_data

    # Activation funnel from top_events unique_users (multi-step, not just signup→conversion)
    top_events_list = eng.get("top_events", [])
    event_users_map = {e["event_name"]: e.get("unique_users", 0) for e in top_events_list}
    signup_u = event_users_map.get("signup", 0)
    if signup_u > 0:
        funnel_order = ["signup", "project_created", "task_created", "task_completed",
                        "subscription_started"]
        activation_steps = []
        for ev in funnel_order:
            if ev in event_users_map:
                u = event_users_map[ev]
                activation_steps.append({
                    "event": ev,
                    "unique_users": u,
                    "pct_of_signups": round(u / signup_u * 100, 1),
                })
        if len(activation_steps) >= 2:
            summary["activation_funnel"] = activation_steps

    return summary


async def generate_insights(analysis_run: dict[str, Any], source: dict[str, Any]) -> list[dict[str, Any]]:
    """Call Claude with the analysis summary and return a list of insight dicts."""
    source_id = source["id"]
    summary = build_summary_for_llm(analysis_run, source)

    user_msg = (
        f"Here is the analysis of a product dataset "
        f"({summary['dataset'].get('total_users_mau', '?')} MAU users, "
        f"{summary['dataset'].get('period_days', '?')} days):\n\n"
        f"{json.dumps(summary, indent=2)}\n\n"
        "Generate 3-5 insights using the submit_insights tool. "
        "Focus on the most actionable patterns. "
        "Vary the insight types — don't repeat the same category more than twice."
    )

    response = await call_claude(
        messages=[{"role": "user", "content": user_msg}],
        system=_SYSTEM_PROMPT,
        tools=[_SUBMIT_TOOL],
        tool_choice={"type": "tool", "name": "submit_insights"},
    )

    # Extract tool_use block
    tool_result = next(
        (block for block in response.content if block.type == "tool_use"),
        None,
    )
    if not tool_result:
        logger.error("Claude did not return a tool_use block. Stop reason: %s", response.stop_reason)
        return []

    raw_insights: list[dict[str, Any]] = tool_result.input.get("insights", [])
    now_iso = datetime.utcnow().isoformat()

    insights_out = []
    for raw in raw_insights:
        metric_value = raw.get("metric_value")
        metric_label = raw.get("metric_label")
        metrics: dict[str, Any] = {}
        if metric_value:
            metrics["metric_value"] = metric_value
        if metric_label:
            metrics["metric_label"] = metric_label

        insights_out.append({
            "id": str(uuid.uuid4()),
            "source_id": source_id,
            "type": raw.get("type", "anomaly"),
            "category": raw.get("category", "Engagement"),
            "title": raw.get("title", ""),
            "description": raw.get("description", ""),
            "metrics": metrics,
            "tags": raw.get("tags", []),
            "severity": raw.get("severity", "medium"),
            "created_at": now_iso,
        })

    # Sort high → medium → low
    severity_order = {"high": 0, "medium": 1, "low": 2}
    insights_out.sort(key=lambda x: severity_order.get(x["severity"], 1))
    return insights_out
