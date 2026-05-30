import json
import os
import threading
from typing import Callable, Dict, List, Optional
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"

# One lock per physical file, shared across every JSONStorage instance that
# points at the same collection. `analyses_storage` (and others) are constructed
# independently in several modules, so a per-instance lock would not serialize
# them. Without a shared lock, concurrent read-modify-write from background
# asyncio tasks + threadpool request handlers can corrupt the file or silently
# drop records (lost update).
_FILE_LOCKS: Dict[str, threading.RLock] = {}
_FILE_LOCKS_GUARD = threading.Lock()


def _lock_for(path: Path) -> threading.RLock:
    key = str(path)
    with _FILE_LOCKS_GUARD:
        lock = _FILE_LOCKS.get(key)
        if lock is None:
            lock = threading.RLock()
            _FILE_LOCKS[key] = lock
        return lock


class JSONStorage:
    """Simple JSON-file-based storage. One collection = one JSON file.

    Chosen for v1 simplicity — same pattern as the author's first project.
    Replace with a proper DB on v2 if multi-user or large datasets are needed.

    All mutating operations run under a per-file lock and write atomically
    (temp file + os.replace), so concurrent callers cannot corrupt the file or
    lose each other's updates.
    """

    def __init__(self, collection: str):
        self.path = DATA_DIR / f"{collection}.json"
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self._lock = _lock_for(self.path)
        if not self.path.exists():
            self.path.write_text("[]")

    def _load(self) -> List[Dict]:
        try:
            return json.loads(self.path.read_text())
        except (json.JSONDecodeError, FileNotFoundError, OSError):
            return []

    def _save(self, records: List[Dict]) -> None:
        # Atomic write: serialize to a sibling temp file then replace, so a
        # crash mid-write never leaves a truncated/corrupt JSON file behind.
        tmp = self.path.parent / f"{self.path.name}.tmp"
        tmp.write_text(json.dumps(records, indent=2, default=str))
        os.replace(tmp, self.path)

    def all(self) -> List[Dict]:
        """Return all records in the collection."""
        with self._lock:
            return self._load()

    def get(self, record_id: str) -> Optional[Dict]:
        """Return a single record by id, or None."""
        with self._lock:
            return next((r for r in self._load() if r.get("id") == record_id), None)

    def save(self, record: Dict) -> Dict:
        """Insert or update a record (matched by id)."""
        with self._lock:
            records = self._load()
            existing = next((i for i, r in enumerate(records) if r.get("id") == record.get("id")), None)
            if existing is not None:
                records[existing] = record
            else:
                records.append(record)
            self._save(records)
        return record

    def update(self, record_id: str, mutator: Callable[[Dict], Optional[Dict]]) -> Optional[Dict]:
        """Atomically read-modify-write a single record under the file lock.

        `mutator(record)` receives the current record and returns the new record
        to persist, or None to leave the collection unchanged (no write). The
        whole read→mutate→write cycle holds the lock, so two concurrent callers
        cannot both observe the pre-update state and clobber each other.

        Returns the saved record, or None if the record does not exist or the
        mutator opted out.
        """
        with self._lock:
            records = self._load()
            idx = next((i for i, r in enumerate(records) if r.get("id") == record_id), None)
            if idx is None:
                return None
            updated = mutator(records[idx])
            if updated is None:
                return None
            records[idx] = updated
            self._save(records)
            return updated

    def delete(self, record_id: str) -> bool:
        """Delete a record by id. Returns True if found and deleted."""
        with self._lock:
            records = self._load()
            filtered = [r for r in records if r.get("id") != record_id]
            if len(filtered) == len(records):
                return False
            self._save(filtered)
            return True

    def delete_where(self, predicate) -> int:
        """Delete records matching `predicate(record) -> bool`. Returns count deleted."""
        with self._lock:
            records = self._load()
            kept = [r for r in records if not predicate(r)]
            removed = len(records) - len(kept)
            if removed:
                self._save(kept)
            return removed

    def find(self, **kwargs) -> List[Dict]:
        """Return all records where fields match kwargs."""
        with self._lock:
            records = self._load()
        return [r for r in records if all(r.get(k) == v for k, v in kwargs.items())]
