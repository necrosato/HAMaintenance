from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONF_NAME, DEFAULT_NAME, DOMAIN, PLATFORMS
from .services import async_register_services
from .storage import MaintenanceDB


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    db = MaintenanceDB.create(hass)
    await db.async_load()

    hass.data[DOMAIN][entry.entry_id] = {
        "db": db,
        "name": entry.data.get(CONF_NAME, DEFAULT_NAME),
    }

    await async_register_services(hass, db)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok


