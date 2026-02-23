"""The Zigbee Diagnostic integration."""

from __future__ import annotations

from collections import deque
from datetime import UTC, datetime, timedelta
import logging
from typing import Any, Mapping

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback

from .const import (
    CONF_LOG_ERRORS_WINDOW_MINUTES,
    DATA_COORDINATOR,
    DATA_LOG_EVENTS,
    DOMAIN,
    KNOWN_ZIGBEE_LOG_KEYWORDS,
    PLATFORMS,
    SYSTEM_LOG_EVENT,
)
from .coordinator import ZigbeeDiagnosticCoordinator

_LOGGER = logging.getLogger(__name__)


def _is_zigbee_log_event(event_data: Mapping[str, Any]) -> bool:
    """Return True when a system log event is Zigbee related."""
    message = str(event_data.get("message", "")).lower()
    name = str(event_data.get("name", "")).lower()
    source = str(event_data.get("source", "")).lower()
    haystack = " ".join([message, name, source])
    return any(keyword in haystack for keyword in KNOWN_ZIGBEE_LOG_KEYWORDS)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Zigbee Diagnostic from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    log_events: deque[datetime] = deque()
    log_window_minutes = int(entry.options.get(CONF_LOG_ERRORS_WINDOW_MINUTES, 60))

    def _cleanup_log_events() -> None:
        cutoff = datetime.now(tz=UTC) - timedelta(minutes=log_window_minutes)
        while log_events and log_events[0] < cutoff:
            log_events.popleft()

    @callback
    def _handle_system_log(event: Event) -> None:  # type: ignore[no-untyped-def]
        data = event.data or {}
        if not _is_zigbee_log_event(data):
            return

        level = str(data.get("level", "")).lower()
        if level and level not in {"error", "warning", "critical"}:
            return

        log_events.append(datetime.now(tz=UTC))
        _cleanup_log_events()

    unsub = hass.bus.async_listen(SYSTEM_LOG_EVENT, _handle_system_log)

    coordinator = ZigbeeDiagnosticCoordinator(
        hass=hass,
        entry=entry,
        log_events=log_events,
    )
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = {
        DATA_COORDINATOR: coordinator,
        DATA_LOG_EVENTS: log_events,
        "unsub_log_listener": unsub,
    }

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unload_ok:
        return False

    entry_data = hass.data[DOMAIN].pop(entry.entry_id, {})
    unsub = entry_data.get("unsub_log_listener")
    if unsub:
        unsub()

    return True


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload a config entry."""
    await async_unload_entry(hass, entry)
    await async_setup_entry(hass, entry)
