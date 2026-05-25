"""Read pre-computed AI results for the demo dataset from snapshot.json.

No live Claude calls happen here — this module only reads the committed snapshot.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SNAPSHOT_PATH = Path(__file__).parent.parent / "demo" / "snapshot.json"

DEMO_QUESTIONS = [
    "Why is retention low for Google Ads users?",
    "What predicts paid conversion?",
    "Show me the signup funnel",
    "Compare retention by platform",
    "What do power users have in common?",
    "Did anything unusual happen with daily active users?",
]


def _load_snapshot() -> dict:
    try:
        return json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning("Could not load demo snapshot: %s", e)
        return {}


def get_demo_insights() -> list[dict]:
    return _load_snapshot().get("insights", [])


def get_demo_suggestions() -> list[str]:
    snap = _load_snapshot()
    if snap.get("qna"):
        return [entry["question"] for entry in snap["qna"]]
    return DEMO_QUESTIONS


def get_demo_answer(question_text: str) -> dict | None:
    """Return a pre-computed Q&A entry for an exact question match, or None."""
    snap = _load_snapshot()
    q_lower = question_text.strip().lower()
    for entry in snap.get("qna", []):
        if entry.get("question", "").strip().lower() == q_lower:
            return entry
    return None
