"""Sensor platform for Zigbee Diagnostic."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DATA_COORDINATOR, DOMAIN
from .coordinator import ZigbeeDiagnosticCoordinator


@dataclass(frozen=True, kw_only=True)
class ZigbeeDiagnosticSensorDescription:
    key: str
    translation_key: str
    name: str
    icon: str
    value_key: str


SENSORS: tuple[ZigbeeDiagnosticSensorDescription, ...] = (
    ZigbeeDiagnosticSensorDescription(
        key="issue_count",
        translation_key="issue_count",
        name="Liczba problemów Zigbee",
        value_key="issue_count",
        icon="mdi:alert-circle-outline",
    ),
    ZigbeeDiagnosticSensorDescription(
        key="lowest_lqi",
        translation_key="lowest_lqi",
        name="Najniższy LQI",
        value_key="lowest_lqi",
        icon="mdi:signal-distance-variant",
    ),
    ZigbeeDiagnosticSensorDescription(
        key="checked_devices",
        translation_key="checked_devices",
        name="Sprawdzone urządzenia",
        value_key="checked_devices",
        icon="mdi:devices",
    ),
    ZigbeeDiagnosticSensorDescription(
        key="recent_log_errors",
        translation_key="recent_log_errors",
        name="Błędy Zigbee w logach",
        value_key="recent_log_errors",
        icon="mdi:file-alert-outline",
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Zigbee Diagnostic sensors from a config entry."""
    coordinator: ZigbeeDiagnosticCoordinator = hass.data[DOMAIN][entry.entry_id][DATA_COORDINATOR]

    async_add_entities(
        ZigbeeDiagnosticSensorEntity(coordinator, entry, description)
        for description in SENSORS
    )


class ZigbeeDiagnosticSensorEntity(SensorEntity):
    """Single Zigbee diagnostic sensor."""

    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self,
        coordinator: ZigbeeDiagnosticCoordinator,
        entry: ConfigEntry,
        description: ZigbeeDiagnosticSensorDescription,
    ) -> None:
        self._coordinator = coordinator
        self._description = description
        self.entity_description = SensorEntityDescription(
            key=description.key,
            translation_key=description.translation_key,
            name=description.name,
            icon=description.icon,
            entity_category=EntityCategory.DIAGNOSTIC,
        )

        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_native_value = None
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
        self._attr_native_value = getattr(data, self._description.value_key, None)

        if self._description.key != "issue_count":
            self._attr_extra_state_attributes = {}
            return

        self._attr_extra_state_attributes = {
            "offline_count": data.offline_count,
            "stale_count": data.stale_count,
            "low_lqi_count": data.low_lqi_count,
            "checked_entities": data.checked_entities,
            "issues": [
                {
                    "key": issue.key,
                    "type": issue.issue_type,
                    "severity": issue.severity,
                    "device": issue.device_name,
                    "entity_id": issue.entity_id,
                    "message": issue.message,
                }
                for issue in data.issues
            ],
        }
