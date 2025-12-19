from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS
from .storage import MaintenanceDB
from .services import async_setup_services


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    # Needed for config entry based integrations
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})

    # Create DB once per entry
    db = MaintenanceDB(hass, entry.entry_id)
    await db.async_load()

    # Store entry data
    name = entry.title or "Maintenance"
    hass.data[DOMAIN][entry.entry_id] = {
        "db": db,
        "name": name,
    }

    # ✅ Register services ONCE globally
    # If you have multiple entries, you still want only one set of services.
    if not hass.data[DOMAIN].get("_services_registered"):
        await async_setup_services(hass, db)
        hass.data[DOMAIN]["_services_registered"] = True

    # Forward platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
    return unload_ok

