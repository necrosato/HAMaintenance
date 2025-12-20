from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, PLATFORMS
from .services import async_setup_services
from .storage import MaintenanceDB

_LOGGER = logging.getLogger(__name__)

PANEL_URL_PATH = "maintenance"
STATIC_URL_PATH = "/api/maintenance/static"
PANEL_ELEMENT = "maintenance-panel"
DEFAULT_PANEL_CONFIG = {
    "name": PANEL_ELEMENT,
    "entity": "sensor.maintenance_tasks",
    "user_entity": "select.maintenance_user",
}

WWW_DIR = Path(__file__).parent / "www"


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    # Needed for config entry based integrations
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})

    await _register_static_assets(hass)
    await _register_panel(hass)

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
        if not hass.config_entries.async_entries(DOMAIN):
            if hass.data[DOMAIN].pop("panel_registered", False):
                try:
                    await frontend.async_remove_panel(hass, PANEL_URL_PATH)
                except Exception as err:  # HA may not support removal; avoid crash
                    _LOGGER.debug("Unable to remove panel %s: %s", PANEL_URL_PATH, err)
    return unload_ok


async def _register_static_assets(hass: HomeAssistant) -> None:
    """Expose frontend assets under /api/maintenance/static using async API."""

    if hass.data[DOMAIN].get("static_registered"):
        return

    if not WWW_DIR.exists():
        _LOGGER.warning("Maintenance frontend directory missing: %s", WWW_DIR)
        return

    # Home Assistant 2025.7+ requires the async helper; avoid the synchronous
    # register_static_path call that triggers frame warnings.
    async_register = getattr(hass.http, "async_register_static_paths", None)
    if not async_register:
        _LOGGER.error(
            "Home Assistant version lacks async_register_static_paths; "
            "unable to expose Maintenance frontend assets."
        )
        return

    await async_register([StaticPathConfig(STATIC_URL_PATH, str(WWW_DIR), cache=False)])

    hass.data[DOMAIN]["static_registered"] = True


async def _register_panel(hass: HomeAssistant) -> None:
    """Register the Maintenance sidebar panel once."""

    if hass.data[DOMAIN].get("panel_registered"):
        return

    module_url = f"{STATIC_URL_PATH}/maintenance-panel.js"

    panel_config = {
        **DEFAULT_PANEL_CONFIG,
        "module_url": module_url,
        "embed_iframe": False,
        "trust_external": False,
    }

    await frontend.async_register_panel(
        hass,
        component_name="custom",
        frontend_url_path=PANEL_URL_PATH,
        sidebar_title="Maintenance",
        sidebar_icon="mdi:tools",
        config=panel_config,
        require_admin=False,
        update=True,
    )

    hass.data[DOMAIN]["panel_registered"] = True
    _LOGGER.debug("Registered Maintenance panel at /%s", PANEL_URL_PATH)

