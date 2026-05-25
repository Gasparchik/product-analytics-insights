import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date as _date, datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.storage import JSONStorage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])

sources_storage = JSONStorage("sources")
analyses_storage = JSONStorage("analyses")

DATA_DIR = Path(__file__).parent.parent / "data"
_executor = ThreadPoolExecutor(max_workers=4)


def _cache_key(source_id: str, start: Optional[str], end: Optional[str]) -> str:
    if start or end:
        return f"{source_id}_{start or 'x'}_{end or 'x'}"
    return source_id


def _run_sync(name: str, fn, df, mapping) -> dict:
    try:
        result = fn(df, mapping)
        chart_specs = result.pop("chart_specs", [])
        return {"name": name, "data": result, "chart_specs": chart_specs, "error": None}
    except Exception as e:
        return {"name": name, "data": {}, "chart_specs": [], "error": str(e)}


@router.post("/{source_id}/run")
async def run_analysis(
    source_id: str,
    start: Optional[str] = Query(None, description="Filter start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="Filter end date YYYY-MM-DD"),
):
    cache_key = _cache_key(source_id, start, end)

    cached = analyses_storage.get(cache_key)
    if cached:
        has_chart_specs = any(r.get("chart_specs") for r in cached.get("results", []))
        # Funnel v2 introduces `available_events` in its chart_spec config; older
        # caches lack it and must be recomputed so the builder UI gets options.
        funnel_v2_ok = False
        for r in cached.get("results", []):
            if r.get("name") == "funnel":
                specs = r.get("chart_specs") or []
                if specs:
                    cfg = specs[0].get("config") or {}
                    funnel_v2_ok = isinstance(cfg.get("available_events"), list)
                else:
                    funnel_v2_ok = False
                break
        if has_chart_specs and funnel_v2_ok:
            source_for_bg = sources_storage.get(source_id)
            # If cached run lacks insights, kick off generation in background
            if source_for_bg and not cached.get("insights"):
                asyncio.create_task(_generate_insights_for_run(cached, source_for_bg, source_id, cache_key))
            # Ensure windowed windows are pre-computed even for cached full-dataset runs
            if not start and not end and source_for_bg:
                mapping_for_pre = source_for_bg.get("metadata", {}).get("mapping", {})
                asyncio.create_task(_precompute_windows(source_id, source_for_bg, mapping_for_pre))
            return cached

    source = sources_storage.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    csv_path = DATA_DIR / f"{source_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV file not found")

    mapping = source.get("metadata", {}).get("mapping", {})
    if not all(mapping.get(k) for k in ("user_id", "timestamp", "event_name")):
        raise HTTPException(status_code=400, detail="Mapping incomplete — user_id, timestamp, event_name required")

    from backend.analyzers.utils import load_dataframe
    from backend.analyzers.product_events import engagement, retention, funnel, segments

    try:
        df = load_dataframe(source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load CSV: {e}")

    try:
        start_date = _date.fromisoformat(start) if start else None
        end_date = _date.fromisoformat(end) if end else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format — use YYYY-MM-DD")

    if "timestamp" in df.columns:
        if start_date:
            df = df[df["timestamp"].dt.date >= start_date]
        if end_date:
            df = df[df["timestamp"].dt.date <= end_date]

    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(_executor, _run_sync, name, fn, df, mapping)
        for name, fn in [
            ("engagement", engagement.analyze),
            ("retention", retention.analyze),
            ("funnel", funnel.analyze),
            ("segments", segments.analyze),
        ]
    ]
    results = list(await asyncio.gather(*tasks))

    run = {
        "id": cache_key,
        "source_id": source_id,
        "start_date": start,
        "end_date": end,
        "status": "done",
        "results": results,
        "created_at": datetime.utcnow().isoformat(),
        "completed_at": datetime.utcnow().isoformat(),
        "insights": [],
    }

    analyses_storage.save(run)

    # Generate insights for this run in background (works for both full and windowed runs)
    asyncio.create_task(_generate_insights_for_run(run, source, source_id, cache_key))

    # For full-dataset runs only: also pre-compute the standard windows
    if not start and not end:
        asyncio.create_task(_precompute_windows(source_id, source, mapping, df if "timestamp" in df.columns else None))

    return run


_STANDARD_WINDOWS = [7, 14, 30, 90]


async def _generate_insights_for_run(run: dict, source: dict, source_id: str, cache_key: str) -> None:
    """Generate insights for a single run (full or windowed) and persist them."""
    insights = await _generate_insights_safe(run, source)
    if not insights:
        return
    # Re-read storage in case another background task already updated this key
    latest = analyses_storage.get(cache_key) or run
    if latest.get("insights"):
        return  # someone else got there first
    latest["insights"] = insights
    analyses_storage.save(latest)
    logger.info("Background insights ready for %s (key=%s)", source_id, cache_key)


