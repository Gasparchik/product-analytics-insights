"""
7 pandas-based product analytics tools for the Q&A agent.
Each tool function signature: (inp: dict, ctx: dict) -> dict
ctx keys: df (pd.DataFrame), source (dict), mapping (dict), analysis_run (dict)
"""
from __future__ import annotations

import json
from typing import Any

import pandas as pd


# ── Shared helpers ────────────────────────────────────────────────────────────

def _filter_by_time(df: pd.DataFrame, time_range: str) -> pd.DataFrame:
    if df.empty or "timestamp" not in df.columns:
        return df
    max_ts = df["timestamp"].max()
    if time_range == "last_7_days":
        return df[df["timestamp"] >= max_ts - pd.Timedelta(days=7)]
    if time_range == "last_30_days":
        return df[df["timestamp"] >= max_ts - pd.Timedelta(days=30)]
    return df  # all_time


def _apply_filters(df: pd.DataFrame, filters: dict[str, Any]) -> pd.DataFrame:
    for col, val in (filters or {}).items():
        if col in df.columns:
            df = df[df[col].astype(str) == str(val)]
    return df


def _ensure_date(df: pd.DataFrame) -> pd.DataFrame:
    if "_date" not in df.columns and "timestamp" in df.columns:
        df = df.copy()
        df["_date"] = df["timestamp"].dt.normalize()
    return df


def _build_retention_lookup(df: pd.DataFrame) -> tuple[dict, dict]:
    """Returns (first_seen {uid->date}, user_dates {uid->set[date]})."""
    df = _ensure_date(df)
    first_seen = df.groupby("user_id")["_date"].min().to_dict()
    user_dates = df.groupby("user_id")["_date"].apply(set).to_dict()
    return first_seen, user_dates


def _retention_rate(user_ids: set, first_seen: dict, user_dates: dict, day: int) -> float:
    if not user_ids:
        return 0.0
    offset = pd.Timedelta(days=day)
    retained = sum(
        1 for uid in user_ids
        if uid in user_dates and (first_seen.get(uid) + offset) in user_dates[uid]
    )
    return retained / len(user_ids)


def _fmt_pct(v: float) -> str:
    return f"{round(v * 100, 1)}%"


def _err(msg: str) -> dict:
    return {"success": False, "data": {}, "chart_spec": None, "error": msg}


# ── Tool 1: get_metric ────────────────────────────────────────────────────────

def get_metric(inp: dict, ctx: dict) -> dict:
    df = ctx["df"].copy()
    metric = inp.get("metric_name", "dau")
    time_range = inp.get("time_range", "all_time")
    filters = inp.get("filters", {})

    df = _filter_by_time(df, time_range)
    df = _apply_filters(df, filters)
    df = df.dropna(subset=["user_id", "timestamp"])

    if df.empty:
        return _err("No data after applying filters")

    df = _ensure_date(df)

    if metric == "dau":
        daily = df.groupby("_date")["user_id"].nunique().reset_index()
        daily.columns = ["date", "value"]
        val = int(daily["value"].iloc[-1]) if len(daily) else 0
        series = [{"x": str(r["date"]), "value": int(r["value"])} for _, r in daily.tail(60).iterrows()]
        return {
            "success": True,
            "data": {"metric": "dau", "value": val, "time_range": time_range, "unit": "users/day"},
            "chart_spec": {
                "chart_type": "line",
                "title": "Daily active users",
                "subtitle": time_range.replace("_", " "),
                "data": series,
                "config": {"x_key": "x", "y_key": "value", "format": "int"},
            },
        }

    if metric in ("mau", "wau"):
        val = int(df["user_id"].nunique())
        return {
            "success": True,
            "data": {"metric": metric, "value": val, "time_range": time_range, "unit": "users"},
            "chart_spec": None,
        }

    if metric in ("retention_d1", "retention_d7", "retention_d30"):
        day = int(metric.split("_d")[1])
        first_seen, user_dates = _build_retention_lookup(df)
        all_users = set(first_seen.keys())
        rate = _retention_rate(all_users, first_seen, user_dates, day)
        return {
            "success": True,
            "data": {"metric": metric, "value": round(rate * 100, 1), "unit": "%", "time_range": time_range},
            "chart_spec": None,
        }

    if metric == "avg_events_per_user":
        unique = df["user_id"].nunique()
        val = round(len(df) / unique, 2) if unique else 0
        return {
            "success": True,
            "data": {"metric": metric, "value": val, "time_range": time_range},
            "chart_spec": None,
        }

    return _err(f"Unknown metric: {metric}")


