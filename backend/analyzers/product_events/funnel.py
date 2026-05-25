from typing import Any, Dict, List

import pandas as pd


def _skipped(reason: str, available_events: List[str] | None = None) -> Dict[str, Any]:
    config: Dict[str, Any] = {}
    if available_events is not None:
        config["available_events"] = available_events
    return {
        "skipped": True,
        "reason": reason,
        "chart_specs": [
            {
                "chart_type": "funnel_skipped",
                "section": "Funnel",
                "title": "Funnel",
                "data": {"reason": reason},
                "config": config,
            }
        ],
    }


def analyze(df: pd.DataFrame, mapping: Dict[str, Any]) -> Dict[str, Any]:
    """Compute an N-step funnel.

    Steps source (priority order):
      1. mapping["funnel_steps"] — explicit list of event names from the UI.
      2. mapping["signup_event"] + mapping["conversion_event"] — legacy 2-step funnel.
      3. Auto: top-4 most frequent events in the dataset.

    Window: mapping["funnel_window_days"] (default 7). Each subsequent step must
    occur within `window_days` days *after* the previous step for the same user.
    """
    if df.empty or "event_name" not in df.columns:
        return _skipped("No event data available", available_events=[])

    df = df.dropna(subset=["timestamp", "user_id", "event_name"]).copy()
    if df.empty:
        return _skipped("No event data available", available_events=[])

    available_events = df["event_name"].value_counts().head(50).index.tolist()

    steps = mapping.get("funnel_steps")
    if not steps:
        signup = mapping.get("signup_event")
        conversion = mapping.get("conversion_event")
        if signup and conversion:
            steps = [signup, conversion]
        else:
            steps = available_events[:4]

    steps = [s for s in (steps or []) if s]
    if len(steps) < 2:
        return _skipped("Need at least 2 steps to compute a funnel", available_events=available_events)

    try:
        window_days = int(mapping.get("funnel_window_days", 7))
    except (TypeError, ValueError):
        window_days = 7
    window_days = max(1, window_days)
    window = pd.Timedelta(days=window_days)

    step_counts: List[int] = []
    current = pd.DataFrame(columns=["user_id", "step_ts"])

    for i, event in enumerate(steps):
        ev_df = df[df["event_name"] == event][["user_id", "timestamp"]]
        if ev_df.empty:
            step_counts.append(0)
            current = pd.DataFrame(columns=["user_id", "step_ts"])
            continue

        if i == 0:
            current = (
                ev_df.groupby("user_id")["timestamp"]
                .min()
                .reset_index()
                .rename(columns={"timestamp": "step_ts"})
            )
        else:
            if current.empty:
                step_counts.append(0)
                continue
            merged = current.merge(ev_df, on="user_id", how="inner")
            merged = merged[
                (merged["timestamp"] > merged["step_ts"])
                & (merged["timestamp"] <= merged["step_ts"] + window)
            ]
            current = (
                merged.groupby("user_id")["timestamp"]
                .min()
                .reset_index()
                .rename(columns={"timestamp": "step_ts"})
            )

        step_counts.append(len(current))

    first_count = step_counts[0] if step_counts else 0
    last_count = step_counts[-1] if step_counts else 0

    steps_data: List[Dict[str, Any]] = []
    for i, (event, count) in enumerate(zip(steps, step_counts)):
        pct_of_first = (count / first_count) if first_count > 0 else 0.0
        pct_of_prev = (count / step_counts[i - 1]) if i > 0 and step_counts[i - 1] > 0 else 1.0
        steps_data.append(
            {
                "event": event,
                "users": count,
                "pct_of_first": round(pct_of_first, 4),
                "pct_of_prev": round(pct_of_prev, 4),
            }
        )

    overall_conversion = (last_count / first_count) if first_count > 0 else 0.0
    users_dropped = max(0, first_count - last_count)

    biggest_drop_pct = 0.0
    biggest_drop_step = ""
    for i in range(1, len(steps)):
        prev = step_counts[i - 1]
        cur = step_counts[i]
        if prev <= 0:
            continue
        drop = (prev - cur) / prev
        if drop > biggest_drop_pct:
            biggest_drop_pct = drop
            biggest_drop_step = steps[i]

    title = f"{steps[0]} → {steps[-1]}"
    subtitle = f"{first_count:,} users entered · {window_days}d window"

    return {
        "steps": steps_data,
        "overall_conversion": round(overall_conversion, 4),
        "users_dropped": users_dropped,
        "biggest_drop_pct": round(biggest_drop_pct, 4),
        "biggest_drop_step": biggest_drop_step,
        "window_days": window_days,
        "chart_specs": [
            {
                "chart_type": "funnel",
                "section": "Funnel",
                "title": title,
                "subtitle": subtitle,
                "data": [
                    {
                        "label": s["event"],
                        "users": s["users"],
                        "pct_of_first": s["pct_of_first"],
                        "pct_of_prev": s["pct_of_prev"],
                    }
                    for s in steps_data
                ],
                "config": {
                    "window_days": window_days,
                    "overall_conversion": round(overall_conversion, 4),
                    "users_dropped": users_dropped,
                    "biggest_drop_pct": round(biggest_drop_pct, 4),
                    "biggest_drop_step": biggest_drop_step,
                    "available_events": available_events,
                    "steps": steps,
                    "first_step_users": first_count,
                },
            }
        ],
    }
