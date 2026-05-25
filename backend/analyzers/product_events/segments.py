from datetime import timedelta
from typing import Any, Dict, List

import pandas as pd


def analyze(df: pd.DataFrame, mapping: Dict[str, Any]) -> Dict[str, Any]:
    """Break down key metrics by property columns. Skipped if no properties configured."""
    properties_str = mapping.get("properties", "") or ""
    if not properties_str.strip():
        return {"skipped": True, "reason": "No property columns configured", "chart_specs": []}

    property_cols = [p.strip() for p in properties_str.split(",") if p.strip()]
    property_cols = [c for c in property_cols if c in df.columns]

    if not property_cols:
        return {"skipped": True, "reason": "Configured properties not found in dataset columns", "chart_specs": []}

    df = df.dropna(subset=["user_id"]).copy()
    total_users = df["user_id"].nunique()

    # Precompute D7 retention lookup
    df["_date"] = df["timestamp"].dt.date
    signup_event = mapping.get("signup_event")
    if signup_event and signup_event in df["event_name"].values:
        reg_df = df[df["event_name"] == signup_event]
    else:
        reg_df = df
    first_seen: Dict = reg_df.groupby("user_id")["_date"].min().to_dict()
    user_dates: Dict = df.groupby("user_id")["_date"].apply(set).to_dict()

    def d7_retention(user_ids) -> float | None:
        if len(user_ids) < 30:
            return None
        retained = sum(
            1 for u in user_ids
            if u in first_seen and (first_seen[u] + timedelta(days=7)) in user_dates.get(u, set())
        )
        return round(retained / len(user_ids) * 100, 1)

    # Property that joins per user (first non-null value across all events)
    user_prop_cache: Dict[str, Any] = {}

    results: List[Dict[str, Any]] = []
    for prop in property_cols:
        val_stats = (
            df.dropna(subset=[prop])
            .groupby(prop)
            .agg(users=("user_id", "nunique"), events=("event_name", "count"))
            .reset_index()
            .sort_values("users", ascending=False)
            .head(5)
        )

        # Cache user→property mapping
        if prop not in user_prop_cache:
            user_prop_cache[prop] = (
                df.dropna(subset=[prop]).groupby("user_id")[prop].first()
            )
        user_prop = user_prop_cache[prop]

        users_with_prop = int(df.dropna(subset=[prop])["user_id"].nunique())

        top_values = []
        for _, row in val_stats.iterrows():
            val_str = str(row[prop])
            val_users = list(user_prop[user_prop == row[prop]].index)
            top_values.append({
                "value": val_str,
                "users": int(row["users"]),
                "events": int(row["events"]),
                "pct": round(int(row["users"]) / total_users, 4) if total_users > 0 else 0.0,
                "d7_retention_pct": d7_retention(val_users),
            })
        results.append({"property": prop, "top_values": top_values, "users_with_prop": users_with_prop})

    chart_specs = [
        {
            "chart_type": "segment_bars",
            "section": "Segments",
            "title": r["property"],
            "subtitle": f"Top {len(r['top_values'])} values · by users",
            "data": r["top_values"],
            "config": {"users_with_prop": r["users_with_prop"]},
        }
        for r in results
    ]

    return {"properties": results, "chart_specs": chart_specs}