# ── Tool 2: compare_segments ─────────────────────────────────────────────────

def compare_segments(inp: dict, ctx: dict) -> dict:
    df = ctx["df"].copy().dropna(subset=["user_id", "timestamp"])
    metric = inp.get("metric", "user_count")
    segment_by = inp.get("segment_by", "")
    top_n = int(inp.get("top_n", 5))

    if not segment_by or segment_by not in df.columns:
        available = [c for c in df.columns if c not in ("user_id", "timestamp", "event_name", "_date")]
        return _err(f"Column '{segment_by}' not found. Available: {available[:10]}")

    df = _ensure_date(df)
    top_vals = df[segment_by].value_counts().head(top_n).index.tolist()

    needs_retention = metric.startswith("retention_")
    if needs_retention:
        day = int(metric.split("_d")[1])
        first_seen, user_dates = _build_retention_lookup(df)

    results = []
    for seg_val in top_vals:
        seg = df[df[segment_by].astype(str) == str(seg_val)]
        n_users = int(seg["user_id"].nunique())
        if n_users == 0:
            continue

        if metric == "dau":
            daily = seg.groupby("_date")["user_id"].nunique()
            m_val = float(daily.mean()) if len(daily) else 0
        elif metric == "avg_events_per_user":
            m_val = round(len(seg) / n_users, 2)
        elif needs_retention:
            seg_uids = set(seg["user_id"].unique())
            m_val = round(_retention_rate(seg_uids, first_seen, user_dates, day) * 100, 1)
        else:  # user_count
            m_val = n_users

        results.append({"label": str(seg_val), "value": round(float(m_val), 2), "users": n_users})

    if not results:
        return _err("No segment data found")

    results.sort(key=lambda x: x["value"], reverse=True)

    is_pct = needs_retention
    fmt = "pct" if is_pct else "float"
    unit = "%" if is_pct else ""

    return {
        "success": True,
        "data": {"metric": metric, "segment_by": segment_by, "segments": results},
        "chart_spec": {
            "chart_type": "hbar",
            "title": f"{metric.replace('_', ' ')} by {segment_by}",
            "subtitle": f"Top {len(results)} segments",
            "data": [{"label": r["label"], "value": r["value"]} for r in results],
            "config": {"accent_index": 0, "format": fmt, "unit": unit},
        },
    }


# ── Tool 3: build_funnel ─────────────────────────────────────────────────────

