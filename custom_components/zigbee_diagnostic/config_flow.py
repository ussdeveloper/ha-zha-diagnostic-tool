"""Config flow for Zigbee Diagnostic integration."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    CONF_ENABLE_PERSISTENT_NOTIFICATIONS,
    CONF_LOG_ERRORS_WINDOW_MINUTES,
    CONF_LOW_LQI_THRESHOLD,
    CONF_NOTIFY_SERVICE,
    CONF_OFFLINE_GRACE_MINUTES,
    CONF_SCAN_INTERVAL,
    CONF_STALE_MINUTES,
    DEFAULT_ENABLE_PERSISTENT_NOTIFICATIONS,
    DEFAULT_LOG_ERRORS_WINDOW_MINUTES,
    DEFAULT_LOW_LQI_THRESHOLD,
    DEFAULT_NOTIFY_SERVICE,
    DEFAULT_OFFLINE_GRACE_MINUTES,
    DEFAULT_SCAN_INTERVAL,
    DEFAULT_STALE_MINUTES,
    DOMAIN,
)


def _base_schema(defaults: dict[str, Any]) -> vol.Schema:
    return vol.Schema(
        {
            vol.Required(CONF_SCAN_INTERVAL, default=defaults[CONF_SCAN_INTERVAL]): vol.All(
                vol.Coerce(int), vol.Range(min=30, max=3600)
            ),
            vol.Required(
                CONF_LOW_LQI_THRESHOLD,
                default=defaults[CONF_LOW_LQI_THRESHOLD],
            ): vol.All(vol.Coerce(int), vol.Range(min=1, max=255)),
            vol.Required(CONF_STALE_MINUTES, default=defaults[CONF_STALE_MINUTES]): vol.All(
                vol.Coerce(int), vol.Range(min=5, max=1440)
            ),
            vol.Required(
                CONF_OFFLINE_GRACE_MINUTES,
                default=defaults[CONF_OFFLINE_GRACE_MINUTES],
            ): vol.All(vol.Coerce(int), vol.Range(min=1, max=1440)),
            vol.Required(
                CONF_LOG_ERRORS_WINDOW_MINUTES,
                default=defaults[CONF_LOG_ERRORS_WINDOW_MINUTES],
            ): vol.All(vol.Coerce(int), vol.Range(min=5, max=1440)),
            vol.Optional(
                CONF_NOTIFY_SERVICE,
                default=defaults[CONF_NOTIFY_SERVICE],
            ): str,
            vol.Required(
                CONF_ENABLE_PERSISTENT_NOTIFICATIONS,
                default=defaults[CONF_ENABLE_PERSISTENT_NOTIFICATIONS],
            ): bool,
        }
    )


class ZigbeeDiagnosticConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Zigbee Diagnostic."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title="Zigbee Diagnostic", data=user_input)

        defaults = {
            CONF_SCAN_INTERVAL: DEFAULT_SCAN_INTERVAL,
            CONF_LOW_LQI_THRESHOLD: DEFAULT_LOW_LQI_THRESHOLD,
            CONF_STALE_MINUTES: DEFAULT_STALE_MINUTES,
            CONF_OFFLINE_GRACE_MINUTES: DEFAULT_OFFLINE_GRACE_MINUTES,
            CONF_NOTIFY_SERVICE: DEFAULT_NOTIFY_SERVICE,
            CONF_ENABLE_PERSISTENT_NOTIFICATIONS: DEFAULT_ENABLE_PERSISTENT_NOTIFICATIONS,
            CONF_LOG_ERRORS_WINDOW_MINUTES: DEFAULT_LOG_ERRORS_WINDOW_MINUTES,
        }
        return self.async_show_form(step_id="user", data_schema=_base_schema(defaults))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return ZigbeeDiagnosticOptionsFlow(config_entry)


class ZigbeeDiagnosticOptionsFlow(config_entries.OptionsFlow):
    """Handle options flow for Zigbee Diagnostic."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(self, user_input: dict[str, Any] | None = None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        defaults = {
            CONF_SCAN_INTERVAL: self.config_entry.options.get(
                CONF_SCAN_INTERVAL,
                self.config_entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
            ),
            CONF_LOW_LQI_THRESHOLD: self.config_entry.options.get(
                CONF_LOW_LQI_THRESHOLD,
                self.config_entry.data.get(CONF_LOW_LQI_THRESHOLD, DEFAULT_LOW_LQI_THRESHOLD),
            ),
            CONF_STALE_MINUTES: self.config_entry.options.get(
                CONF_STALE_MINUTES,
                self.config_entry.data.get(CONF_STALE_MINUTES, DEFAULT_STALE_MINUTES),
            ),
            CONF_OFFLINE_GRACE_MINUTES: self.config_entry.options.get(
                CONF_OFFLINE_GRACE_MINUTES,
                self.config_entry.data.get(
                    CONF_OFFLINE_GRACE_MINUTES,
                    DEFAULT_OFFLINE_GRACE_MINUTES,
                ),
            ),
            CONF_NOTIFY_SERVICE: self.config_entry.options.get(
                CONF_NOTIFY_SERVICE,
                self.config_entry.data.get(CONF_NOTIFY_SERVICE, DEFAULT_NOTIFY_SERVICE),
            ),
            CONF_ENABLE_PERSISTENT_NOTIFICATIONS: self.config_entry.options.get(
                CONF_ENABLE_PERSISTENT_NOTIFICATIONS,
                self.config_entry.data.get(
                    CONF_ENABLE_PERSISTENT_NOTIFICATIONS,
                    DEFAULT_ENABLE_PERSISTENT_NOTIFICATIONS,
                ),
            ),
            CONF_LOG_ERRORS_WINDOW_MINUTES: self.config_entry.options.get(
                CONF_LOG_ERRORS_WINDOW_MINUTES,
                self.config_entry.data.get(
                    CONF_LOG_ERRORS_WINDOW_MINUTES,
                    DEFAULT_LOG_ERRORS_WINDOW_MINUTES,
                ),
            ),
        }

        return self.async_show_form(step_id="init", data_schema=_base_schema(defaults))
