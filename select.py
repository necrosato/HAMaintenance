from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .storage import MaintenanceDB


class MaintenanceTaskSelect(SelectEntity):
    _attr_has_entity_name = True

    def __init__(self, db: MaintenanceDB, name: str, unique_id: str) -> None:
        self._db = db
        self._attr_name = f"{name} Task"
        self._attr_unique_id = unique_id
        self._options: list[str] = []
        self._current: str | None = None
        self._remove_listener = None

    async def async_added_to_hass(self) -> None:
        self._remove_listener = self._db.add_listener(self._refresh_from_db)
        self._refresh_from_db()
        self.async_write_ha_state()

    async def async_will_remove_from_hass(self) -> None:
        if self._remove_listener:
            self._remove_listener()

    def _refresh_from_db(self) -> None:
        opts = sorted(self._db.tasks.keys())
        self._options = opts
        if self._current not in opts:
            self._current = opts[0] if opts else None
        self.async_write_ha_state()

    @property
    def options(self) -> list[str]:
        return self._options

    @property
    def current_option(self) -> str | None:
        return self._current

    async def async_select_option(self, option: str) -> None:
        if option not in self._options:
            return
        self._current = option
        self.async_write_ha_state()


class MaintenanceUserSelect(SelectEntity):
    _attr_has_entity_name = True

    def __init__(self, name: str, unique_id: str) -> None:
        self._attr_name = f"{name} User"
        self._attr_unique_id = unique_id
        self._options = ["Naookie"]  # start simple; you can add UI later
        self._current = "Naookie"

    @property
    def options(self) -> list[str]:
        return self._options

    @property
    def current_option(self) -> str | None:
        return self._current

    async def async_select_option(self, option: str) -> None:
        if option not in self._options:
            # allow new users without code changes
            self._options = sorted(set(self._options + [option]))
        self._current = option
        self.async_write_ha_state()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities) -> None:
    db: MaintenanceDB = hass.data[DOMAIN][entry.entry_id]["db"]
    name: str = hass.data[DOMAIN][entry.entry_id]["name"]

    async_add_entities(
        [
            MaintenanceTaskSelect(db=db, name=name, unique_id=f"{entry.entry_id}_task_select"),
            MaintenanceUserSelect(name=name, unique_id=f"{entry.entry_id}_user_select"),
        ]
    )

