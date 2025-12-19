from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store


STORAGE_VERSION = 1
STORAGE_KEY_PREFIX = "maintenance_db"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _dt_from_iso(val: Any) -> Optional[datetime]:
    if not val:
        return None
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    if isinstance(val, str):
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def _dt_to_iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class Task:
    id: str
    title: str
    zone: str
    freq_days: int = 0
    est_min: int = 0
    avg_min: int = 0
    n: int = 0

    status: str = "idle"  # idle|running|paused
    locked_by: Optional[str] = None
    started_at: Optional[datetime] = None
    accum_sec: int = 0

    notes: str = ""

    last_done: Optional[datetime] = None
    due: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["started_at"] = _dt_to_iso(self.started_at)
        d["last_done"] = _dt_to_iso(self.last_done)
        d["due"] = _dt_to_iso(self.due)
        return d

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "Task":
        return Task(
            id=str(d.get("id", "")),
            title=str(d.get("title", "")),
            zone=str(d.get("zone", "Unsorted") or "Unsorted"),
            freq_days=int(d.get("freq_days", 0) or 0),
            est_min=int(d.get("est_min", 0) or 0),
            avg_min=int(d.get("avg_min", d.get("est_min", 0)) or 0),
            n=int(d.get("n", 0) or 0),

            status=str(d.get("status", "idle") or "idle"),
            locked_by=d.get("locked_by"),
            started_at=_dt_from_iso(d.get("started_at")),
            accum_sec=int(d.get("accum_sec", 0) or 0),

            notes=str(d.get("notes", "") or ""),

            last_done=_dt_from_iso(d.get("last_done")),
            due=_dt_from_iso(d.get("due")),
        )


class MaintenanceDB:
    """Simple JSON storage for tasks, keyed per config entry."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self.hass = hass
        self.entry_id = entry_id

        storage_key = f"{STORAGE_KEY_PREFIX}_{entry_id}"
        self.store: Store = Store(hass, STORAGE_VERSION, storage_key)

        self.tasks: Dict[str, Task] = {}
        self._listeners: list[Callable[[], None]] = []

    def add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)

        def remove() -> None:
            try:
                self._listeners.remove(cb)
            except ValueError:
                pass

        return remove

    async def notify(self) -> None:
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:
                # don't crash HA for a bad UI callback
                pass

    def get(self, task_id: str) -> Optional[Task]:
        return self.tasks.get(task_id)

    def upsert(self, task: Task) -> None:
        self.tasks[task.id] = task

    def delete(self, task_id: str) -> None:
        self.tasks.pop(task_id, None)

    async def async_load(self) -> None:
        data = await self.store.async_load() or {}
        raw_tasks = data.get("tasks", {})

        tasks: Dict[str, Task] = {}
        if isinstance(raw_tasks, dict):
            for tid, td in raw_tasks.items():
                if isinstance(td, dict):
                    td = dict(td)
                    td.setdefault("id", tid)
                    t = Task.from_dict(td)
                    # Preserve runtime state across HA restarts so running timers keep accruing
                    # wall time. If the start timestamp is missing, fall back to a paused state
                    # to avoid runaway counters with an unknown origin.
                    if t.status == "running":
                        if t.started_at:
                            t.started_at = t.started_at.astimezone(timezone.utc)
                        else:
                            t.status = "paused"
                    if t.id:
                        tasks[t.id] = t

        self.tasks = tasks

    async def async_save(self) -> None:
        data = {"tasks": {tid: t.to_dict() for tid, t in self.tasks.items()}}
        await self.store.async_save(data)