async def _precompute_windows(source_id: str, source: dict, mapping: dict, df=None) -> None:
    """Compute and cache windowed analysis + insights for standard date windows.

    If df is None, loads max_date from the cached full run (fast) and only loads
    the CSV if any windows are actually missing.
    """
    from backend.config import settings
    if not settings.anthropic_api_key:
        return

    from datetime import timedelta, date as _date_type
    from backend.analyzers.product_events import engagement as eng_mod, retention as ret_mod, funnel as funnel_mod, segments as seg_mod

    if df is not None:
        try:
            max_date = df["timestamp"].dt.date.max()
        except Exception:
            return
    else:
        # Derive max_date from the cached full run's engagement dau_series (no CSV load needed)
        full_run = analyses_storage.get(source_id)
        dau_series = []
        if full_run:
            for r in full_run.get("results", []):
                if r.get("name") == "engagement":
                    dau_series = r.get("data", {}).get("dau_series", [])
                    break
        if not dau_series:
            return
        try:
            max_date = _date_type.fromisoformat(dau_series[-1]["date"])
        except Exception:
            return

        # Fast-path: if all windows already have insights, skip CSV load entirely
        all_cached = all(
            (analyses_storage.get(_cache_key(source_id, str(max_date - timedelta(days=d - 1)), str(max_date))) or {}).get("insights")
            for d in _STANDARD_WINDOWS
        )
        if all_cached:
            return

        # Load df only when needed
        from backend.analyzers.utils import load_dataframe
        loop = asyncio.get_event_loop()
        try:
            df = await loop.run_in_executor(_executor, load_dataframe, source)
        except Exception:
            return

    async def compute_one(days: int) -> None:
        from datetime import timedelta
        end_date = max_date
        start_date = end_date - timedelta(days=days - 1)
        start_str = str(start_date)
        end_str = str(end_date)

        ck = _cache_key(source_id, start_str, end_str)

        existing = analyses_storage.get(ck)
        if existing and existing.get("insights"):
            return  # already cached with insights

        df_win = df[
            (df["timestamp"].dt.date >= start_date) &
            (df["timestamp"].dt.date <= end_date)
        ]

        loop = asyncio.get_event_loop()
        tasks = [
            loop.run_in_executor(_executor, _run_sync, name, fn, df_win, mapping)
            for name, fn in [
                ("engagement", eng_mod.analyze),
                ("retention", ret_mod.analyze),
                ("funnel", funnel_mod.analyze),
                ("segments", seg_mod.analyze),
            ]
        ]
        results = list(await asyncio.gather(*tasks))

        run_data = {
            "id": ck,
            "source_id": source_id,
            "start_date": start_str,
            "end_date": end_str,
            "status": "done",
            "results": results,
            "created_at": datetime.utcnow().isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
            "insights": [],
        }

        insights = await _generate_insights_safe(run_data, source)
        run_data["insights"] = insights
        analyses_storage.save(run_data)
        if insights:
            logger.info("Pre-computed %d-day window insights for source %s", days, source_id)
        else:
            logger.warning("Pre-computed %d-day window for source %s but insights are empty", days, source_id)

    # Run sequentially to avoid Anthropic rate limits (parallel LLM calls exceed per-minute limits)
    for days in _STANDARD_WINDOWS:
        try:
            await compute_one(days)
            await asyncio.sleep(2)  # small gap between LLM calls
        except Exception as e:
            logger.warning("Failed to pre-compute %d-day window for %s: %s", days, source_id, e)


async def _generate_insights_safe(run: dict, source: dict) -> list:
    from backend.config import settings

    # Demo source: always serve from snapshot, never call Claude
    if source.get("is_demo"):
        from backend.ai.demo_playback import get_demo_insights
        insights = get_demo_insights()
        if insights:
            return insights
        logger.warning("Demo snapshot has no insights yet — run generate_snapshot.py")
        return []

    # Public demo mode: AI disabled for non-demo sources
    if settings.demo_mode:
        return []

    if not settings.anthropic_api_key:
        logger.warning("ANTHROPIC_API_KEY not set — skipping insight generation")
        return []
    try:
        from backend.ai.insights_generator import generate_insights
        return await generate_insights(run, source)
    except Exception as e:
        logger.error("Insight generation failed: %s", e)
        return []


@router.get("/{source_id}")
async def get_analysis(
    source_id: str,
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
):
    key = _cache_key(source_id, start, end)
    run = analyses_storage.get(key)
    if not run:
        raise HTTPException(status_code=404, detail="No analysis found — POST /{source_id}/run first")
    # Self-heal: if cached run lacks insights, trigger background generation so the
    # frontend's polling picks them up on the next attempt
    if not run.get("insights"):
        source = sources_storage.get(source_id)
        if source:
            asyncio.create_task(_generate_insights_for_run(run, source, source_id, key))
    return run


@router.get("/{source_id}/metrics")
async def get_metrics(source_id: str):
    run = analyses_storage.get(source_id)
    if not run:
        raise HTTPException(status_code=404, detail="No analysis found")
    return run


@router.get("/{source_id}/insights")
async def get_insights(source_id: str):
    run = analyses_storage.get(source_id)
    if not run:
        raise HTTPException(status_code=404, detail="No analysis found")
    return {"insights": run.get("insights", [])}


class PropertyFilter(BaseModel):
    col: str
    vals: List[str]


