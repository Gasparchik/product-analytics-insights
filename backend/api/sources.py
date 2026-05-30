import json
import shutil
import uuid
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, HTTPException, Query, UploadFile, File

from backend.models import Source, ColumnMapping
from backend.storage import JSONStorage

router = APIRouter(prefix="/api/sources", tags=["sources"])

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

storage = JSONStorage("sources")
analyses_storage = JSONStorage("analyses")
questions_storage = JSONStorage("questions")


def _detect_format(columns: list[str]) -> str:
    cols = {c.lower() for c in columns}
    if {"user_id", "event_time", "event_type"}.issubset(cols):
        return "amplitude"
    if {"distinct_id", "time", "event"}.issubset(cols):
        return "mixpanel"
    return "custom"


def _auto_mapping(detected_format: str) -> dict:
    if detected_format == "amplitude":
        return {"user_id": "user_id", "timestamp": "event_time", "event_name": "event_type"}
    if detected_format == "mixpanel":
        return {"user_id": "distinct_id", "timestamp": "time", "event_name": "event"}
    return {}


def _empty_string_mask(series: pd.Series) -> pd.Series:
    return series.isna() | (series.astype(str).str.strip() == "")


def _parse_timestamp(series: pd.Series) -> pd.Series:
    parsed = pd.to_datetime(series, errors="coerce", utc=True)
    if parsed.isna().mean() > 0.5:
        numeric = pd.to_numeric(series, errors="coerce")
        parsed = pd.to_datetime(numeric, unit="ms", utc=True, errors="coerce")
    return parsed


def _ratio(part: int, total: int) -> float:
    return round(part / total, 4) if total else 0.0


def _issue(severity: str, title: str, detail: str) -> dict:
    return {"severity": severity, "title": title, "detail": detail}


@router.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File exceeds 100MB limit")

    source_id = str(uuid.uuid4())
    csv_path = DATA_DIR / f"{source_id}.csv"
    csv_path.write_bytes(content)

    try:
        df = pd.read_csv(csv_path, nrows=20)
    except Exception as e:
        csv_path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Could not parse CSV: {e}")

    columns = df.columns.tolist()
    detected_format = _detect_format(columns)
    preview_rows = df.head(10).fillna("").to_dict(orient="records")

    try:
        total_rows = sum(1 for _ in open(csv_path, encoding="utf-8")) - 1
    except Exception:
        total_rows = len(df)

    source = Source(
        id=source_id,
        type="product_events",
        name=file.filename,
        metadata={
            "columns": columns,
            "detected_format": detected_format,
            "total_rows": total_rows,
            "preview_rows": preview_rows,
            "mapping": _auto_mapping(detected_format),
        },
    )
    storage.save(source.model_dump(mode="json"))

    return {
        "source_id": source_id,
        "columns": columns,
        "preview_rows": preview_rows,
        "detected_format": detected_format,
        "total_rows": total_rows,
    }


@router.get("/")
async def list_sources():
    return storage.all()


