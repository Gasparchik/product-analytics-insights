import json
import os
from typing import Any, Dict, List, Optional, Type, TypeVar
from pathlib import Path
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

DATA_DIR = Path(__file__).parent.parent / "data"


class JSONStorage:
    """Simple JSON-file-based storage. One collection = one JSON file.

    Chosen for v1 simplicity — same pattern as the author's first project.
    Replace with a proper DB on v2 if multi-user or large datasets are needed.
    """

    def __init__(self, collection: str):
        self.path = DATA_DIR / f"{collection}.json"
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.path.write_text("[]")

    def _load(self) -> List[Dict]:
        return json.loads(self.path.read_text())

    def _save(self, records: List[Dict]) -> None:
        self.path.write_text(json.dumps(records, indent=2, default=str))

    def all(self) -> List[Dict]:
        """Return all records in the collection."""
        return self._load()

    def get(self, record_id: str) -> Optional[Dict]:
        """Return a single record by id, or None."""
        return next((r for r in self._load() if r.get("id") == record_id), None)

    def save(self, record: Dict) -> Dict:
        """Insert or update a record (matched by id)."""
        records = self._load()
        existing = next((i for i, r in enumerate(records) if r.get("id") == record.get("id")), None)
        if existing is not None:
            records[existing] = record
        else:
            records.append(record)
        self._save(records)
        return record

    def delete(self, record_id: str) -> bool:
        """Delete a record by id. Returns True if found and deleted."""
        records = self._load()
        filtered = [r for r in records if r.get("id") != record_id]
        if len(filtered) == len(records):
            return False
        self._save(filtered)
        return True

    def delete_where(self, predicate) -> int:
        """Delete records matching `predicate(record) -> bool`. Returns count deleted."""
        records = self._load()
        kept = [r for r in records if not predicate(r)]
        removed = len(records) - len(kept)
        if removed:
            self._save(kept)
        return removed

    def find(self, **kwargs) -> List[Dict]:
        """Return all records where fields match kwargs."""
        records = self._load()
        return [r for r in records if all(r.get(k) == v for k, v in kwargs.items())]