def build_funnel(inp: dict, ctx: dict) -> dict:
    df = ctx["df"].copy().dropna(subset=["user_id", "timestamp", "event_name"])
    event_sequence: list[str] = inp.get("event_sequence", [])
    time_window_days = int(inp.get("time_window_days", 7))

    if len(event_sequence) < 2:
        return _err("event_sequence must have at least 2 events")

    # Step 0: users who triggered first event
    first_ev_df = df[df["event_name"] == event_sequence[0]][["user_id", "timestamp"]]
    if first_ev_df.empty:
        return _err(f"No users found for first event '{event_sequence[0]}'")

    # Deduplicate to first occurrence per user
    first_ev_df = first_ev_df.sort_values("timestamp").drop_duplicates("user_id")
    top_of_funnel = len(first_ev_df)

    steps = [{"event": event_sequence[0], "users": top_of_funnel, "pct_from_start": 100.0, "pct_from_prev": 100.0}]
    current = first_ev_df.rename(columns={"timestamp": "ts_prev"})

    for i, event in enumerate(event_sequence[1:], 1):
        ev_df = df[df["event_name"] == event][["user_id", "timestamp"]].rename(columns={"timestamp": "ts_curr"})
        merged = current.merge(ev_df, on="user_id")
        delta = pd.Timedelta(days=time_window_days)
        merged = merged[(merged["ts_curr"] >= merged["ts_prev"]) & (merged["ts_curr"] <= merged["ts_prev"] + delta)]
        # Keep earliest valid occurrence per user for this step
        merged = merged.sort_values("ts_curr").drop_duplicates("user_id")

        n = len(merged)
        prev_n = steps[-1]["users"]
        steps.append({
            "event": event,
            "users": n,
            "pct_from_start": round(n / top_of_funnel * 100, 1) if top_of_funnel else 0,
            "pct_from_prev": round(n / prev_n * 100, 1) if prev_n else 0,
        })
        current = merged[["user_id", "ts_curr"]].rename(columns={"ts_curr": "ts_prev"})

    overall = steps[-1]["pct_from_start"]

    return {
        "success": True,
        "data": {"steps": steps, "overall_conversion_pct": overall, "time_window_days": time_window_days},
        "chart_spec": {
            "chart_type": "hbar",
            "title": f"Funnel: {event_sequence[0]} → {event_sequence[-1]}",
            "subtitle": f"Overall conversion: {overall}%",
            "data": [{"label": s["event"], "value": s["pct_from_start"]} for s in steps],
            "config": {"accent_index": 0, "format": "pct", "unit": "%"},
        },
    }


# ── Tool 4: get_cohort_retention ─────────────────────────────────────────────

def get_cohort_retention(inp: dict, ctx: dict) -> dict:
    df = ctx["df"].copy().dropna(subset=["user_id", "timestamp"])
    cohort_period = inp.get("cohort_period", "week")
    max_periods = int(inp.get("max_periods", 8))

    df = _ensure_date(df)
    if cohort_period == "week":
        df["_cohort_label"] = df["timestamp"].dt.to_period("W").astype(str)
    else:
        df["_cohort_label"] = df["timestamp"].dt.to_period("M").astype(str)

    first_seen_full = df.groupby("user_id").agg(
        cohort=("_cohort_label", "first"),
        first_date=("_date", "min"),
    )
    cohort_order = first_seen_full["cohort"].value_counts().sort_index().tail(max_periods).index.tolist()
    period_td = pd.Timedelta(days=7) if cohort_period == "week" else pd.Timedelta(days=30)
    user_dates_all = df.groupby("user_id")["_date"].apply(set).to_dict()

    rows = []
    for cohort in cohort_order:
        cohort_users = first_seen_full[first_seen_full["cohort"] == cohort]
        size = len(cohort_users)
        if size == 0:
            continue
        row: dict[str, Any] = {"cohort": cohort, "size": size, "p0": 100.0}
        for p in range(1, max_periods + 1):
            retained = sum(
                1 for uid, r in cohort_users.iterrows()
                if uid in user_dates_all and (r["first_date"] + period_td * p) in user_dates_all[uid]
            )
            row[f"p{p}"] = round(retained / size * 100, 1)
        rows.append(row)

    if not rows:
        return _err("Insufficient data for cohort analysis")

    summary = f"Best P1: {max(r.get('p1', 0) for r in rows):.1f}% | Worst P1: {min(r.get('p1', 0) for r in rows):.1f}%"

    return {
        "success": True,
        "data": {"cohort_period": cohort_period, "rows": rows, "periods": max_periods},
        "chart_spec": {
            "chart_type": "table",
            "title": f"Cohort retention by {cohort_period}",
            "subtitle": summary,
            "data": rows,
            "config": {},
        },
    }


# ── Tool 5: find_correlations ─────────────────────────────────────────────────

