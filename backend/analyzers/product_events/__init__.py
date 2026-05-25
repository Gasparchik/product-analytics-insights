import pandas as pd
from typing import Dict, Optional


def validate_mapping(csv_path: str, mapping: Dict[str, Optional[str]]) -> bool:
    """Check that required mapping columns exist in the CSV.

    Reads only the header row to avoid loading large files.
    Returns False if any required column is missing.
    """
    try:
        df = pd.read_csv(csv_path, nrows=0)
        columns = set(df.columns.tolist())
    except Exception:
        return False

    required = ["user_id", "timestamp", "event_name"]
    for field in required:
        col = mapping.get(field)
        if not col or col not in columns:
            return False

    return True
