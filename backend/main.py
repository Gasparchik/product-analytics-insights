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


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config")
async def get_config():
    return {"demo_mode": settings.demo_mode}
