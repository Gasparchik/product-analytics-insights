from pathlib import Path
from typing import Any, Dict

import pandas as pd

DATA_DIR = Path(__file__).parent.parent / "data"


def load_dataframe(source: Dict[str, Any]) -> pd.DataFrame:
    """Load CSV and rename mapped columns to canonical names (user_id, timestamp, event_name)."""
    source_id = source["id"]
    csv_path = DATA_DIR / f"{source_id}.csv"
    df = pd.read_csv(csv_path)

    mapping = source.get("metadata", {}).get("mapping", {})

    # Rename only the three structural columns; properties/signup_event/conversion_event are values
    structural = {"user_id", "timestamp", "event_name"}
    rename: Dict[str, str] = {}
    for canonical, original in mapping.items():
        if canonical in structural and original and original in df.columns and original != canonical:
            rename[original] = canonical
    if rename:
        df = df.rename(columns=rename)

    # Parse timestamp to UTC-aware datetime
    if "timestamp" in df.columns:
        parsed = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)
        # If >50% NaT, try interpreting as unix milliseconds
        if parsed.isna().mean() > 0.5:
            numeric = pd.to_numeric(df["timestamp"], errors="coerce")
            parsed = pd.to_datetime(numeric, unit="ms", utc=True, errors="coerce")
        df["timestamp"] = parsed

    return df


def sessionize(df: pd.DataFrame, timeout_minutes: int = 30) -> pd.DataFrame:
    """Add session_id column. Consecutive events from the same user within timeout = one session."""
    df = df.sort_values(["user_id", "timestamp"]).copy()
    timeout = pd.Timedelta(minutes=timeout_minutes)

    prev_ts = df.groupby("user_id")["timestamp"].shift(1)
    user_changed = df["user_id"] != df["user_id"].shift(1)
    time_gap = df["timestamp"] - prev_ts

    new_session = user_changed | time_gap.isna() | (time_gap > timeout)
    df["session_id"] = new_session.cumsum()
    return df
