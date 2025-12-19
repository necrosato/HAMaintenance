from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import CONF_NAME, DEFAULT_NAME, DOMAIN


class MaintenanceConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is None:
            return self.async_show_form(
                step_id="user",
                data_schema=vol.Schema({vol.Optional(CONF_NAME, default=DEFAULT_NAME): str}),
            )

        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title=user_input.get(CONF_NAME, DEFAULT_NAME), data=user_input)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return None