def find_correlations(inp: dict, ctx: dict) -> dict:
    df = ctx["df"].copy().dropna(subset=["user_id", "timestamp", "event_name"])
    target_metric = inp.get("target_metric", "retention_d7")
    candidate_events = inp.get("candidate_events") or []
    day = int(target_metric.split("_d")[-1]) if "_d" in target_metric else 7

    df = _ensure_date(df)
    first_seen, user_dates = _build_retention_lookup(df)
    all_users = set(first_seen.keys())
    baseline = _retention_rate(all_users, first_seen, user_dates, day)

    if not candidate_events:
        candidate_events = df["event_name"].value_counts().head(20).index.tolist()

    # Only look at events triggered in first 2 days of user's lifecycle
    early_df = df.copy()
    early_df["days_since_first"] = (
        early_df["_date"] - early_df["user_id"].map(first_seen)
    ).dt.days
    early_df = early_df[early_df["days_since_first"] <= 1]

    results = []
    for event in candidate_events:
        event_users = set(early_df[early_df["event_name"] == event]["user_id"].unique())
        if len(event_users) < 10:
            continue
        rate = _retention_rate(event_users, first_seen, user_dates, day)
        lift = round(rate / baseline, 2) if baseline > 0 else 0
        results.append({
            "event": event,
            "users_who_triggered": len(event_users),
            "retention_pct": round(rate * 100, 1),
            "baseline_pct": round(baseline * 100, 1),
            "lift": lift,
        })

    if not results:
        return _err("No candidate events with enough data to compute lift")

    results.sort(key=lambda x: x["lift"], reverse=True)
    results = results[:10]

    return {
        "success": True,
        "data": {
            "target": target_metric,
            "baseline_pct": round(baseline * 100, 1),
            "correlations": results,
        },
        "chart_spec": {
            "chart_type": "hbar",
            "title": f"Events correlated with {target_metric}",
            "subtitle": f"Baseline {target_metric}: {round(baseline * 100, 1)}% · lift = rate/baseline",
            "data": [{"label": r["event"], "value": r["lift"]} for r in results],
            "config": {"accent_index": 0, "format": "float", "unit": "x lift"},
        },
    }


# ── Tool 6: get_event_stats ───────────────────────────────────────────────────

def get_event_stats(inp: dict, ctx: dict) -> dict:
    df = ctx["df"].copy().dropna(subset=["user_id", "timestamp", "event_name"])
    event_name = inp.get("event_name", "")
    group_by = inp.get("group_by") or ""

    event_df = df[df["event_name"] == event_name]
    if event_df.empty:
        available = df["event_name"].value_counts().head(10).index.tolist()
        return _err(f"Event '{event_name}' not found. Available events: {available}")

    result: dict[str, Any] = {
        "event_name": event_name,
        "total_count": int(len(event_df)),
        "unique_users": int(event_df["user_id"].nunique()),
    }
    chart_spec = None

    if group_by and group_by in df.columns:
        breakdown = (
            event_df.groupby(group_by)
            .agg(count=("user_id", "count"), unique_users=("user_id", "nunique"))
            .reset_index()
            .sort_values("unique_users", ascending=False)
            .head(10)
        )
        result["breakdown_by"] = group_by
        result["breakdown"] = [
            {"label": str(row[group_by]), "count": int(row["count"]), "unique_users": int(row["unique_users"])}
            for _, row in breakdown.iterrows()
        ]
        chart_data = [{"label": str(row[group_by]), "value": int(row["unique_users"])} for _, row in breakdown.iterrows()]
        chart_spec = {
            "chart_type": "hbar",
            "title": f"'{event_name}' by {group_by}",
            "subtitle": f"{result['unique_users']:,} unique users total",
            "data": chart_data,
            "config": {"accent_index": 0, "format": "int"},
        }

    return {"success": True, "data": result, "chart_spec": chart_spec}


# ── Tool 7: compare_periods ───────────────────────────────────────────────────