@router.get("/{source_id}")
async def get_source(source_id: str):
    record = storage.get(source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Source not found")
    return record


@router.delete("/{source_id}")
async def delete_source(source_id: str):
    record = storage.get(source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Source not found")
    storage.delete(source_id)
    csv_path = DATA_DIR / f"{source_id}.csv"
    csv_path.unlink(missing_ok=True)
    # Remove every cached analysis for this source — both the full run
    # (id == source_id) and windowed runs (id == f"{source_id}_{start}_{end}",
    # all carry source_id) — plus all of its questions. Without this, deleting a
    # source leaks its analyses + questions on disk forever.
    analyses_storage.delete_where(lambda r: r.get("source_id") == source_id)
    questions_storage.delete_where(lambda r: r.get("source_id") == source_id)
    return {"ok": True}


@router.get("/{source_id}/event_counts")
async def get_event_counts(source_id: str, col: str = Query(..., description="Column to count")):
    record = storage.get(source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Source not found")

    csv_path = DATA_DIR / f"{source_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV file not found")

    try:
        df = pd.read_csv(csv_path, usecols=[col])
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Column '{col}' not found in CSV")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    series = df[col].dropna().astype(str).str.strip()
    series = series[series != ""]
    top = series.value_counts().head(10)

    return {
        "col": col,
        "total_rows": int(len(df)),
        "counts": [{"name": name, "count": int(cnt)} for name, cnt in top.items()],
    }


@router.post("/{source_id}/quality")
async def get_data_quality(source_id: str, mapping: ColumnMapping):
    record = storage.get(source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Source not found")

    csv_path = DATA_DIR / f"{source_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV file not found")

    try:
        header = pd.read_csv(csv_path, nrows=0)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse CSV header: {e}")

    columns = set(header.columns.tolist())
    required_map = mapping.model_dump()
    required_fields = ["user_id", "timestamp", "event_name"]
    missing = [
        {"field": field, "column": required_map.get(field)}
        for field in required_fields
        if not required_map.get(field) or required_map.get(field) not in columns
    ]
    if missing:
        return {
            "status": "blocked",
            "score": 0,
            "total_rows": 0,
            "date_range": {"start": None, "end": None, "days": 0},
            "metrics": {},
            "top_events": [],
            "properties": [],
            "issues": [
                _issue(
                    "error",
                    "Required mapping is incomplete",
                    "Pick existing CSV columns for user id, timestamp, and event name.",
                )
            ],
            "missing_required": missing,
        }

    property_cols = [
        p.strip()
        for p in (mapping.properties or "").split(",")
        if p.strip() and p.strip() in columns
    ]
    selected_cols = list(dict.fromkeys([required_map[f] for f in required_fields] + property_cols))

    try:
        df = pd.read_csv(csv_path, usecols=selected_cols)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read mapped columns: {e}")

    total_rows = int(len(df))
    user_col = mapping.user_id
    ts_col = mapping.timestamp
    event_col = mapping.event_name

    user_empty = _empty_string_mask(df[user_col])
    event_empty = _empty_string_mask(df[event_col])
    parsed_ts = _parse_timestamp(df[ts_col])
    ts_invalid = parsed_ts.isna()

    valid_users = df.loc[~user_empty, user_col].astype(str).str.strip()
    valid_events = df.loc[~event_empty, event_col].astype(str).str.strip()
    valid_ts = parsed_ts.dropna()

    unique_users = int(valid_users.nunique())
    unique_events = int(valid_events.nunique())
    top_events = [
        {"name": str(name), "count": int(count)}
        for name, count in valid_events.value_counts().head(8).items()
    ]

    if not valid_ts.empty:
        start_ts = valid_ts.min()
        end_ts = valid_ts.max()
        date_range = {
            "start": start_ts.date().isoformat(),
            "end": end_ts.date().isoformat(),
            "days": int((end_ts.date() - start_ts.date()).days) + 1,
        }
    else:
        date_range = {"start": None, "end": None, "days": 0}

    properties = []
    for col in property_cols:
        empty = _empty_string_mask(df[col])
        filled = df.loc[~empty, col].astype(str).str.strip()
        unique_count = int(filled.nunique())
        fill_rate = _ratio(int(len(filled)), total_rows)
        unique_ratio = _ratio(unique_count, int(len(filled)))
        flags = []
        if fill_rate < 0.2:
            flags.append("low_fill")
        if unique_count >= 20 and unique_ratio > 0.8:
            flags.append("high_cardinality")
        properties.append({
            "column": col,
            "fill_rate": fill_rate,
            "unique_count": unique_count,
            "unique_ratio": unique_ratio,
            "top_values": [
                {"value": str(name), "count": int(count)}
                for name, count in filled.value_counts().head(5).items()
            ],
            "flags": flags,
        })

    issues: list[dict] = []
    user_empty_ratio = _ratio(int(user_empty.sum()), total_rows)
    event_empty_ratio = _ratio(int(event_empty.sum()), total_rows)
    ts_invalid_ratio = _ratio(int(ts_invalid.sum()), total_rows)

    if total_rows == 0:
        issues.append(_issue("error", "CSV has no data rows", "Upload a file with at least one event row."))
    if unique_users == 0:
        issues.append(_issue("error", "No valid users found", "The selected user id column is empty."))
    if unique_events == 0:
        issues.append(_issue("error", "No valid events found", "The selected event name column is empty."))
    if valid_ts.empty:
        issues.append(_issue("error", "No valid timestamps found", "The selected timestamp column could not be parsed."))

    if user_empty_ratio > 0:
        sev = "error" if user_empty_ratio > 0.25 else "warning"
        issues.append(_issue(sev, "Some rows have no user id", f"{user_empty_ratio:.1%} of rows will not work for user-level metrics."))
    if event_empty_ratio > 0:
        sev = "error" if event_empty_ratio > 0.25 else "warning"
        issues.append(_issue(sev, "Some rows have no event name", f"{event_empty_ratio:.1%} of rows cannot be counted by event."))
    if ts_invalid_ratio > 0:
        sev = "error" if ts_invalid_ratio > 0.25 else "warning"
        issues.append(_issue(sev, "Some timestamps are invalid", f"{ts_invalid_ratio:.1%} of rows cannot be placed on a timeline."))
    if unique_events > 200:
        issues.append(_issue("warning", "High event cardinality", f"{unique_events:,} unique event names found. This may include dynamic values or IDs."))
    for prop in properties:
        if "low_fill" in prop["flags"]:
            issues.append(_issue("warning", f"{prop['column']} is mostly empty", f"{prop['fill_rate']:.0%} of rows have a value for this property."))
        if "high_cardinality" in prop["flags"]:
            issues.append(_issue("warning", f"{prop['column']} looks high-cardinality", f"{prop['unique_count']:,} unique values may make segmentation noisy."))

    score = 100
    score -= min(35, round(ts_invalid_ratio * 100))
    score -= min(25, round(user_empty_ratio * 100))
    score -= min(20, round(event_empty_ratio * 100))
    score -= 8 * sum(1 for p in properties if p["flags"])
    score = max(0, int(score))

    if any(i["severity"] == "error" for i in issues):
        status = "blocked"
    elif any(i["severity"] == "warning" for i in issues):
        status = "warning"
    else:
        status = "ready"

    return {
        "status": status,
        "score": score,
        "total_rows": total_rows,
        "date_range": date_range,
        "metrics": {
            "unique_users": unique_users,
            "unique_events": unique_events,
            "empty_user_id_rows": int(user_empty.sum()),
            "empty_user_id_ratio": user_empty_ratio,
            "empty_event_name_rows": int(event_empty.sum()),
            "empty_event_name_ratio": event_empty_ratio,
            "invalid_timestamp_rows": int(ts_invalid.sum()),
            "invalid_timestamp_ratio": ts_invalid_ratio,
        },
        "top_events": top_events,
        "properties": properties,
        "issues": issues,
        "missing_required": [],
    }


@router.get("/{source_id}/preview")
async def get_preview(source_id: str):
    record = storage.get(source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Source not found")
    md = record["metadata"]
    return {
        "columns": md.get("columns", []),
        "preview_rows": md.get("preview_rows", []),
        "detected_format": md.get("detected_format", "custom"),
        "total_rows": md.get("total_rows", 0),
        "mapping": md.get("mapping", {}),
        "profile": md.get("profile", "event_log"),
    }


@router.post("/{source_id}/mapping")
async def save_mapping(
    source_id: str,
    mapping: ColumnMapping,
    profile: str = Query("event_log", description="Data profile: event_log | transactions | user_snapshot | aggregated_metrics"),
):
    record = storage.get(source_id)
    if not record:
        raise HTTPException(status_code=404, detail="Source not found")

    csv_path = DATA_DIR / f"{source_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV file not found")

    from backend.analyzers.product_events import validate_mapping
    if not validate_mapping(str(csv_path), mapping.model_dump()):
        raise HTTPException(status_code=400, detail="Mapping validation failed: columns not found in CSV")

    record["metadata"]["mapping"] = mapping.model_dump()
    record["metadata"]["profile"] = profile
    storage.save(record)

    # Invalidate any cached analyses for this source — mapping change requires re-compute.
    # Cache keys are either `source_id` or `source_id_<start>_<end>` (see api.analysis._cache_key).
    invalidated = analyses_storage.delete_where(
        lambda r: r.get("source_id") == source_id or str(r.get("id", "")).startswith(source_id)
    )

    return {"status": "ok", "source_id": source_id, "invalidated_analyses": invalidated}


@router.post("/from_demo")
async def create_from_demo():
    """Create (or return existing) source from the built-in TaskFlow demo dataset."""
    from backend.demo.generate_demo import OUTPUT_DIR, generate, FIELDNAMES

    demo_csv = OUTPUT_DIR / "demo_dataset.csv"
    demo_mapping_file = OUTPUT_DIR / "demo_mapping.json"

    # Generate dataset if not yet created
    if not demo_csv.exists():
        generate()

    if not demo_csv.exists():
        raise HTTPException(status_code=500, detail="Demo dataset could not be generated")

    # Fixed source_id so the snapshot always matches
    source_id = "demo"
    existing = storage.get(source_id)
    if existing:
        return {"source_id": source_id}

    dest_csv = DATA_DIR / f"{source_id}.csv"
    shutil.copy2(demo_csv, dest_csv)

    # Read preview
    try:
        df = pd.read_csv(dest_csv, nrows=20)
    except Exception as e:
        dest_csv.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Could not parse demo CSV: {e}")

    columns = df.columns.tolist()
    preview_rows = df.head(10).fillna("").to_dict(orient="records")
    try:
        total_rows = sum(1 for _ in open(dest_csv, encoding="utf-8")) - 1
    except Exception:
        total_rows = len(df)

    # Load pre-built mapping
    mapping: dict = {}
    if demo_mapping_file.exists():
        try:
            mapping = json.loads(demo_mapping_file.read_text())
        except Exception:
            pass

    source = Source(
        id=source_id,
        type="product_events",
        name="TaskFlow Demo Dataset",
        is_demo=True,
        metadata={
            "columns": columns,
            "detected_format": "custom",
            "total_rows": total_rows,
            "preview_rows": preview_rows,
            "mapping": mapping,
        },
    )
    storage.save(source.model_dump(mode="json"))

    return {"source_id": source_id}