class SectionRequest(BaseModel):
    section: str = Field(..., description="Analyzer to run: engagement | retention | funnel | segments")
    filters: List[PropertyFilter] = Field(default_factory=list)
    funnel_steps: Optional[List[str]] = None
    funnel_window_days: int = Field(7, ge=1, le=365)


class FunnelRecomputeRequest(BaseModel):
    steps: List[str] = Field(..., min_length=2, description="Ordered list of event names")
    window_days: int = Field(7, ge=1, le=365, description="Time window between adjacent steps")
    filters: List[PropertyFilter] = Field(default_factory=list, description="Property filters applied before computing")


@router.post("/{source_id}/funnel")
async def recompute_funnel(
    source_id: str,
    body: FunnelRecomputeRequest,
    start: Optional[str] = Query(None, description="Filter start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="Filter end date YYYY-MM-DD"),
):
    """Re-run only the funnel analyzer with a custom step sequence and window.

    Updates the cached analysis run's funnel slice so subsequent GETs return the
    new spec, but does not touch the other analyzers' results.
    """
    source = sources_storage.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    csv_path = DATA_DIR / f"{source_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV file not found")

    mapping = dict(source.get("metadata", {}).get("mapping", {}) or {})
    if not all(mapping.get(k) for k in ("user_id", "timestamp", "event_name")):
        raise HTTPException(status_code=400, detail="Mapping incomplete — configure mapping first")

    mapping["funnel_steps"] = list(body.steps)
    mapping["funnel_window_days"] = int(body.window_days)

    from backend.analyzers.utils import load_dataframe
    from backend.analyzers.product_events import funnel

    try:
        df = load_dataframe(source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load CSV: {e}")

    try:
        start_date = _date.fromisoformat(start) if start else None
        end_date = _date.fromisoformat(end) if end else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format — use YYYY-MM-DD")

    if "timestamp" in df.columns:
        if start_date:
            df = df[df["timestamp"].dt.date >= start_date]
        if end_date:
            df = df[df["timestamp"].dt.date <= end_date]

    for f in body.filters:
        if f.col in df.columns and f.vals:
            df = df[df[f.col].astype(str).isin([str(v) for v in f.vals])]

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_executor, _run_sync, "funnel", funnel.analyze, df, mapping)

    # Only update the shared cache when no property filters are active
    has_active_filters = any(f.vals for f in body.filters)
    cache_key = _cache_key(source_id, start, end)
    cached = analyses_storage.get(cache_key) if not has_active_filters else None
    if cached:
        results = cached.get("results", [])
        replaced = False
        for i, r in enumerate(results):
            if r.get("name") == "funnel":
                results[i] = result
                replaced = True
                break
        if not replaced:
            results.append(result)
        cached["results"] = results
        cached["completed_at"] = datetime.utcnow().isoformat()
        analyses_storage.save(cached)

    return result


@router.post("/{source_id}/section")
async def compute_section(
    source_id: str,
    body: SectionRequest,
    start: Optional[str] = Query(None, description="Filter start date YYYY-MM-DD"),
    end: Optional[str] = Query(None, description="Filter end date YYYY-MM-DD"),
):
    """Run a single analyzer section with optional property filters. Not cached."""
    source = sources_storage.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    csv_path = DATA_DIR / f"{source_id}.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=404, detail="CSV file not found")

    mapping = source.get("metadata", {}).get("mapping", {})
    if not all(mapping.get(k) for k in ("user_id", "timestamp", "event_name")):
        raise HTTPException(status_code=400, detail="Mapping incomplete — configure mapping first")

    from backend.analyzers.utils import load_dataframe
    from backend.analyzers.product_events import engagement, retention, funnel as funnel_mod, segments

    try:
        df = load_dataframe(source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load CSV: {e}")

    if "timestamp" in df.columns:
        if start:
            df = df[df["timestamp"].dt.date >= _date.fromisoformat(start)]
        if end:
            df = df[df["timestamp"].dt.date <= _date.fromisoformat(end)]

    for f in body.filters:
        if f.col in df.columns and f.vals:
            df = df[df[f.col].astype(str).isin([str(v) for v in f.vals])]

    run_mapping = dict(mapping)
    section_lower = body.section.lower()
    if section_lower == "funnel":
        if body.funnel_steps:
            run_mapping["funnel_steps"] = body.funnel_steps
        run_mapping["funnel_window_days"] = body.funnel_window_days

    section_map = {
        "engagement": engagement.analyze,
        "retention": retention.analyze,
        "funnel": funnel_mod.analyze,
        "segments": segments.analyze,
    }
    fn = section_map.get(section_lower)
    if not fn:
        raise HTTPException(status_code=400, detail=f"Unknown section: {body.section!r}")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(_executor, _run_sync, body.section, fn, df, run_mapping)
    return result


@router.post("/{source_id}/insights/regenerate")
async def regenerate_insights(source_id: str):
    run = analyses_storage.get(source_id)
    if not run:
        raise HTTPException(status_code=404, detail="No analysis found — run analysis first")

    source = sources_storage.get(source_id)
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    insights = await _generate_insights_safe(run, source)
    run["insights"] = insights
    analyses_storage.save(run)
    return {"insights": insights}
