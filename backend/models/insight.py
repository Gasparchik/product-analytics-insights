from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


class Insight(BaseModel):
    """A structured AI-generated insight tied to a Source.

    Saved as a first-class record so insights from multiple sources
    can be queried and grouped by tags on v2.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    source_id: str
    type: str  # "anomaly" | "segment_difference" | "correlation" | "funnel_drop" | ...
    category: str = ""  # display label: Retention | Engagement | Funnel | Acquisition | Segmentation
    title: str
    description: str
    metrics: Dict[str, Any] = Field(default_factory=dict)
    tags: List[str] = Field(default_factory=list)  # e.g. ["activation", "retention"]
    severity: str = "medium"  # "low" | "medium" | "high"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class InsightCreate(BaseModel):
    """Payload for creating a new Insight."""

    source_id: str
    type: str
    title: str
    description: str
    metrics: Optional[Dict[str, Any]] = None
    tags: Optional[List[str]] = None
    severity: Optional[str] = "medium"
