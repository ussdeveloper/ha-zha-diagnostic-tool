"""Diagnostic engine for Zigbee network health."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from homeassistant.core import HomeAssistant, State
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .const import (
    ISSUE_LOG_ERROR,
    ISSUE_LOW_LQI,
    ISSUE_OFFLINE,
    ISSUE_STALE,
    KNOWN_ZIGBEE_PLATFORMS,
)


@dataclass(slots=True)
class ZigbeeIssue:
    """Represents a detected Zigbee issue."""

    key: str
    issue_type: str
    severity: str
    message: str
    device_name: str | None = None
    entity_id: str | None = None


@dataclass(slots=True)
class DiagnosticSnapshot:
    """Diagnostic snapshot published by the coordinator."""

    checked_devices: int = 0
    checked_entities: int = 0
    issue_count: int = 0
    offline_count: int = 0
    stale_count: int = 0
    low_lqi_count: int = 0
    lowest_lqi: int | None = None
    recent_log_errors: int = 0
    issues: list[ZigbeeIssue] = field(default_factory=list)



def _parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=UTC)
        except (ValueError, OSError):
            return None

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        text = text.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(text)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
        except ValueError:
            return None

    return None


def _extract_lqi(state: State) -> int | None:
    attrs = state.attributes

    for key in ("linkquality", "lqi", "signal_strength"):
        value = attrs.get(key)
        if isinstance(value, (int, float)):
            return int(value)

    eid = state.entity_id.lower()
    if any(part in eid for part in ("linkquality", "_lqi")):
        try:
            return int(float(state.state))
        except (TypeError, ValueError):
            return None

    return None


def _extract_last_seen(state: State) -> datetime | None:
    attrs = state.attributes
    for key in ("last_seen", "last_seen_ts", "last_seen_time", "last_updated"):
        parsed = _parse_datetime(attrs.get(key))
        if parsed:
            return parsed

    return state.last_updated if state.last_updated.tzinfo else state.last_updated.replace(tzinfo=UTC)


async def async_collect_snapshot(
    hass: HomeAssistant,
    *,
    low_lqi_threshold: int,
    stale_minutes: int,
    offline_grace_minutes: int,
    recent_log_errors: int,
) -> DiagnosticSnapshot:
    """Collect a full diagnostic snapshot from entities and devices."""
    entity_registry = er.async_get(hass)
    device_registry = dr.async_get(hass)

    snapshot = DiagnosticSnapshot(recent_log_errors=recent_log_errors)

    now = datetime.now(tz=UTC)
    stale_cutoff = now - timedelta(minutes=stale_minutes)
    offline_grace_cutoff = now - timedelta(minutes=offline_grace_minutes)

    # Device_id -> list[entity_id]
    zigbee_device_entities: dict[str, list[str]] = {}

    for entity in entity_registry.entities.values():
        if entity.disabled:
            continue

        if entity.platform not in KNOWN_ZIGBEE_PLATFORMS:
            continue

        if not entity.device_id:
            continue

        zigbee_device_entities.setdefault(entity.device_id, []).append(entity.entity_id)

    snapshot.checked_devices = len(zigbee_device_entities)

    for device_id, entity_ids in zigbee_device_entities.items():
        device = device_registry.devices.get(device_id)
        device_name = device.name_by_user or device.name or device_id if device else device_id

        snapshot.checked_entities += len(entity_ids)

        device_states: list[State] = []
        for entity_id in entity_ids:
            state = hass.states.get(entity_id)
            if state:
                device_states.append(state)

        if not device_states:
            continue

        unavailable_states = [
            st for st in device_states if st.state in {"unavailable", "unknown"} and st.last_changed < offline_grace_cutoff
        ]
        if unavailable_states and len(unavailable_states) == len(device_states):
            key = f"{ISSUE_OFFLINE}:{device_id}"
            snapshot.issues.append(
                ZigbeeIssue(
                    key=key,
                    issue_type=ISSUE_OFFLINE,
                    severity="high",
                    device_name=device_name,
                    message=f"Urządzenie {device_name} jest offline (wszystkie encje niedostępne).",
                )
            )
            snapshot.offline_count += 1

        lqi_values = [val for st in device_states if (val := _extract_lqi(st)) is not None]
        if lqi_values:
            device_lowest_lqi = min(lqi_values)
            snapshot.lowest_lqi = (
                device_lowest_lqi
                if snapshot.lowest_lqi is None
                else min(snapshot.lowest_lqi, device_lowest_lqi)
            )

            if device_lowest_lqi < low_lqi_threshold:
                key = f"{ISSUE_LOW_LQI}:{device_id}"
                snapshot.issues.append(
                    ZigbeeIssue(
                        key=key,
                        issue_type=ISSUE_LOW_LQI,
                        severity="medium",
                        device_name=device_name,
                        message=(
                            f"Niski poziom LQI dla {device_name}: {device_lowest_lqi} "
                            f"(próg: {low_lqi_threshold})."
                        ),
                    )
                )
                snapshot.low_lqi_count += 1

        seen_values = [parsed for st in device_states if (parsed := _extract_last_seen(st)) is not None]
        newest_last_seen = max(seen_values, default=None)
        if newest_last_seen and newest_last_seen < stale_cutoff:
            key = f"{ISSUE_STALE}:{device_id}"
            snapshot.issues.append(
                ZigbeeIssue(
                    key=key,
                    issue_type=ISSUE_STALE,
                    severity="medium",
                    device_name=device_name,
                    message=(
                        f"Brak świeżych aktualizacji dla {device_name} od "
                        f"{newest_last_seen.isoformat()} (>{stale_minutes} min)."
                    ),
                )
            )
            snapshot.stale_count += 1

    if recent_log_errors > 0:
        snapshot.issues.append(
            ZigbeeIssue(
                key=f"{ISSUE_LOG_ERROR}:global",
                issue_type=ISSUE_LOG_ERROR,
                severity="high",
                message=(
                    f"W ostatnim oknie czasu wykryto {recent_log_errors} błędów/ostrzeżeń Zigbee "
                    "w logach systemowych."
                ),
            )
        )

    snapshot.issue_count = len(snapshot.issues)
    return snapshot
