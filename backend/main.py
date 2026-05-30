import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.sources import router as sources_router
from backend.api.analysis import router as analysis_router
from backend.api.questions import router as questions_router
from backend.config import settings  # noqa: F401 — used in /api/config

logger = logging.getLogger(__name__)

app = FastAPI(title="Product Analytics Insights Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources_router)
app.include_router(analysis_router)
app.include_router(questions_router)


def _cleanup_orphans() -> None:
    """Remove analyses/questions whose source no longer exists, plus orphaned
    CSV files. Without this, deleting or abandoning a source used to leak its
    artifacts on disk forever, so storage grew without bound.

    Runs after demo seeding so the demo source (and demo.csv) count as valid.
    """
    from backend.storage import JSONStorage

    valid_ids = {r["id"] for r in JSONStorage("sources").all() if r.get("id")}

    removed_analyses = JSONStorage("analyses").delete_where(
        lambda r: r.get("source_id") not in valid_ids
    )
    removed_questions = JSONStorage("questions").delete_where(
        lambda r: r.get("source_id") not in valid_ids
    )

    data_dir = Path(__file__).parent / "data"
    removed_csv = 0
    for csv in data_dir.glob("*.csv"):
        if csv.stem not in valid_ids:
            try:
                csv.unlink()
                removed_csv += 1
            except OSError:
                pass

    if removed_analyses or removed_questions or removed_csv:
        logger.info(
            "Startup cleanup: removed %d orphan analyses, %d questions, %d CSV files",
            removed_analyses, removed_questions, removed_csv,
        )


@app.on_event("startup")
async def _startup():
    from backend.storage import JSONStorage
    if not JSONStorage("sources").get("demo"):
        try:
            from backend.api.sources import create_from_demo
            await create_from_demo()
        except Exception as e:
            logger.warning("Demo source seeding failed: %s", e)
    _cleanup_orphans()


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    return {"demo_mode": settings.demo_mode}