def compare_periods(inp: dict, ctx: dict) -> dict:
    df = ctx["df"].copy().dropna(subset=["user_id", "timestamp"])
    metric = inp.get("metric", "dau")
    period_a = inp.get("period_a", "last_7_days")
    period_b = inp.get("period_b", "previous_7_days")

    max_ts = df["timestamp"].max()

    _period_map = {
        "last_7_days":     (max_ts - pd.Timedelta(days=7), max_ts),
        "last_14_days":    (max_ts - pd.Timedelta(days=14), max_ts),
        "last_30_days":    (max_ts - pd.Timedelta(days=30), max_ts),
        "previous_7_days": (max_ts - pd.Timedelta(days=14), max_ts - pd.Timedelta(days=7)),
        "previous_14_days":(max_ts - pd.Timedelta(days=28), max_ts - pd.Timedelta(days=14)),
        "previous_30_days":(max_ts - pd.Timedelta(days=60), max_ts - pd.Timedelta(days=30)),
    }

    if period_a not in _period_map or period_b not in _period_map:
        return _err(f"Unknown periods: {period_a}, {period_b}")

    def slice_df(p: str) -> pd.DataFrame:
        start, end = _period_map[p]
        return df[(df["timestamp"] >= start) & (df["timestamp"] <= end)]

    def compute(sub: pd.DataFrame) -> float:
        if sub.empty:
            return 0.0
        sub = _ensure_date(sub)
        if metric == "dau":
            return float(sub.groupby("_date")["user_id"].nunique().mean())
        if metric in ("mau", "wau", "user_count"):
            return float(sub["user_id"].nunique())
        if metric == "avg_events_per_user":
            u = sub["user_id"].nunique()
            return round(len(sub) / u, 2) if u else 0
        return float(sub["user_id"].nunique())

    val_a = compute(slice_df(period_a))
    val_b = compute(slice_df(period_b))
    pct_change = round((val_a - val_b) / val_b * 100, 1) if val_b else 0

    label_a = period_a.replace("_", " ")
    label_b = period_b.replace("_", " ")

    return {
        "success": True,
        "data": {
            "metric": metric,
            "period_a": {"label": label_a, "value": round(val_a, 2)},
            "period_b": {"label": label_b, "value": round(val_b, 2)},
            "pct_change": pct_change,
            "direction": "up" if pct_change > 0 else "down" if pct_change < 0 else "flat",
        },
        "chart_spec": {
            "chart_type": "hbar",
            "title": f"{metric.replace('_', ' ')} comparison",
            "subtitle": f"{pct_change:+.1f}% change",
            "data": [
                {"label": label_a, "value": round(val_a, 2)},
                {"label": label_b, "value": round(val_b, 2)},
            ],
            "config": {"accent_index": 0, "format": "float"},
        },
    }


# ── Registry ─────────────────────────────────────────────────────────────────

_HANDLERS: dict[str, Any] = {
    "get_metric": get_metric,
    "compare_segments": compare_segments,
    "build_funnel": build_funnel,
    "get_cohort_retention": get_cohort_retention,
    "find_correlations": find_correlations,
    "get_event_stats": get_event_stats,
    "compare_periods": compare_periods,
}

