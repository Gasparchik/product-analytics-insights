import calendar
from datetime import timedelta
from typing import Any, Dict, List

import pandas as pd

from backend.analyzers.utils import sessionize


def _month_last_day(ym: str) -> str:
    year, month = int(ym[:4]), int(ym[5:7])
    return f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"


def analyze(df: pd.DataFrame, mapping: Dict[str, Any]) -> Dict[str, Any]:
    """Compute engagement metrics: DAU/WAU/MAU, new vs returning, top events, session stats."""
    df = df.dropna(subset=["timestamp", "user_id"]).copy()
    df["_date"] = df["timestamp"].dt.date

    max_date = df["_date"].max()

    # DAU / WAU / MAU
    dau_df = df[df["_date"] == max_date]
    dau = int(dau_df["user_id"].nunique())
    wau = int(df[df["_date"] >= (max_date - timedelta(days=6))]["user_id"].nunique())
    mau = int(df[df["_date"] >= (max_date - timedelta(days=29))]["user_id"].nunique())
    stickiness = round(dau / mau, 4) if mau > 0 else 0.0

    # New vs returning on the last day
    first_seen = df.groupby("user_id")["_date"].min().to_dict()
    active_today = set(dau_df["user_id"].unique())
    new_users = int(sum(1 for u in active_today if first_seen.get(u) == max_date))
    returning_users = int(len(active_today) - new_users)
    new_pct = round(new_users / len(active_today), 4) if active_today else 0.0

    # Top 10 events by count
    top_events: List[Dict] = (
        df.groupby("event_name")
        .agg(count=("event_name", "count"), unique_users=("user_id", "nunique"))
        .reset_index()
        .sort_values("count", ascending=False)
        .head(10)
        .assign(
            count=lambda x: x["count"].astype(int),
            unique_users=lambda x: x["unique_users"].astype(int),
        )
        .to_dict(orient="records")
    )

    # Avg events per user (across full dataset)
    avg_events_per_user = round(float(df.groupby("user_id").size().mean()), 2)

    # Session metrics
    sdf = sessionize(df[["user_id", "timestamp"]].copy())
    sess_bounds = sdf.groupby(["user_id", "session_id"])["timestamp"].agg(["min", "max"])
    durations_min = (sess_bounds["max"] - sess_bounds["min"]).dt.total_seconds() / 60
    avg_session_minutes = round(float(durations_min.mean()), 2) if len(durations_min) > 0 else 0.0
    total_sessions = int(len(sess_bounds))

    # DAU time series
    dau_series = (
        df.groupby("_date")["user_id"]
        .nunique()
        .reset_index()
        .rename(columns={"user_id": "dau", "_date": "date"})
        .assign(date=lambda x: x["date"].astype(str))
        .to_dict(orient="records")
    )

    # MAU time series — unique users per calendar month, x = last day of month
    df["_month"] = df["_date"].apply(lambda d: str(d)[:7])
    mau_monthly = (
        df.groupby("_month")["user_id"]
        .nunique()
        .reset_index()
        .rename(columns={"user_id": "mau", "_month": "month"})
    )
    mau_monthly["date"] = mau_monthly["month"].apply(_month_last_day)
    mau_series = mau_monthly[["date", "mau"]].to_dict(orient="records")

    # New vs returning time series (daily)
    first_seen_s = df.groupby("user_id")["_date"].min().rename("first_seen")
    df2 = df.merge(first_seen_s.reset_index(), on="user_id")
    df2["is_new"] = df2["_date"] == df2["first_seen"]
    nvr_pivot = (
        df2.groupby(["_date", "is_new"])["user_id"]
        .nunique()
        .unstack(fill_value=0)
        .reset_index()
    )
    nvr_records = []
    for _, row in nvr_pivot.iterrows():
        nvr_records.append({
            "date": str(row["_date"]),
            "new": int(row.get(True, 0)),
            "returning": int(row.get(False, 0)),
        })

    # Daily event counts for each top event (drill-down)
    event_series: Dict[str, List[Dict]] = {}
    for evt_row in top_events:
        ename = evt_row["event_name"]
        ts_df = (
            df[df["event_name"] == ename]
            .groupby("_date")
            .size()
            .reset_index(name="count")
        )
        event_series[ename] = [
            {"date": str(r["_date"]), "count": int(r["count"])}
            for _, r in ts_df.iterrows()
        ]

    chart_specs = [
        {
            "chart_type": "line",
            "section": "Engagement",
            "title": "Active users",
            "data": [{"x": d["date"], "y": d["dau"]} for d in dau_series],
            "config": {
                "x_key": "x",
                "y_key": "y",
                "y_label": "Users",
                "granularity": True,
                "metric_toggle": [
                    {"key": "dau", "label": "DAU"},
                    {"key": "mau", "label": "MAU"},
                ],
                "mau_data": [{"x": m["date"], "y": m["mau"]} for m in mau_series],
            },
        },
        {
            "chart_type": "stacked_bar",
            "section": "Engagement",
            "title": "New vs returning users",
            "data": nvr_records,
            "config": {
                "x_key": "date",
                "stacks": [
                    {"key": "returning", "label": "Returning"},
                    {"key": "new", "label": "New", "accent": True},
                ],
                "granularity": True,
            },
        },
        {
            "chart_type": "hbar",
            "section": "Engagement",
            "title": "Top 10 events",
            "subtitle": "Share of all events · click a row to see its trend",
            "data": [{"label": e["event_name"], "value": e["count"]} for e in top_events],
            "config": {"accent_index": 0, "event_series": event_series},
        },
    ]

    return {
        "dau": dau,
        "wau": wau,
        "mau": mau,
        "stickiness_dau_mau": stickiness,
        "new_users": new_users,
        "returning_users": returning_users,
        "new_pct": new_pct,
        "avg_events_per_user": avg_events_per_user,
        "avg_session_minutes": avg_session_minutes,
        "total_sessions": total_sessions,
        "top_events": top_events,
        "dau_series": dau_series,
        "new_returning_series": nvr_records,
        "chart_specs": chart_specs,
    }
