from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORE_KEY, STORE_VERSION


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Task:
    id: str
    title: str
    zone: str
    freq_days: int
    due: datetime | None = None
    last_done: datetime | None = None
    notes: str = ""

    status: str = "idle"          # idle|running|paused
    locked_by: str | None = None
    started_at: datetime | None = None
    accum_sec: int = 0

    est_min: int = 15
    avg_min: int = 15
    n: int = 0

    def to_dict(self) -> dict[str, Any]:
        def dt(v: datetime | None) -> str | None:
            return v.isoformat() if v else None

        return {
            "id": self.id,
            "title": self.title,
            "zone": self.zone,
            "freq_days": int(self.freq_days),
            "due": dt(self.due),
            "last_done": dt(self.last_done),
            "notes": self.notes,

            "status": self.status,
            "locked_by": self.locked_by,
            "started_at": dt(self.started_at),
            "accum_sec": int(self.accum_sec),

            "est_min": int(self.est_min),
            "avg_min": int(self.avg_min),
            "n": int(self.n),
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> "Task":
        def parse_dt(s: str | None) -> datetime | None:
            if not s:
                return None
            # isoformat with timezone expected; accept naive -> assume UTC
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt

        return Task(
            id=data["id"],
            title=data.get("title", data["id"]),
            zone=data.get("zone", "Unsorted"),
            freq_days=int(data.get("freq_days", 0)),
            due=parse_dt(data.get("due")),
            last_done=parse_dt(data.get("last_done")),
            notes=data.get("notes", ""),

            status=data.get("status", "idle"),
            locked_by=data.get("locked_by"),
            started_at=parse_dt(data.get("started_at")),
            accum_sec=int(data.get("accum_sec", 0)),

            est_min=int(data.get("est_min", 15)),
            avg_min=int(data.get("avg_min", int(data.get("est_min", 15)))),
            n=int(data.get("n", 0)),
        )


@dataclass
class MaintenanceDB:
    hass: HomeAssistant
    store: Store
    tasks: dict[str, Task] = field(default_factory=dict)
    _listeners: list[Callable[[], None]] = field(default_factory=list)

    @classmethod
    def create(cls, hass: HomeAssistant) -> "MaintenanceDB":
        return cls(hass=hass, store=Store(hass, STORE_VERSION, STORE_KEY))

    async def async_load(self) -> None:
        data = await self.store.async_load() or {}
        raw_tasks = data.get("tasks", {})
        tasks: dict[str, Task] = {}
        if isinstance(raw_tasks, dict):
            for tid, tdata in raw_tasks.items():
                if isinstance(tdata, dict):
                    tdata.setdefault("id", tid)
                    try:
                        tasks[tid] = Task.from_dict(tdata)
                    except Exception:
                        # skip corrupted task rather than breaking startup
                        continue
        self.tasks = tasks

    async def async_save(self) -> None:
        payload = {"tasks": {tid: t.to_dict() for tid, t in self.tasks.items()}}
        await self.store.async_save(payload)

    def add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)

        def _remove() -> None:
            if cb in self._listeners:
                self._listeners.remove(cb)

        return _remove

    async def notify(self) -> None:
        for cb in list(self._listeners):
            try:
                cb()
            except Exception:
                continue

    # --- helpers ---
    def get(self, task_id: str) -> Task | None:
        return self.tasks.get(task_id)

    def upsert(self, task: Task) -> None:
        self.tasks[task.id] = task

    def delete(self, task_id: str) -> None:
        self.tasks.pop(task_id, None)


