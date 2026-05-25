from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class ColumnMapping(BaseModel):
    """Maps user's CSV columns to the canonical schema.

    user_id is required (needed for retention, sessions, v2 joins).
    timestamp and event_name are required.
    properties maps to a JSON column (optional per row).
    signup_event and conversion_event are optional — used for funnel.
    """

    user_id: str
    timestamp: str
    event_name: str
    properties: Optional[str] = None
    signup_event: Optional[str] = None
    conversion_event: Optional[str] = None


class Dataset(BaseModel):
    """Metadata about an uploaded CSV dataset linked to a Source."""

    source_id: str
    filename: str
    row_count: int
    column_mapping: ColumnMapping
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    file_path: Optional[str] = None
