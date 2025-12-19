from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN
from .storage import MaintenanceDB


def _find_entity_id(hass: HomeAssistant, domain: str, contains: str) -> str:
    # Helper to locate our select entities even if entity_id differs slightly
    for st in hass.states.async_all(domain):
        if contains in st.entity_id:
            return st.entity_id
    raise HomeAssistantError(f"Could not find {domain} entity containing '{contains}'")


def _get_selected(hass: HomeAssistant, task_select_eid: str, user_select_eid: str) -> tuple[str, str]:
    task_id = hass.states.get(task_select_eid).state
    user = hass.states.get(user_select_eid).state
    if task_id in ("unknown", "unavailable", "", None):
        raise HomeAssistantError("No task selected")
    if user in ("unknown", "unavailable", "", None):
        raise HomeAssistantError("No user selected")
    return task_id, user


class _BaseMaintenanceButton(ButtonEntity):
    _attr_has_entity_name = True

    def __init__(self, hass: HomeAssistant, db: MaintenanceDB, name: str, unique_id: str) -> None:
        self.hass = hass
        self._db = db
        self._attr_name = name
        self._attr_unique_id = unique_id
        self._task_select_eid: str | None = None
        self._user_select_eid: str | None = None

    async def async_added_to_hass(self) -> None:
        # Find our selects once entity registry is available
        self._task_select_eid = _find_entity_id(self.hass, "select", "maintenance_task")
        self._user_select_eid = _find_entity_id(self.hass, "select", "maintenance_user")

    def _selected(self) -> tuple[str, str]:
        if not self._task_select_eid or not self._user_select_eid:
            raise HomeAssistantError("Selector entities not ready")
        return _get_selected(self.hass, self._task_select_eid, self._user_select_eid)


class MaintenanceStartButton(_BaseMaintenanceButton):
    async def async_press(self) -> None:
        task_id, user = self._selected()
        await self.hass.services.async_call(
            DOMAIN, "start_task", {"task_id": task_id, "user": user}, blocking=True
        )


class MaintenancePauseButton(_BaseMaintenanceButton):
    async def async_press(self) -> None:
        task_id, user = self._selected()
        await self.hass.services.async_call(
            DOMAIN, "pause_task", {"task_id": task_id, "user": user}, blocking=True
        )


class MaintenanceCompleteButton(_BaseMaintenanceButton):
    async def async_press(self) -> None:
        task_id, user = self._selected()
        await self.hass.services.async_call(
            DOMAIN, "complete_task", {"task_id": task_id, "user": user}, blocking=True
        )


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    db: MaintenanceDB = hass.data[DOMAIN][entry.entry_id]["db"]
    name: str = hass.data[DOMAIN][entry.entry_id]["name"]

    async_add_entities(
        [
            MaintenanceStartButton(hass, db, f"{name} Start", f"{entry.entry_id}_start_btn"),
            MaintenancePauseButton(hass, db, f"{name} Pause", f"{entry.entry_id}_pause_btn"),
            MaintenanceCompleteButton(hass, db, f"{name} Complete", f"{entry.entry_id}_complete_btn"),
        ]
    )

