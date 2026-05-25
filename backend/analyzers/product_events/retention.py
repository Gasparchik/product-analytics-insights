from datetime import timedelta
from typing import Any, Dict, List

import pandas as pd


def analyze(df: pd.DataFrame, mapping: Dict[str, Any]) -> Dict[str, Any]:
    """Compute D1/D3/D7/D14/D30 retention and weekly cohort heatmap (last 12 weeks)."""
    df = df.dropna(subset=["timestamp", "user_id"]).copy()
    df["_date"] = df["timestamp"].dt.date

    signup_event = mapping.get("signup_event")

    # Registration date per user — use signup_event if configured, else first event
    if signup_event:
        signup_df = df[df["event_name"] == signup_event]
        reg = signup_df.groupby("user_id")["_date"].min() if len(signup_df) > 0 else df.groupby("user_id")["_date"].min()
    else:
        reg = df.groupby("user_id")["_date"].min()

    # Precompute activity date sets per user (for fast O(1) lookups)
    user_dates: Dict = df.groupby("user_id")["_date"].apply(set).to_dict()

    # Overall D-N retention across all users
    day_ns = [1, 3, 7, 14, 30]
    total = len(reg)
    retention_rates: Dict[str, float] = {}
    for n in day_ns:
        if total == 0:
            retention_rates[f"d{n}"] = 0.0
            continue
        retained = sum(
            1 for u, reg_date in reg.items()
            if (reg_date + timedelta(days=n)) in user_dates.get(u, set())
        )
        retention_rates[f"d{n}"] = round(retained / total, 4)

    # Cohort heatmap: last 12 weeks
    max_date = df["_date"].max()
    twelve_weeks_ago = max_date - timedelta(weeks=12)

    reg_df = reg.reset_index()
    reg_df.columns = pd.Index(["user_id", "reg_date"])
    reg_df["cohort"] = pd.to_datetime(reg_df["reg_date"]).dt.to_period("W").astype(str)

    recent_reg = reg_df[reg_df["reg_date"] >= twelve_weeks_ago]
    cohorts = sorted(recent_reg["cohort"].unique())[-12:]

    heatmap: List[Dict[str, Any]] = []
    for cohort in cohorts:
        cohort_users = recent_reg[recent_reg["cohort"] == cohort].set_index("user_id")["reg_date"]
        cohort_size = len(cohort_users)
        if cohort_size == 0:
            continue
        row: Dict[str, Any] = {"cohort": cohort, "size": cohort_size}
        for n in day_ns:
            retained = sum(
                1 for u, reg_date in cohort_users.items()
                if (reg_date + timedelta(days=n)) in user_dates.get(u, set())
            )
            row[f"d{n}"] = round(retained / cohort_size, 4)
        heatmap.append(row)

    chart_specs = [
        {
            "chart_type": "line",
            "section": "Retention",
            "title": "Retention curve",
            "subtitle": "All users · D0 → D30",
            "data": [
                {"x": "D0",  "y": 100},
                {"x": "D1",  "y": round(retention_rates["d1"]  * 100)},
                {"x": "D3",  "y": round(retention_rates["d3"]  * 100)},
                {"x": "D7",  "y": round(retention_rates["d7"]  * 100)},
                {"x": "D14", "y": round(retention_rates["d14"] * 100)},
                {"x": "D30", "y": round(retention_rates["d30"] * 100)},
            ],
            "config": {"x_key": "x", "y_key": "y", "y_label": "Retention %", "format_y": "pct", "height": 220},
        },
        {
            "chart_type": "cohort_heatmap",
            "section": "Retention",
            "title": "Weekly retention by signup cohort",
            "subtitle": "Week of signup × days since signup",
            "data": heatmap,
            "config": {"col_labels": ["D1", "D3", "D7", "D14", "D30"], "height": 320},
        },
    ]

    return {**retention_rates, "cohort_heatmap": heatmap, "chart_specs": chart_specs}
