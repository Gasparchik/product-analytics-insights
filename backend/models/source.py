from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime
import uuid


class Source(BaseModel):
    """Represents a data source uploaded by the user.

    On v1 the only type is 'product_events'.
    On v2 types 'user_feedback' and 'stakeholder_requests' will be added.
    All analytics work through this abstraction, not directly with raw files.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # "product_events" | "user_feedback" | "stakeholder_requests"
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SourceCreate(BaseModel):
    """Payload for creating a new Source."""

    type: str
    name: str
    metadata: Optional[Dict[str, Any]] = None
