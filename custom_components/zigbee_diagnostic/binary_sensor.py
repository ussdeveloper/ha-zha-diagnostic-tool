"""Binary sensor platform for Zigbee Diagnostic."""

from __future__ import annotations

from typing import Callable

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DATA_COORDINATOR, DOMAIN
from .coordinator import ZigbeeDiagnosticCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Zigbee Diagnostic binary sensor."""
    coordinator: ZigbeeDiagnosticCoordinator = hass.data[DOMAIN][entry.entry_id][DATA_COORDINATOR]
    async_add_entities([ZigbeeDiagnosticProblemBinarySensor(coordinator, entry)])


class ZigbeeDiagnosticProblemBinarySensor(BinarySensorEntity):
    """Binary sensor indicating whether any issues are currently present."""

    _attr_has_entity_name = True
    _attr_name = "Problemy sieci Zigbee"
    _attr_translation_key = "network_problem"
    _attr_icon = "mdi:zigbee"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coordinator: ZigbeeDiagnosticCoordinator, entry: ConfigEntry) -> None:
        self._coordinator = coordinator
        self._attr_unique_id = f"{entry.entry_id}_network_problem"
        self._attr_is_on = False
        self._attr_available = True
        self._attr_extra_state_attributes = {}
        self._unsub_coordinator: Callable[[], None] | None = None
        self._apply_from_coordinator()

    async def async_added_to_hass(self) -> None:
        """Subscribe to coordinator updates."""
        self._unsub_coordinator = self._coordinator.async_add_listener(self._handle_coordinator_update)

    async def async_will_remove_from_hass(self) -> None:
        """Unsubscribe from coordinator updates."""
        if self._unsub_coordinator:
            self._unsub_coordinator()
            self._unsub_coordinator = None

    def _handle_coordinator_update(self) -> None:
        self._apply_from_coordinator()
        self.async_write_ha_state()

    def _apply_from_coordinator(self) -> None:
        self._attr_available = self._coordinator.last_update_success
        data = self._coordinator.data
        self._attr_is_on = data.issue_count > 0
        self._attr_extra_state_attributes = {
            "issue_count": data.issue_count,
            "offline_count": data.offline_count,
            "stale_count": data.stale_count,
            "low_lqi_count": data.low_lqi_count,
        }
