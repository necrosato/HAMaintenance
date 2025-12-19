from __future__ import annotations

from datetime import datetime, timedelta, timezone

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN
from .storage import MaintenanceDB, Task, utcnow


def _ensure_aware(dt: datetime | None) -> datetime | None:
    """Ensure datetime is timezone-aware (UTC)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _compute_due(last_done: datetime | None, freq_days: int) -> datetime | None:
    if last_done is None:
        return None
    if freq_days <= 0:
        return None
    return last_done + timedelta(days=int(freq_days))


ADD_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("task_id"): cv.string,
        vol.Required("title"): cv.string,
        vol.Required("zone"): cv.string,
        vol.Optional("freq_days", default=0): vol.Coerce(int),
        vol.Optional("est_min", default=0): vol.Coerce(int),
        vol.Optional("notes", default=""): cv.string,
        vol.Optional("last_done"): cv.datetime,
    },
    extra=vol.PREVENT_EXTRA,
)

UPDATE_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("task_id"): cv.string,
        vol.Optional("title"): cv.string,
        vol.Optional("zone"): cv.string,
        vol.Optional("freq_days"): vol.Coerce(int),
        vol.Optional("est_min"): vol.Coerce(int),
        vol.Optional("notes"): cv.string,
        vol.Optional("last_done"): cv.datetime,
    },
    extra=vol.PREVENT_EXTRA,
)

DELETE_TASK_SCHEMA = vol.Schema(
    {vol.Required("task_id"): cv.string},
    extra=vol.PREVENT_EXTRA,
)

START_SCHEMA = vol.Schema(
    {
        vol.Required("task_id"): cv.string,
        vol.Required("user"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

PAUSE_SCHEMA = vol.Schema(
    {
        vol.Required("task_id"): cv.string,
        vol.Required("user"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

COMPLETE_SCHEMA = vol.Schema(
    {
        vol.Required("task_id"): cv.string,
        vol.Required("user"): cv.string,
        # Optional: allow overriding actual minutes spent on completion
        vol.Optional("actual_min"): vol.Coerce(int),
    },
    extra=vol.PREVENT_EXTRA,
)


async def async_setup_services(hass: HomeAssistant, db: MaintenanceDB) -> None:
    async def handle_add_task(call: ServiceCall) -> None:
        data = ADD_TASK_SCHEMA(dict(call.data))

        task_id = data["task_id"].strip()
        if not task_id:
            raise HomeAssistantError("task_id cannot be empty")

        if db.get(task_id):
            raise HomeAssistantError(f"Task already exists: {task_id}")

        freq_days = int(data.get("freq_days", 0))
        est_min = int(data.get("est_min", 0))

        last_done = _ensure_aware(data.get("last_done"))
        due = _compute_due(last_done, freq_days)

        t = Task(
            id=task_id,
            title=data["title"].strip(),
            zone=data["zone"].strip() or "Unsorted",
            freq_days=freq_days,
            est_min=est_min,
            avg_min=est_min,  # start avg at estimate (optional)
            n=0,
            status="idle",
            locked_by=None,
            started_at=None,
            accum_sec=0,
            notes=data.get("notes", "") or "",
            last_done=last_done,
            due=due,
        )

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def handle_update_task(call: ServiceCall) -> None:
        data = UPDATE_TASK_SCHEMA(dict(call.data))
        task_id = data["task_id"]

        t = db.get(task_id)
        if not t:
            raise HomeAssistantError(f"Unknown task: {task_id}")

        # Apply updates
        if "title" in data:
            t.title = data["title"].strip()
        if "zone" in data:
            t.zone = data["zone"].strip() or "Unsorted"
        if "freq_days" in data:
            t.freq_days = int(data["freq_days"])
        if "est_min" in data:
            t.est_min = int(data["est_min"])
        if "notes" in data:
            t.notes = data["notes"] or ""

        if "last_done" in data:
            t.last_done = _ensure_aware(data.get("last_done"))

        t.due = _compute_due(t.last_done, int(t.freq_days or 0))

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def handle_delete_task(call: ServiceCall) -> None:
        data = DELETE_TASK_SCHEMA(dict(call.data))
        task_id = data["task_id"]

        if not db.get(task_id):
            raise HomeAssistantError(f"Unknown task: {task_id}")

        db.delete(task_id)
        await db.async_save()
        await db.notify()

    async def handle_start_task(call: ServiceCall) -> None:
        data = START_SCHEMA(dict(call.data))
        task_id = data["task_id"]
        user = data["user"]

        t = db.get(task_id)
        if not t:
            raise HomeAssistantError(f"Unknown task: {task_id}")

        # Lock rules
        if t.locked_by is not None and t.locked_by != user:
            raise HomeAssistantError(f"Task is locked by {t.locked_by}")

        # If already running, ignore
        if t.status == "running" and t.started_at:
            return

        t.locked_by = user
        t.status = "running"
        t.started_at = utcnow()

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def handle_pause_task(call: ServiceCall) -> None:
        data = PAUSE_SCHEMA(dict(call.data))
        task_id = data["task_id"]
        user = data["user"]

        t = db.get(task_id)
        if not t:
            raise HomeAssistantError(f"Unknown task: {task_id}")

        if t.locked_by is not None and t.locked_by != user:
            raise HomeAssistantError(f"Task is locked by {t.locked_by}")

        if t.status != "running" or not t.started_at:
            # nothing to pause
            t.status = "paused" if t.locked_by == user else (t.status or "idle")
            db.upsert(t)
            await db.async_save()
            await db.notify()
            return

        now = utcnow()
        elapsed = int((now - t.started_at).total_seconds())
        if elapsed < 0:
            elapsed = 0

        t.accum_sec = int(t.accum_sec or 0) + elapsed
        t.started_at = None
        t.status = "paused"

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def handle_complete_task(call: ServiceCall) -> None:
        data = COMPLETE_SCHEMA(dict(call.data))
        task_id = data["task_id"]
        user = data["user"]
        actual_min = data.get("actual_min")

        t = db.get(task_id)
        if not t:
            raise HomeAssistantError(f"Unknown task: {task_id}")

        # Respect lock if someone else holds it
        if t.locked_by is not None and t.locked_by != user:
            raise HomeAssistantError(f"Task is locked by {t.locked_by}")

        now = utcnow()

        # If running, fold running time into accum before completing
        if t.status == "running" and t.started_at:
            elapsed = int((now - t.started_at).total_seconds())
            if elapsed < 0:
                elapsed = 0
            t.accum_sec = int(t.accum_sec or 0) + elapsed

        # Determine minutes spent for stats
        spent_min = None
        if actual_min is not None:
            spent_min = max(0, int(actual_min))
        else:
            spent_min = max(0, int((int(t.accum_sec or 0)) // 60))

        # Update avg_min (simple running average)
        prev_n = int(t.n or 0)
        prev_avg = int(t.avg_min or 0)
        new_n = prev_n + 1
        if new_n <= 0:
            new_avg = spent_min
        else:
            new_avg = int(round((prev_avg * prev_n + spent_min) / new_n))

        t.n = new_n
        t.avg_min = new_avg

        # Completion sets last_done and reschedules due from completion time (your requirement)
        t.last_done = now
        if int(t.freq_days or 0) > 0:
            t.due = now + timedelta(days=int(t.freq_days))
        else:
            t.due = None

        # Clear runtime state
        t.locked_by = None
        t.started_at = None
        t.accum_sec = 0
        t.status = "idle"

        db.upsert(t)
        await db.async_save()
        await db.notify()

    hass.services.async_register(DOMAIN, "add_task", handle_add_task, schema=ADD_TASK_SCHEMA)
    hass.services.async_register(DOMAIN, "update_task", handle_update_task, schema=UPDATE_TASK_SCHEMA)
    hass.services.async_register(DOMAIN, "delete_task", handle_delete_task, schema=DELETE_TASK_SCHEMA)

    hass.services.async_register(DOMAIN, "start_task", handle_start_task, schema=START_SCHEMA)
    hass.services.async_register(DOMAIN, "pause_task", handle_pause_task, schema=PAUSE_SCHEMA)
    hass.services.async_register(DOMAIN, "complete_task", handle_complete_task, schema=COMPLETE_SCHEMA)

