"""Coordinator for Zigbee Diagnostic integration."""

from __future__ import annotations

from collections import deque
from datetime import UTC, datetime, timedelta
import logging

from homeassistant.components import persistent_notification
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
from homeassistant.util import slugify

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
from .diagnostics_engine import DiagnosticSnapshot, async_collect_snapshot

_LOGGER = logging.getLogger(__name__)


class ZigbeeDiagnosticCoordinator(DataUpdateCoordinator[DiagnosticSnapshot]):
    """Coordinate periodic diagnostics for Zigbee network health."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, log_events: deque[datetime]) -> None:
        self.hass = hass
        self.entry = entry
        self._log_events = log_events
        self._last_issue_keys: set[str] = set()

        scan_interval = int(entry.options.get(CONF_SCAN_INTERVAL, entry.data.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)))
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=max(scan_interval, 30)),
        )

    def _recent_log_errors_count(self) -> int:
        """Count log errors within configured time window."""
        window_minutes = int(
            self.entry.options.get(
                CONF_LOG_ERRORS_WINDOW_MINUTES,
                self.entry.data.get(CONF_LOG_ERRORS_WINDOW_MINUTES, DEFAULT_LOG_ERRORS_WINDOW_MINUTES),
            )
        )
        cutoff = datetime.now(tz=UTC) - timedelta(minutes=window_minutes)
        while self._log_events and self._log_events[0] < cutoff:
            self._log_events.popleft()
        return len(self._log_events)

    async def _async_update_data(self) -> DiagnosticSnapshot:
        low_lqi_threshold = int(
            self.entry.options.get(
                CONF_LOW_LQI_THRESHOLD,
                self.entry.data.get(CONF_LOW_LQI_THRESHOLD, DEFAULT_LOW_LQI_THRESHOLD),
            )
        )
        stale_minutes = int(
            self.entry.options.get(
                CONF_STALE_MINUTES,
                self.entry.data.get(CONF_STALE_MINUTES, DEFAULT_STALE_MINUTES),
            )
        )
        offline_grace_minutes = int(
            self.entry.options.get(
                CONF_OFFLINE_GRACE_MINUTES,
                self.entry.data.get(CONF_OFFLINE_GRACE_MINUTES, DEFAULT_OFFLINE_GRACE_MINUTES),
            )
        )

        snapshot = await async_collect_snapshot(
            self.hass,
            low_lqi_threshold=low_lqi_threshold,
            stale_minutes=stale_minutes,
            offline_grace_minutes=offline_grace_minutes,
            recent_log_errors=self._recent_log_errors_count(),
        )
        await self._async_notify_new_issues(snapshot)
        return snapshot

    async def _async_notify_new_issues(self, snapshot: DiagnosticSnapshot) -> None:
        """Notify only when new issues appear."""
        current_keys = {issue.key for issue in snapshot.issues}
        new_keys = current_keys - self._last_issue_keys
        self._last_issue_keys = current_keys

        if not new_keys:
            return

        new_issues = [issue for issue in snapshot.issues if issue.key in new_keys]
        title = "Zigbee Diagnostic: wykryto nowe problemy"
        body = "\n".join(f"- {issue.message}" for issue in new_issues[:10])

        enable_persistent = bool(
            self.entry.options.get(
                CONF_ENABLE_PERSISTENT_NOTIFICATIONS,
                self.entry.data.get(
                    CONF_ENABLE_PERSISTENT_NOTIFICATIONS,
                    DEFAULT_ENABLE_PERSISTENT_NOTIFICATIONS,
                ),
            )
        )

        if enable_persistent:
            persistent_notification.async_create(
                self.hass,
                message=body,
                title=title,
                notification_id=f"{DOMAIN}_{slugify(self.entry.entry_id)}",
            )

        notify_service = str(
            self.entry.options.get(
                CONF_NOTIFY_SERVICE,
                self.entry.data.get(CONF_NOTIFY_SERVICE, DEFAULT_NOTIFY_SERVICE),
            )
        ).strip()

        if not notify_service:
            return

        if "." not in notify_service:
            _LOGGER.warning("Nieprawidłowa wartość notify_service=%s (wymagane domain.service)", notify_service)
            return

        domain, service = notify_service.split(".", 1)

        await self.hass.services.async_call(
            domain,
            service,
            {
                "title": title,
                "message": body,
            },
            blocking=False,
        )