PRODUCT_TOOLS_FOR_CLAUDE = [
    {
        "name": "get_metric",
        "description": (
            "Get the current value of a key product metric, optionally filtered by user properties.\n\n"
            "Use when the user asks about: 'what's my DAU?', 'how is retention?', 'how many active users do I have?'\n\n"
            "Metrics: dau (daily active users), mau, wau, retention_d1/d7/d30 (% returning on day N), avg_events_per_user.\n"
            "Returns the scalar value. For dau/mau/wau also returns a daily time series line chart."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric_name": {
                    "type": "string",
                    "enum": ["dau", "mau", "wau", "retention_d1", "retention_d7", "retention_d30", "avg_events_per_user"],
                },
                "time_range": {
                    "type": "string",
                    "enum": ["last_7_days", "last_30_days", "all_time"],
                    "default": "all_time",
                },
                "filters": {
                    "type": "object",
                    "description": "Optional property column filters, e.g. {\"platform\": \"ios\"}",
                },
            },
            "required": ["metric_name"],
        },
    },
    {
        "name": "compare_segments",
        "description": (
            "Compare a metric across user segments defined by a property column.\n\n"
            "Use when the user asks: 'compare retention by platform', 'how does DAU differ by country?', "
            "'which plan type has the best engagement?'\n\n"
            "Returns a ranked list of segments with their metric value, plus a bar chart."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "enum": ["dau", "retention_d1", "retention_d7", "retention_d30", "avg_events_per_user", "user_count"],
                },
                "segment_by": {
                    "type": "string",
                    "description": "Property column to segment by (e.g. 'platform', 'country', 'plan')",
                },
                "top_n": {"type": "integer", "default": 5},
            },
            "required": ["metric", "segment_by"],
        },
    },
    {
        "name": "build_funnel",
        "description": (
            "Analyze conversion through an ordered sequence of events.\n\n"
            "Use when the user asks: 'show me the funnel from signup to purchase', "
            "'where do users drop off?', 'what's conversion from X to Y?'\n\n"
            "Provide 2+ event names in order. Returns step counts + conversion rates."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "event_sequence": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Ordered list of event names (at least 2)",
                    "minItems": 2,
                },
                "time_window_days": {
                    "type": "integer",
                    "default": 7,
                    "description": "Max days allowed between consecutive steps",
                },
            },
            "required": ["event_sequence"],
        },
    },
    {
        "name": "get_cohort_retention",
        "description": (
            "Get the cohort retention matrix — how different signup cohorts retain over time.\n\n"
            "Use when the user asks: 'show me cohort retention', "
            "'which signup cohort retains best?', 'how does retention vary by week?'\n\n"
            "Returns a matrix of retention rates by cohort × time period."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "cohort_period": {"type": "string", "enum": ["week", "month"], "default": "week"},
                "max_periods": {"type": "integer", "default": 8},
            },
        },
    },
    {
        "name": "find_correlations",
        "description": (
            "Find which events in a user's first 1-2 days correlate most strongly with later retention.\n\n"
            "Use when the user asks: 'what predicts retention?', 'which features do power users use?', "
            "'what events correlate with long-term engagement?', 'why are users churning?'\n\n"
            "Returns events ranked by lift factor (event_retention / baseline_retention)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "target_metric": {
                    "type": "string",
                    "enum": ["retention_d7", "retention_d30", "retention_d1"],
                    "default": "retention_d7",
                },
                "candidate_events": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional specific events to check. Defaults to top 20 by frequency.",
                },
            },
        },
    },
    {
        "name": "get_event_stats",
        "description": (
            "Get statistics for a specific event: frequency, unique users, optional property breakdown.\n\n"
            "Use when the user asks: 'how often does X happen?', 'how many users click Y?', "
            "'break down event Z by platform'\n\n"
            "Returns total count, unique users, and optional segmented breakdown."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "event_name": {"type": "string", "description": "Name of the event to analyze"},
                "group_by": {
                    "type": "string",
                    "description": "Optional property column for breakdown (e.g. 'platform', 'country')",
                },
            },
            "required": ["event_name"],
        },
    },
    {
        "name": "compare_periods",
        "description": (
            "Compare a metric between two time periods to understand trends.\n\n"
            "Use when the user asks: 'how did last week compare to the week before?', "
            "'has DAU improved recently?', 'show me week-over-week change'\n\n"
            "Returns both values and percentage change."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "metric": {
                    "type": "string",
                    "enum": ["dau", "mau", "wau", "avg_events_per_user", "user_count"],
                },
                "period_a": {
                    "type": "string",
                    "enum": ["last_7_days", "last_14_days", "last_30_days"],
                    "description": "More recent period",
                },
                "period_b": {
                    "type": "string",
                    "enum": ["previous_7_days", "previous_14_days", "previous_30_days"],
                    "description": "Comparison period",
                },
            },
            "required": ["metric", "period_a", "period_b"],
        },
    },
]
