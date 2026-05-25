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


@router.delete("/{source_id}")
async def delete_source(source_id: str):
    ok = storage.delete(source_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Source not found")
    csv_path = DATA_DIR / f"{source_id}.csv"
    csv_path.unlink(missing_ok=True)
    analyses_storage.delete_where(
        lambda r: r.get("source_id") == source_id or str(r.get("id", "")).startswith(source_id)
    )
    return {"status": "deleted"}
