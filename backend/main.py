from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api.sources import router as sources_router
from backend.api.analysis import router as analysis_router
from backend.api.questions import router as questions_router
from backend.config import settings  # noqa: F401 — used in /api/config

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


@app.on_event("startup")
async def _seed_demo():
    from backend.storage import JSONStorage
    if not JSONStorage("sources").get("demo"):
        try:
            from backend.api.sources import create_from_demo
            await create_from_demo()
        except Exception:
            pass


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    return {"demo_mode": settings.demo_mode}
