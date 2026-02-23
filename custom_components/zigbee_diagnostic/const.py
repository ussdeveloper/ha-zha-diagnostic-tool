"""Constants for Zigbee Diagnostic integration."""

from __future__ import annotations

from datetime import timedelta

DOMAIN = "zigbee_diagnostic"

PLATFORMS = ["sensor", "binary_sensor"]

CONF_SCAN_INTERVAL = "scan_interval"
CONF_LOW_LQI_THRESHOLD = "low_lqi_threshold"
CONF_STALE_MINUTES = "stale_minutes"
CONF_OFFLINE_GRACE_MINUTES = "offline_grace_minutes"
CONF_NOTIFY_SERVICE = "notify_service"
CONF_ENABLE_PERSISTENT_NOTIFICATIONS = "enable_persistent_notifications"
CONF_LOG_ERRORS_WINDOW_MINUTES = "log_errors_window_minutes"

DEFAULT_SCAN_INTERVAL = 120
DEFAULT_LOW_LQI_THRESHOLD = 60
DEFAULT_STALE_MINUTES = 120
DEFAULT_OFFLINE_GRACE_MINUTES = 15
DEFAULT_NOTIFY_SERVICE = ""
DEFAULT_ENABLE_PERSISTENT_NOTIFICATIONS = True
DEFAULT_LOG_ERRORS_WINDOW_MINUTES = 60

DATA_COORDINATOR = "coordinator"
DATA_LOG_EVENTS = "log_events"

UPDATE_INTERVAL_FALLBACK = timedelta(seconds=DEFAULT_SCAN_INTERVAL)

SYSTEM_LOG_EVENT = "system_log_event"

KNOWN_ZIGBEE_PLATFORMS = {"zha", "deconz", "mqtt"}
KNOWN_ZIGBEE_LOG_KEYWORDS = (
    "zigbee",
    "zha",
    "bellows",
    "ezsp",
    "deconz",
    "zigbee2mqtt",
)

ISSUE_OFFLINE = "offline"
ISSUE_LOW_LQI = "low_lqi"
ISSUE_STALE = "stale"
ISSUE_LOG_ERROR = "log_error"
