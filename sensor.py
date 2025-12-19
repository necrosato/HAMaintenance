from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .storage import MaintenanceDB, _dt_to_iso, utcnow


def _iso(dt: datetime | None) -> str | None:
    return _dt_to_iso(dt)


def _days_left(due: datetime | None) -> int | None:
    if not due:
        return None
    now = utcnow()
    delta = due - now
    # floor to whole days (overdue becomes negative)
    return int(delta.total_seconds() // 86400)


def _sort_key(task: Any):
    # overdue first, then soonest due, then title
    due = task.get("due")
    if due:
        try:
            d = datetime.fromisoformat(due)
            if d.tzinfo is None:
                d = d.replace(tzinfo=timezone.utc)
        except Exception:
            d = None
    else:
        d = None
    return (d is None, d or datetime.max.replace(tzinfo=timezone.utc), task.get("title", ""))


class MaintenanceTasksSensor(SensorEntity):
    """Provides a UI-friendly list of tasks in attributes."""

    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, db: MaintenanceDB, name: str, unique_id: str) -> None:
        self.hass = hass
        self._db = db
        self._attr_name = f"{name} Tasks"
        self._attr_unique_id = unique_id
        self._remove_listener = None

    async def async_added_to_hass(self) -> None:
        self._remove_listener = self._db.add_listener(self.async_write_ha_state)

    async def async_will_remove_from_hass(self) -> None:
        if self._remove_listener:
            self._remove_listener()

    @property
    def native_value(self) -> int:
        # State = count of active tasks
        return len(self._db.tasks)

    @property
    def extra_state_attributes(self) -> dict:
        tasks = []
        zones = set()

        now = utcnow()

        for t in self._db.tasks.values():
            zones.add(t.zone or "Unsorted")

            running_sec = 0
            if t.status == "running" and t.started_at:
                running_sec = int((now - t.started_at).total_seconds())
                if running_sec < 0:
                    running_sec = 0

            total_sec = int(t.accum_sec) + running_sec

            tasks.append(
                {
                    "id": t.id,
                    "title": t.title,
                    "zone": t.zone or "Unsorted",
                    "freq_days": int(t.freq_days or 0),

                    "due": _iso(t.due),
                    "last_done": _iso(t.last_done),
                    "last_done_by": t.last_done_by,
                    "days_left": _days_left(t.due),

                    "status": t.status,
                    "locked_by": t.locked_by,
                    "started_at": _iso(t.started_at),

                    "accum_sec": int(t.accum_sec or 0),
                    "running_sec": running_sec,
                    "total_sec": total_sec,

                    "est_min": int(t.est_min or 0),
                    "avg_min": int(t.avg_min or 0),
                    "n": int(t.n or 0),

                    "notes": t.notes or "",
                }
            )

        tasks.sort(key=_sort_key)
        return {"tasks": tasks, "zones": sorted(zones)}


class MaintenanceSelectedTaskSensor(SensorEntity):
    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, db: MaintenanceDB, name: str, unique_id: str) -> None:
        self.hass = hass
        self._db = db
        self._attr_name = f"{name} Selected Task"
        self._attr_unique_id = unique_id
        self._remove_listener = None
        self._task_select_eid: str | None = None

    async def async_added_to_hass(self) -> None:
        self._task_select_eid = next(
            (st.entity_id for st in self.hass.states.async_all("select") if "maintenance_task" in st.entity_id),
            None,
        )
        self._remove_listener = self._db.add_listener(self.async_write_ha_state)

    async def async_will_remove_from_hass(self) -> None:
        if self._remove_listener:
            self._remove_listener()

    @property
    def native_value(self) -> str:
        if not self._task_select_eid:
            return "none"
        return self.hass.states.get(self._task_select_eid).state

    @property
    def extra_state_attributes(self) -> dict:
        if not self._task_select_eid:
            return {}

        tid = self.hass.states.get(self._task_select_eid).state
        t = self._db.get(tid)
        if not t:
            return {"error": "unknown task"}

        now = utcnow()
        running_sec = 0
        if t.status == "running" and t.started_at:
            running_sec = int((now - t.started_at).total_seconds())
            if running_sec < 0:
                running_sec = 0

        total_sec = int(t.accum_sec) + running_sec

        return {
            "title": t.title,
            "zone": t.zone,
            "freq_days": t.freq_days,
            "due": _iso(t.due),
            "last_done": _iso(t.last_done),
            "last_done_by": t.last_done_by,
            "days_left": _days_left(t.due),
            "status": t.status,
            "locked_by": t.locked_by,
            "started_at": _iso(t.started_at),
            "accum_sec": int(t.accum_sec or 0),
            "running_sec": running_sec,
            "total_sec": total_sec,
            "est_min": t.est_min,
            "avg_min": t.avg_min,
            "n": t.n,
            "notes": t.notes,
        }


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    db: MaintenanceDB = hass.data[DOMAIN][entry.entry_id]["db"]
    name: str = hass.data[DOMAIN][entry.entry_id]["name"]

    async_add_entities(
        [
            MaintenanceTasksSensor(hass, db, name, f"{entry.entry_id}_tasks_sensor"),
            MaintenanceSelectedTaskSensor(hass, db, name, f"{entry.entry_id}_selected_sensor"),
        ]
    )

