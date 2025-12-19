from __future__ import annotations

from datetime import datetime, timedelta, timezone

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import (
    ATTR_DUE,
    ATTR_FREQ_DAYS,
    ATTR_NOTES,
    ATTR_TASK_ID,
    ATTR_TITLE,
    ATTR_USER,
    ATTR_ZONE,
    ATTR_MANUAL_MIN,
    DOMAIN,
    STATUS_IDLE,
    STATUS_PAUSED,
    STATUS_RUNNING,
    SERVICE_ADD_TASK,
    SERVICE_COMPLETE_TASK,
    SERVICE_DELETE_TASK,
    SERVICE_PAUSE_TASK,
    SERVICE_START_TASK,
    SERVICE_UPDATE_TASK,
)
from .storage import MaintenanceDB, Task, utcnow


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


ADD_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_TASK_ID): cv.slug,
        vol.Required(ATTR_TITLE): cv.string,
        vol.Required(ATTR_ZONE): cv.string,
        vol.Optional(ATTR_FREQ_DAYS, default=0): vol.Coerce(int),
        vol.Optional(ATTR_DUE): cv.string,
        vol.Optional(ATTR_NOTES, default=""): cv.string,
        vol.Optional("est_min"): vol.Coerce(int),
        vol.Optional("last_done"): cv.datetime,
        vol.Optional("due"): cv.datetime,
    }
)

UPDATE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_TASK_ID): cv.slug,
        vol.Optional(ATTR_TITLE): cv.string,
        vol.Optional(ATTR_ZONE): cv.string,
        vol.Optional(ATTR_FREQ_DAYS): vol.Coerce(int),
        vol.Optional(ATTR_DUE): cv.string,
        vol.Optional(ATTR_NOTES): cv.string,
        vol.Optional("est_min"): vol.Coerce(int),
        vol.Optional("last_done"): cv.datetime,
        vol.Optional("due"): cv.datetime,
    }
)

DELETE_SCHEMA = vol.Schema({vol.Required(ATTR_TASK_ID): cv.slug})

START_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_TASK_ID): cv.slug,
        vol.Required(ATTR_USER): cv.string,
    }
)

PAUSE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_TASK_ID): cv.slug,
        vol.Required(ATTR_USER): cv.string,
    }
)

COMPLETE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_TASK_ID): cv.slug,
        vol.Required(ATTR_USER): cv.string,
        vol.Optional(ATTR_MANUAL_MIN): vol.Coerce(int),
    }
)


def _ensure_task(db: MaintenanceDB, task_id: str) -> Task:
    task = db.get(task_id)
    if not task:
        raise vol.Invalid(f"Unknown task_id: {task_id}")
    return task


def _assert_lock_owner(task: Task, user: str) -> None:
    if task.locked_by is not None and task.locked_by != user:
        raise vol.Invalid(f"Task is locked by {task.locked_by}")


async def async_register_services(hass: HomeAssistant, db: MaintenanceDB) -> None:
    async def add_task(call: ServiceCall) -> None:
        tid = call.data[ATTR_TASK_ID]
        t = Task(
            id=tid,
            title=call.data[ATTR_TITLE],
            zone=call.data[ATTR_ZONE],
            freq_days=int(call.data.get(ATTR_FREQ_DAYS, 0)),
            due=_parse_dt(call.data.get(ATTR_DUE)),
            notes=call.data.get(ATTR_NOTES, ""),
        )
        # initialize avg/est
        t.est_min = 15
        t.avg_min = 15
        t.n = 0

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def update_task(call: ServiceCall) -> None:
        tid = call.data[ATTR_TASK_ID]
        t = _ensure_task(db, tid)

        if ATTR_TITLE in call.data:
            t.title = call.data[ATTR_TITLE]
        if ATTR_ZONE in call.data:
            t.zone = call.data[ATTR_ZONE]
        if ATTR_FREQ_DAYS in call.data:
            t.freq_days = int(call.data[ATTR_FREQ_DAYS])
        if ATTR_DUE in call.data:
            t.due = _parse_dt(call.data.get(ATTR_DUE))
        if ATTR_NOTES in call.data:
            t.notes = call.data.get(ATTR_NOTES, "")

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def delete_task(call: ServiceCall) -> None:
        tid = call.data[ATTR_TASK_ID]
        db.delete(tid)
        await db.async_save()
        await db.notify()

    async def start_task(call: ServiceCall) -> None:
        tid = call.data[ATTR_TASK_ID]
        user = call.data[ATTR_USER]
        t = _ensure_task(db, tid)

        # If locked by another user, reject
        _assert_lock_owner(t, user)

        # Lock and start timing
        t.locked_by = user
        t.status = STATUS_RUNNING
        t.started_at = utcnow()

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def pause_task(call: ServiceCall) -> None:
        tid = call.data[ATTR_TASK_ID]
        user = call.data[ATTR_USER]
        t = _ensure_task(db, tid)

        _assert_lock_owner(t, user)

        if t.status != STATUS_RUNNING or not t.started_at:
            raise vol.Invalid("Task is not running")

        now = utcnow()
        elapsed = int((now - t.started_at).total_seconds())
        t.accum_sec = int(t.accum_sec) + max(0, elapsed)
        t.started_at = None
        t.status = STATUS_PAUSED
        t.locked_by = user  # keep lock while paused

        db.upsert(t)
        await db.async_save()
        await db.notify()

    async def complete_task(call: ServiceCall) -> None:
        tid = call.data[ATTR_TASK_ID]
        user = call.data[ATTR_USER]
        manual_min = call.data.get(ATTR_MANUAL_MIN)
        t = _ensure_task(db, tid)

        _assert_lock_owner(t, user)

        # Fold running time into accum
        now = utcnow()
        if t.status == STATUS_RUNNING and t.started_at:
            elapsed = int((now - t.started_at).total_seconds())
            t.accum_sec = int(t.accum_sec) + max(0, elapsed)

        # Actual minutes
        if manual_min is not None and int(manual_min) > 0:
            actual_min = int(manual_min)
        else:
            actual_min = int(round(t.accum_sec / 60.0)) if t.accum_sec > 0 else 0

        # Rolling average update (only if we have a real measurement)
        if actual_min > 0:
            n = int(t.n)
            avg = int(t.avg_min or t.est_min or actual_min)
            new_avg = int(round((avg * n + actual_min) / (n + 1)))
            t.n = n + 1
            t.avg_min = new_avg
            t.est_min = new_avg  # keep them aligned for now

        # Recurrence from completion time (your requirement)
        t.last_done = now
        if int(t.freq_days) > 0:
            t.due = now + timedelta(days=int(t.freq_days))

        # Clear lock and timer state
        t.locked_by = None
        t.started_at = None
        t.accum_sec = 0
        t.status = STATUS_IDLE

        db.upsert(t)
        await db.async_save()
        await db.notify()

    hass.services.async_register(DOMAIN, SERVICE_ADD_TASK, add_task, schema=ADD_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_TASK, update_task, schema=UPDATE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_DELETE_TASK, delete_task, schema=DELETE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_START_TASK, start_task, schema=START_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_PAUSE_TASK, pause_task, schema=PAUSE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_COMPLETE_TASK, complete_task, schema=COMPLETE_SCHEMA)

