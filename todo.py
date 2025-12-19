from __future__ import annotations

from datetime import datetime, timedelta, timezone

from homeassistant.components.todo import (
    TodoItem,
    TodoItemStatus,
    TodoListEntity,
    TodoListEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN
from .storage import MaintenanceDB, Task, utcnow


class MaintenanceTodoEntity(TodoListEntity):
    """A Todo list entity backed by our MaintenanceDB."""

    _attr_has_entity_name = True

    # Tell HA this list is editable (this is what un-greys the UI)
    _attr_supported_features = (
        TodoListEntityFeature.CREATE_TODO_ITEM
        | TodoListEntityFeature.DELETE_TODO_ITEM
        | TodoListEntityFeature.UPDATE_TODO_ITEM
        | TodoListEntityFeature.SET_DUE_DATETIME_ON_ITEM
        | TodoListEntityFeature.SET_DESCRIPTION_ON_ITEM
    )

    def __init__(self, db: MaintenanceDB, name: str, unique_id: str) -> None:
        self._db = db
        self._attr_name = name
        self._attr_unique_id = unique_id
        self._remove_listener = None

    async def async_added_to_hass(self) -> None:
        self._remove_listener = self._db.add_listener(self.async_write_ha_state)

    async def async_will_remove_from_hass(self) -> None:
        if self._remove_listener:
            self._remove_listener()

    @property
    def todo_items(self) -> list[TodoItem]:
        items: list[TodoItem] = []
        for t in self._db.tasks.values():
            items.append(
                TodoItem(
                    summary=f"[{t.zone}] {t.title}",
                    uid=t.id,
                    status=TodoItemStatus.NEEDS_ACTION,
                    due=t.due,
                    description=self._description_for_task(t),
                )
            )

        # Sort by due (None last), then stable by summary
        def key(i: TodoItem):
            return (
                i.due is None,
                i.due or datetime.max.replace(tzinfo=timezone.utc),
                i.summary,
            )

        items.sort(key=key)
        return items

    @property
    def extra_state_attributes(self) -> dict:
        """Expose items for debugging + future dashboards."""
        out = []
        for it in self.todo_items:
            out.append(
                {
                    "uid": it.uid,
                    "summary": it.summary,
                    "status": it.status.value if it.status else None,
                    "due": it.due.isoformat() if it.due else None,
                    "description": it.description,
                }
            )
        return {"items": out}

    def _description_for_task(self, t: Task) -> str:
        def iso(dt: datetime | None) -> str | None:
            return dt.isoformat() if dt else None

        lines = [
            f"id={t.id}",
            f"zone={t.zone}",
            f"freq_days={t.freq_days}",
            f"due={iso(t.due)}",
            f"last_done={iso(t.last_done)}",
            f"status={t.status}",
            f"locked_by={t.locked_by}",
            f"started_at={iso(t.started_at)}",
            f"accum_sec={t.accum_sec}",
            f"est_min={t.est_min}",
            f"avg_min={t.avg_min}",
            f"n={t.n}",
        ]
        if t.notes:
            lines += ["", "notes:", t.notes]
        return "\n".join(lines)

    async def async_create_todo_item(self, item: TodoItem) -> None:
        # Creating via UI makes an "Unsorted" task unless user typed "[Zone] Title"
        tid = (item.uid or "").strip()
        if not tid:
            # derive a reasonable id from summary
            tid = item.summary.lower().replace(" ", "_").replace("-", "_")
            tid = "".join(ch for ch in tid if ch.isalnum() or ch == "_")
        if not tid:
            raise HomeAssistantError("Could not derive task id")

        title = item.summary or tid
        zone = "Unsorted"

        if title.startswith("[") and "]" in title:
            z = title[1 : title.index("]")]
            rest = title[title.index("]") + 1 :].strip()
            if z.strip():
                zone = z.strip()
            if rest:
                title = rest

        t = Task(
            id=tid,
            title=title,
            zone=zone,
            freq_days=0,
            due=item.due,
            notes=item.description or "",
        )
        self._db.upsert(t)
        await self._db.async_save()
        await self._db.notify()

    async def async_update_todo_item(self, item: TodoItem) -> None:
        tid = item.uid
        if not tid:
            raise HomeAssistantError("Todo item missing uid")

        t = self._db.get(tid)
        if not t:
            raise HomeAssistantError(f"Unknown task id: {tid}")

        # If user checks the box in the UI: treat as "complete now"
        if item.status == TodoItemStatus.COMPLETED:
            if t.locked_by is not None:
                raise HomeAssistantError(f"Task is locked by {t.locked_by}")

            now = utcnow()

            # Mark completion
            t.last_done = now
            if int(t.freq_days) > 0:
                t.due = now + timedelta(days=int(t.freq_days))

            # Clear runtime state
            t.locked_by = None
            t.started_at = None
            t.accum_sec = 0
            t.status = "idle"

            self._db.upsert(t)
            await self._db.async_save()
            await self._db.notify()
            return

        # Otherwise treat it as an edit (summary/due/description)
        title = item.summary or t.title
        zone = t.zone

        if title.startswith("[") and "]" in title:
            z = title[1 : title.index("]")]
            rest = title[title.index("]") + 1 :].strip()
            if z.strip():
                zone = z.strip()
            if rest:
                title = rest

        t.title = title
        t.zone = zone
        t.due = item.due

        if item.description is not None:
            t.notes = item.description

        self._db.upsert(t)
        await self._db.async_save()
        await self._db.notify()

    async def async_delete_todo_items(self, uids: list[str]) -> None:
        for tid in uids:
            self._db.delete(tid)
        await self._db.async_save()
        await self._db.notify()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    db: MaintenanceDB = hass.data[DOMAIN][entry.entry_id]["db"]
    name: str = hass.data[DOMAIN][entry.entry_id]["name"]
    unique_id: str = f"{entry.entry_id}_todo"
    async_add_entities([MaintenanceTodoEntity(db=db, name=name, unique_id=unique_id)])

