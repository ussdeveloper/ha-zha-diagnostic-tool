from __future__ import annotations

import asyncio
import contextlib
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import hashlib
import json
import logging
import os
from pathlib import Path
import re
from statistics import mean
from typing import Any

from aiohttp import ClientSession, ClientTimeout, WSMsgType, web

LOGGER = logging.getLogger("zha_diagnostic_ui")
logging.basicConfig(level=logging.INFO)

SUPERVISOR_API = "http://supervisor/core/api"
SUPERVISOR_WS = "ws://supervisor/core/websocket"
OPTIONS_PATH = Path("/data/options.json")
MIRROR_RULES_PATH = Path("/config/zha_diagnostic_mirror_rules.json")
SENSOR_RULES_PATH = Path("/config/zha_diagnostic_sensor_rules.json")
BATTERY_ALERTS_PATH = Path("/config/zha_diagnostic_battery_alerts.json")
KEEPALIVE_PATH = Path("/config/zha_diagnostic_keepalive.json")
STATIC_DIR = Path(__file__).parent / "static"

ZIGBEE_KEYWORDS = ("zigbee", "zha", "deconz", "zigbee2mqtt", "bellows", "ezsp")


def _file_content_hash(path: Path) -> str:
    """Return first 12 chars of SHA-256 hex digest for a file, or epoch ms as fallback."""
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    except OSError:
        return str(int(datetime.now(UTC).timestamp() * 1000))


def _build_index_html() -> bytes:
    """Read index.html and inject content-based cache-bust hashes for CSS/JS."""
    raw = (STATIC_DIR / "index.html").read_text("utf-8")
    css_hash = _file_content_hash(STATIC_DIR / "styles.css")
    js_hash = _file_content_hash(STATIC_DIR / "app.js")
    # Replace any existing ?v=XXXX with content hash
    raw = re.sub(r'styles\.css\?v=[^"]*', f'styles.css?h={css_hash}', raw)
    raw = re.sub(r'app\.js\?v=[^"]*', f'app.js?h={js_hash}', raw)
    # If no ?v= was present, append hash
    if f'h={css_hash}' not in raw:
        raw = raw.replace('styles.css"', f'styles.css?h={css_hash}"')
    if f'h={js_hash}' not in raw:
        raw = raw.replace('app.js"', f'app.js?h={js_hash}"')
    # Inject anti-cache meta tags right after <meta charset>
    anti_cache_meta = (
        '\n  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />'
        '\n  <meta http-equiv="Pragma" content="no-cache" />'
        '\n  <meta http-equiv="Expires" content="0" />'
    )
    raw = raw.replace(
        '<meta charset="UTF-8" />',
        '<meta charset="UTF-8" />' + anti_cache_meta,
    )
    LOGGER.info("Cache-bust hashes: CSS=%s JS=%s", css_hash, js_hash)
    return raw.encode("utf-8")


# Pre-built on import; rebuilt on app startup
_INDEX_HTML: bytes = _build_index_html()


@dataclass(slots=True)
class PendingSwitchCommand:
    entity_id: str
    desired_state: str | None
    issued_at: float
    source: str


class DiagnosticRuntime:
    def __init__(self) -> None:
        self.token = os.getenv("SUPERVISOR_TOKEN", "")
        self.options = self._load_json(OPTIONS_PATH, default={})

        self.poll_interval_seconds = max(1, int(self.options.get("poll_interval_seconds", 2)))
        self.max_delay_samples = int(self.options.get("max_delay_samples", 300))
        self.mirror_cooldown_ms = int(self.options.get("mirror_cooldown_ms", 1200))
        self.grafana_theme = str(self.options.get("grafana_theme", "vscode-dark"))

        self.states: dict[str, dict[str, Any]] = {}
        self.zigbee_entities: list[dict[str, Any]] = []
        self.switch_entities: list[dict[str, Any]] = []
        self.sensor_entities: list[dict[str, Any]] = []
        self.battery_entities: list[dict[str, Any]] = []
        self.notify_entities: list[dict[str, Any]] = []

        self.delay_samples: deque[dict[str, Any]] = deque(maxlen=self.max_delay_samples)
        self.telemetry_log: deque[dict[str, Any]] = deque(maxlen=500)
        self.telemetry_bins: deque[dict[str, Any]] = deque(maxlen=240)
        self._telemetry_current_second: int | None = None
        self._telemetry_current_counts: dict[str, int] = {
            "zha": 0,
            "state": 0,
            "call": 0,
            "log_error": 0,
            "other": 0,
        }
        self.pending: dict[str, PendingSwitchCommand] = {}
        self.command_log: deque[dict[str, Any]] = deque(maxlen=200)
        self.recent_mirror_targets: dict[str, float] = {}
        self.recent_sensor_actions: dict[str, float] = {}

        self.mirror_rules: list[dict[str, Any]] = self._load_json(MIRROR_RULES_PATH, default=[])
        self.sensor_rules: list[dict[str, Any]] = self._load_json(SENSOR_RULES_PATH, default=[])
        self.battery_alerts: list[dict[str, Any]] = self._load_json(BATTERY_ALERTS_PATH, default=[])
        self.keepalive_configs: list[dict[str, Any]] = self._load_json(KEEPALIVE_PATH, default=[])
        self._last_battery_history_ts: float = 0.0
        self._last_zha_map_ts: float = 0.0

        # Full zigbee device list from ZHA WS (with neighbours/LQI for map)
        self.zha_devices_full: list[dict[str, Any]] = []
        # Mapping: ZHA device IEEE → list of HA entity_ids (from device+entity registry)
        self.device_entity_map: dict[str, list[str]] = {}
        # Zigbee error log: timeout, not_delivered, link failures
        self.zigbee_error_log: deque[dict[str, Any]] = deque(maxlen=500)
        # Full zigbee activity log: ALL zha_events + zigbee state changes + system log
        self.zigbee_full_log: deque[dict[str, Any]] = deque(maxlen=2000)
        # Health issues detected from ZHA state
        self.zha_health_issues: list[str] = []
        # Unavailable device details for popup
        self.unavailable_devices: list[dict[str, Any]] = []

        # ZHA groups cache
        self.zha_groups: list[dict[str, Any]] = []
        # ZHA network settings cache
        self.zha_network_settings: dict[str, Any] = {}
        # ZHA configuration cache
        self.zha_configuration: dict[str, Any] = {}
        # Area registry cache
        self.area_registry: list[dict[str, Any]] = []
        # ZHA network backups cache
        self.zha_backups: list[dict[str, Any]] = []

        self.last_error: str | None = None
        self.last_success_utc: str | None = None

        self.session: ClientSession | None = None
        self._poll_task: asyncio.Task | None = None
        self._ws_task: asyncio.Task | None = None

    def _load_json(self, path: Path, default: Any) -> Any:
        if not path.exists():
            return default
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(default, list):
                return data if isinstance(data, list) else default
            if isinstance(default, dict):
                return data if isinstance(data, dict) else default
            return data
        except Exception as exc:  # noqa: BLE001
            LOGGER.warning("Cannot parse %s: %s", path, exc)
            return default

    def _save_json(self, path: Path, data: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    @property
    def auth_headers(self) -> dict[str, str]:
        if not self.token:
            return {}
        return {"Authorization": f"Bearer {self.token}"}

    async def start(self) -> None:
        if not self.token:
            self.last_error = "Missing SUPERVISOR_TOKEN (check homeassistant_api/hassio_api in config.yaml)"
        self.session = ClientSession(headers=self.auth_headers)
        self._poll_task = asyncio.create_task(self._poll_loop(), name="poll_states")
        self._ws_task = asyncio.create_task(self._ws_loop(), name="ha_events")

    async def stop(self) -> None:
        tasks = [task for task in (self._poll_task, self._ws_task) if task]
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if self.session:
            await self.session.close()

    async def _poll_loop(self) -> None:
        while True:
            try:
                await self._maybe_fetch_zha_map()
                await self.refresh_states()
                self._check_command_timeouts()
                await self._maybe_fetch_battery_history()
                await self._evaluate_keepalive()
                self.last_error = None
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
                LOGGER.warning("State poll error: %s", exc)
            await asyncio.sleep(self.poll_interval_seconds)

    def _check_command_timeouts(self) -> None:
        now = self._now_ms()
        timeout_ms = 10_000
        expired = [
            eid for eid, cmd in self.pending.items()
            if (now - cmd.issued_at) > timeout_ms
        ]
        for eid in expired:
            cmd = self.pending.pop(eid)
            self.command_log.append({
                "entity_id": eid,
                "action": cmd.desired_state or "toggle",
                "status": "timeout",
                "delay_ms": round(now - cmd.issued_at, 2),
                "ts": datetime.now(tz=UTC).isoformat(),
                "source": cmd.source,
            })

    async def refresh_states(self) -> None:
        if not self.session:
            return

        async with self.session.get(
            f"{SUPERVISOR_API}/states",
            timeout=ClientTimeout(total=20),
        ) as response:
            if response.status >= 300:
                text = await response.text()
                raise RuntimeError(f"Cannot load states ({response.status}): {text[:200]}")
            payload = await response.json()

        states: dict[str, dict[str, Any]] = {}
        zigbee_entities: list[dict[str, Any]] = []
        switch_entities: list[dict[str, Any]] = []
        sensor_entities: list[dict[str, Any]] = []
        battery_entities: list[dict[str, Any]] = []
        notify_entities: list[dict[str, Any]] = []

        for item in payload:
            entity_id = item.get("entity_id")
            if not isinstance(entity_id, str):
                continue

            states[entity_id] = item
            attrs = item.get("attributes") or {}
            state_value = item.get("state")

            if entity_id.startswith("switch."):
                switch_entities.append(
                    {
                        "entity_id": entity_id,
                        "state": state_value,
                        "friendly_name": attrs.get("friendly_name", entity_id),
                        "icon": attrs.get("icon", "mdi:toggle-switch"),
                        "last_updated": item.get("last_updated"),
                        "device_ieee": attrs.get("ieee") or attrs.get("device_ieee") or "",
                    }
                )

            if entity_id.startswith("sensor."):
                numeric = self._numeric_state_value(item)
                sensor_entities.append(
                    {
                        "entity_id": entity_id,
                        "state": state_value,
                        "numeric_state": numeric,
                        "friendly_name": attrs.get("friendly_name", entity_id),
                        "unit": attrs.get("unit_of_measurement"),
                        "icon": attrs.get("icon", "mdi:gauge"),
                        "device_ieee": attrs.get("ieee") or attrs.get("device_ieee") or "",
                    }
                )

            if self._is_zigbee_entity(item):
                zigbee_entities.append(
                    {
                        "entity_id": entity_id,
                        "state": state_value,
                        "friendly_name": attrs.get("friendly_name", entity_id),
                        "device_class": attrs.get("device_class"),
                        "lqi": self._extract_lqi(item),
                        "icon": attrs.get("icon", "mdi:zigbee"),
                        "last_updated": item.get("last_updated"),
                        # IEEE of the physical Zigbee device (present in ZHA entity attrs)
                        "device_ieee": attrs.get("ieee") or attrs.get("device_ieee") or "",
                    }
                )

            # Battery entities (device_class=battery or battery attribute)
            battery_level = self._extract_battery(item)
            if battery_level is not None:
                battery_entities.append(
                    {
                        "entity_id": entity_id,
                        "state": state_value,
                        "friendly_name": attrs.get("friendly_name", entity_id),
                        "battery": battery_level,
                        "last_updated": item.get("last_updated"),
                        "battery_history": [],
                    }
                )

            # Notify entities — notify.*, but also tts.* and mobile_app companion services
            if entity_id.startswith(("notify.", "tts.")):
                notify_entities.append(
                    {
                        "entity_id": entity_id,
                        "friendly_name": attrs.get("friendly_name", entity_id),
                    }
                )

        # Also fetch HA services to find notify targets (mobile_app etc.)
        # notify.mobile_app_* are services, NOT state entities in HA 2024.x
        try:
            async with self.session.get(
                f"{SUPERVISOR_API}/services",
                timeout=ClientTimeout(total=10),
            ) as svc_resp:
                if svc_resp.status < 300:
                    svc_payload = await svc_resp.json()
                    seen = {e["entity_id"] for e in notify_entities}
                    for domain_info in svc_payload:
                        if domain_info.get("domain") == "notify":
                            for svc_name, svc_meta in domain_info.get("services", {}).items():
                                svc_id = f"notify.{svc_name}"
                                if svc_id not in seen:
                                    friendly = svc_meta.get("name") or svc_name.replace("_", " ").title()
                                    notify_entities.append({
                                        "entity_id": svc_id,
                                        "friendly_name": friendly,
                                    })
        except Exception:  # noqa: BLE001
            pass  # service fetch is best-effort

        # Fetch device+entity registries to build ZHA IEEE → entity_id mapping
        # Uses multiple sources for robust matching:
        #   1. Device registry identifiers ("zha", ieee)
        #   2. Entity registry unique_id parsing (ZHA format: ieee-ep-cluster)
        #   3. Cross-reference with zha_devices_full for canonical IEEE format
        try:
            dev_reg_resp = await self._ws_command({"type": "config/device_registry/list"})
            ent_reg_resp = await self._ws_command({"type": "config/entity_registry/list"})
            if dev_reg_resp.get("success") and ent_reg_resp.get("success"):
                # Build canonical IEEE lookup from ZHA devices (normalized → original)
                zha_norm_to_canon: dict[str, str] = {}
                for zd in self.zha_devices_full:
                    ieee = zd.get("ieee", "")
                    if ieee:
                        zha_norm_to_canon[self._normalize_ieee(ieee)] = ieee

                # Source 1: device registry identifiers → device_id → IEEE
                dev_id_to_ieee: dict[str, str] = {}
                for dev in dev_reg_resp.get("result", []):
                    for ident in dev.get("identifiers", []):
                        if isinstance(ident, (list, tuple)) and len(ident) >= 2 and str(ident[0]) == "zha":
                            raw_ieee = str(ident[1])
                            norm = self._normalize_ieee(raw_ieee)
                            # Use canonical form from ZHA if available, else raw
                            dev_id_to_ieee[dev["id"]] = zha_norm_to_canon.get(norm, raw_ieee)

                # Build IEEE → entity_ids mapping
                ieee_entities: dict[str, list[str]] = {}

                for ent in ent_reg_resp.get("result", []):
                    eid = ent.get("entity_id", "")
                    if not eid:
                        continue
                    did = ent.get("device_id", "")
                    mapped_ieee = ""

                    # Method A: via device_id → device registry → IEEE
                    if did and did in dev_id_to_ieee:
                        mapped_ieee = dev_id_to_ieee[did]

                    # Method B: ZHA entity unique_id parsing (fallback)
                    if not mapped_ieee and ent.get("platform") == "zha":
                        uid = ent.get("unique_id", "")
                        extracted = self._extract_ieee_from_unique_id(uid)
                        if extracted:
                            norm = self._normalize_ieee(extracted)
                            mapped_ieee = zha_norm_to_canon.get(norm, extracted)

                    if mapped_ieee:
                        if eid not in ieee_entities.get(mapped_ieee, []):
                            ieee_entities.setdefault(mapped_ieee, []).append(eid)

                self.device_entity_map = ieee_entities
                LOGGER.debug(
                    "device_entity_map: %d IEEE addresses, %d total entities",
                    len(ieee_entities),
                    sum(len(v) for v in ieee_entities.values()),
                )
                # Backfill device_ieee on entities using registry data
                all_ents = zigbee_entities + switch_entities + sensor_entities
                eid_to_ieee: dict[str, str] = {}
                for ieee_addr, eids in ieee_entities.items():
                    for eid in eids:
                        eid_to_ieee[eid] = ieee_addr
                for ent in all_ents:
                    if not ent.get("device_ieee"):
                        ent["device_ieee"] = eid_to_ieee.get(ent["entity_id"], "")
        except Exception:  # noqa: BLE001
            pass  # registry fetch is best-effort

        self.states = states
        self.zigbee_entities = sorted(zigbee_entities, key=lambda e: e["entity_id"])
        self.switch_entities = sorted(switch_entities, key=lambda e: e["entity_id"])
        self.sensor_entities = sorted(sensor_entities, key=lambda e: e["entity_id"])
        self.battery_entities = sorted(battery_entities, key=lambda e: e.get("battery") or 999)
        self.notify_entities = sorted(notify_entities, key=lambda e: e["entity_id"])
        self.last_success_utc = datetime.now(tz=UTC).isoformat()

        await self._evaluate_sensor_rules()

    async def _ws_loop(self) -> None:
        while True:
            try:
                await self._ws_session_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
                LOGGER.warning("WS loop error: %s", exc)
            await asyncio.sleep(2)

    async def _ws_session_once(self) -> None:
        if not self.session:
            return

        async with self.session.ws_connect(SUPERVISOR_WS, heartbeat=25) as ws:
            auth_required = await ws.receive_json(timeout=15)
            if auth_required.get("type") != "auth_required":
                raise RuntimeError(f"Unexpected WS auth flow: {auth_required}")

            await ws.send_json({"type": "auth", "access_token": self.token})
            auth_ok = await ws.receive_json(timeout=15)
            if auth_ok.get("type") != "auth_ok":
                raise RuntimeError(f"WS auth failed: {auth_ok}")

            await ws.send_json({"id": 1, "type": "subscribe_events", "event_type": "call_service"})
            await ws.send_json({"id": 2, "type": "subscribe_events", "event_type": "state_changed"})
            await ws.send_json({"id": 3, "type": "subscribe_events", "event_type": "zha_event"})
            await ws.send_json({"id": 4, "type": "subscribe_events", "event_type": "system_log_event"})

            while True:
                msg = await ws.receive(timeout=60)
                if msg.type == WSMsgType.TEXT:
                    await self._handle_ws_message(json.loads(msg.data))
                elif msg.type in {WSMsgType.CLOSED, WSMsgType.CLOSE, WSMsgType.ERROR}:
                    raise RuntimeError("Websocket closed")

    async def _ws_command(self, command_data: dict[str, Any], timeout: float = 30) -> dict[str, Any]:
        """Send a single WS command and return the response."""
        if not self.session:
            raise RuntimeError("No session available")
        async with self.session.ws_connect(SUPERVISOR_WS, heartbeat=25) as ws:
            auth_req = await ws.receive_json(timeout=15)
            if auth_req.get("type") != "auth_required":
                raise RuntimeError(f"Unexpected WS auth: {auth_req}")
            await ws.send_json({"type": "auth", "access_token": self.token})
            auth_ok = await ws.receive_json(timeout=15)
            if auth_ok.get("type") != "auth_ok":
                raise RuntimeError(f"WS auth failed: {auth_ok}")
            await ws.send_json({"id": 1, **command_data})
            while True:
                msg = await ws.receive(timeout=timeout)
                if msg.type == WSMsgType.TEXT:
                    resp = json.loads(msg.data)
                    if resp.get("id") == 1:
                        return resp
                elif msg.type in {WSMsgType.CLOSED, WSMsgType.CLOSE, WSMsgType.ERROR}:
                    raise RuntimeError("WS closed during command")

    async def _maybe_fetch_battery_history(self) -> None:
        now = datetime.now(tz=UTC).timestamp()
        if now - self._last_battery_history_ts < 30:
            return
        self._last_battery_history_ts = now
        await self._fetch_battery_history()

    async def _maybe_fetch_zha_map(self) -> None:
        now = datetime.now(tz=UTC).timestamp()
        if now - self._last_zha_map_ts < 60:
            return
        self._last_zha_map_ts = now
        try:
            resp = await self._ws_command({"type": "zha/devices"})
            if resp.get("success"):
                self.zha_devices_full = resp.get("result", [])
                # Health checks
                issues: list[str] = []
                all_devs = self.zha_devices_full
                coordinators = [d for d in all_devs if d.get("is_coordinator")]
                if len(coordinators) > 1:
                    names = ", ".join(
                        d.get("user_given_name") or d.get("name") or d.get("ieee", "?")
                        for d in coordinators
                    )
                    issues.append(
                        f"{len(coordinators)} ZHA coordinators detected ({names}). "
                        "Only one coordinator is expected. Check ZHA integration settings."
                    )
                unavailable = [
                    d for d in all_devs
                    if not d.get("is_coordinator") and d.get("available") is False
                ]
                if len(unavailable) >= 1:
                    issues.append(
                        f"{len(unavailable)} Zigbee device(s) are currently unavailable. "
                        "Check device power and range."
                    )
                self.zha_health_issues = issues
                self.unavailable_devices = [
                    {
                        "name": d.get("user_given_name") or d.get("name") or d.get("ieee", "?"),
                        "ieee": d.get("ieee", "?"),
                        "lqi": d.get("lqi"),
                        "model": d.get("model") or d.get("model_id") or "",
                        "device_type": d.get("device_type", ""),
                    }
                    for d in unavailable
                ]
        except Exception as exc:  # noqa: BLE001
            LOGGER.debug("ZHA map fetch error: %s", exc)

        # Fetch groups, network settings, areas, configuration (best-effort)
        await self._fetch_zha_extras()

    async def _fetch_zha_extras(self) -> None:
        """Fetch ZHA groups, network settings, areas, and configuration (best-effort)."""
        for cmd_type, attr_name in [
            ("zha/groups", "zha_groups"),
            ("zha/network/settings", "zha_network_settings"),
            ("zha/configuration", "zha_configuration"),
            ("config/area_registry/list", "area_registry"),
        ]:
            try:
                resp = await self._ws_command({"type": cmd_type})
                if resp.get("success"):
                    result = resp.get("result", {} if "settings" in cmd_type or "configuration" in cmd_type else [])
                    setattr(self, attr_name, result)
            except Exception as exc:  # noqa: BLE001
                LOGGER.debug("Fetch %s error: %s", cmd_type, exc)

    async def _fetch_battery_history(self) -> None:
        if not self.session or not self.battery_entities:
            return
        try:
            start = (datetime.now(tz=UTC) - timedelta(minutes=5)).isoformat()
            entity_ids = ",".join(e["entity_id"] for e in self.battery_entities)
            async with self.session.get(
                f"{SUPERVISOR_API}/history/period/{start}",
                params={"filter_entity_id": entity_ids, "minimal_response": "", "significant_changes_only": ""},
                timeout=ClientTimeout(total=20),
            ) as response:
                if response.status >= 300:
                    return
                history = await response.json()

            history_map: dict[str, list[dict[str, Any]]] = {}
            for entity_history in history:
                if not entity_history:
                    continue
                eid = entity_history[0].get("entity_id")
                points: list[dict[str, Any]] = []
                for point in entity_history:
                    try:
                        val = float(point.get("state", ""))
                        points.append({"ts": point.get("last_changed"), "value": val})
                    except (TypeError, ValueError):
                        pass
                if eid and points:
                    history_map[eid] = points

            for entity in self.battery_entities:
                entity["battery_history"] = history_map.get(entity["entity_id"], [])
        except Exception as exc:  # noqa: BLE001
            LOGGER.debug("Battery history fetch error: %s", exc)

    async def _evaluate_keepalive(self) -> None:
        if not self.keepalive_configs:
            return
        now = datetime.now(tz=UTC).timestamp()
        for cfg in self.keepalive_configs:
            if not cfg.get("enabled", False):
                continue
            interval = int(cfg.get("interval_seconds", 60))
            last_sent = cfg.get("last_sent") or 0.0
            if now - last_sent < interval:
                continue
            ieee = str(cfg.get("ieee", ""))
            endpoint_id = int(cfg.get("endpoint_id", 1))
            if not ieee:
                continue
            try:
                await self._ws_command({
                    "type": "zha/devices/clusters/attributes/value",
                    "ieee": ieee,
                    "endpoint_id": endpoint_id,
                    "cluster_id": 0,
                    "cluster_type": "in",
                    "attribute": 0,
                })
                cfg["last_sent"] = now
            except Exception as exc:  # noqa: BLE001
                LOGGER.debug("Keepalive error for %s: %s", ieee, exc)

    async def _handle_ws_message(self, data: dict[str, Any]) -> None:
        if data.get("type") != "event":
            return

        event = data.get("event", {})
        event_type = event.get("event_type")
        event_data = event.get("data", {})

        self._record_telemetry_event(event_type=event_type, event_data=event_data)

        if event_type == "call_service":
            self._handle_call_service(event_data)
        elif event_type == "state_changed":
            await self._handle_state_changed(event_data)

    def _record_telemetry_event(self, event_type: Any, event_data: dict[str, Any]) -> None:
        event_name = str(event_type or "unknown")
        now = datetime.now(tz=UTC)
        now_sec = int(now.timestamp())

        category = "other"
        if event_name == "zha_event":
            category = "zha"
            zha_cmd = str(event_data.get("command", "")).lower()
            zha_ieee = str(event_data.get("device_ieee", ""))
            zha_lqi = event_data.get("lqi")

            # Log ALL zha_events to full log
            self.zigbee_full_log.append({
                "ts": now.isoformat(),
                "type": "zha_event",
                "subtype": zha_cmd or "event",
                "ieee": zha_ieee,
                "lqi": zha_lqi,
                "raw": json.dumps(event_data, ensure_ascii=False)[:400],
            })

            # Track Zigbee errors: timeout, not_delivered, lqi drop
            is_error = False
            error_type = ""
            if "timeout" in zha_cmd or event_data.get("timed_out"):
                is_error = True
                error_type = "timeout"
            elif "not_delivered" in zha_cmd or event_data.get("not_delivered"):
                is_error = True
                error_type = "not_delivered"
            elif zha_lqi is not None and int(zha_lqi) < 20:
                is_error = True
                error_type = "lqi_critical"
            if is_error:
                self.zigbee_error_log.append({
                    "ts": now.isoformat(),
                    "type": error_type,
                    "ieee": zha_ieee,
                    "command": zha_cmd,
                    "lqi": zha_lqi,
                    "raw": json.dumps(event_data, ensure_ascii=False)[:300],
                })
        elif event_name == "state_changed":
            category = "state"
            # Log zigbee/zha entity state changes to full log
            entity_id = str(event_data.get("entity_id", ""))
            # Check if entity belongs to a known ZHA device
            _known_zigbee_eids = {e["entity_id"] for e in self.zigbee_entities}
            _known_switch_eids = {e["entity_id"] for e in self.switch_entities if e.get("device_ieee")}
            is_zigbee = (
                entity_id in _known_zigbee_eids
                or entity_id in _known_switch_eids
                or any(kw in entity_id for kw in ("zha", "zigbee"))
            )
            if is_zigbee:
                new_state = event_data.get("new_state", {})
                old_state = event_data.get("old_state", {})
                dev_ieee = ""
                # Try to find device IEEE from known entities
                for ent in self.zigbee_entities:
                    if ent["entity_id"] == entity_id:
                        dev_ieee = ent.get("device_ieee", "")
                        break
                if not dev_ieee:
                    for ent in self.switch_entities:
                        if ent["entity_id"] == entity_id:
                            dev_ieee = ent.get("device_ieee", "")
                            break
                self.zigbee_full_log.append({
                    "ts": now.isoformat(),
                    "type": "state_changed",
                    "subtype": entity_id,
                    "ieee": dev_ieee,
                    "lqi": None,
                    "raw": json.dumps({
                        "entity_id": entity_id,
                        "old": old_state.get("state") if old_state else None,
                        "new": new_state.get("state") if new_state else None,
                        "attributes": {k: v for k, v in (new_state.get("attributes", {}) or {}).items()
                                       if k in ("friendly_name", "device_class", "unit_of_measurement")}
                    }, ensure_ascii=False)[:400],
                })
        elif event_name == "call_service":
            category = "call"
        elif event_name == "system_log_event":
            level = str(event_data.get("level", "")).lower()
            msg = str(event_data.get("message", "")).lower()
            # Capture zigbee-related log errors
            if any(kw in msg for kw in ("zigbee", "zha", "bellows", "ezsp", "timeout", "not delivered", "delivery")):
                raw_msg = (
                    " ".join(event_data["message"])
                    if isinstance(event_data.get("message"), list)
                    else str(event_data.get("message", ""))
                )[:300]
                # All zigbee system logs go to full log
                self.zigbee_full_log.append({
                    "ts": now.isoformat(),
                    "type": f"system_log",
                    "subtype": level,
                    "ieee": "",
                    "lqi": None,
                    "raw": raw_msg,
                })
                # Error/warning/critical also go to error log
                if level in {"error", "warning", "critical"}:
                    self.zigbee_error_log.append({
                        "ts": now.isoformat(),
                        "type": f"log_{level}",
                        "ieee": "",
                        "command": "",
                        "lqi": None,
                        "raw": raw_msg,
                    })
            category = "log_error" if level in {"error", "warning", "critical"} else "other"

        if self._telemetry_current_second is None:
            self._telemetry_current_second = now_sec

        if now_sec != self._telemetry_current_second:
            self.telemetry_bins.append(
                {
                    "ts": datetime.fromtimestamp(self._telemetry_current_second, tz=UTC).isoformat(),
                    **self._telemetry_current_counts,
                }
            )
            self._telemetry_current_second = now_sec
            self._telemetry_current_counts = {"zha": 0, "state": 0, "call": 0, "log_error": 0, "other": 0}

        self._telemetry_current_counts[category] = self._telemetry_current_counts.get(category, 0) + 1

        summary = self._summarize_event(event_name, event_data)
        self.telemetry_log.append(
            {
                "ts": now.isoformat(),
                "type": event_name,
                "category": category,
                "summary": summary,
            }
        )

    @staticmethod
    def _summarize_event(event_name: str, event_data: dict[str, Any]) -> str:
        if event_name == "state_changed":
            entity_id = event_data.get("entity_id")
            new_state = (event_data.get("new_state") or {}).get("state")
            return f"{entity_id} -> {new_state}"
        if event_name == "call_service":
            domain = event_data.get("domain")
            service = event_data.get("service")
            target = (event_data.get("service_data") or {}).get("entity_id")
            return f"{domain}.{service} {target}"
        if event_name == "zha_event":
            device_ieee = event_data.get("device_ieee")
            command = event_data.get("command")
            return f"ieee={device_ieee} cmd={command}"
        if event_name == "system_log_event":
            level = event_data.get("level")
            message = str(event_data.get("message", ""))[:120]
            return f"{level}: {message}"
        return json.dumps(event_data, ensure_ascii=False)[:160]

    def _telemetry_bins_with_current(self) -> list[dict[str, Any]]:
        bins = list(self.telemetry_bins)
        if self._telemetry_current_second is not None:
            bins.append(
                {
                    "ts": datetime.fromtimestamp(self._telemetry_current_second, tz=UTC).isoformat(),
                    **self._telemetry_current_counts,
                }
            )
        return bins[-180:]

    def _handle_call_service(self, event_data: dict[str, Any]) -> None:
        domain = event_data.get("domain")
        service = event_data.get("service")
        if domain != "switch" or service not in {"turn_on", "turn_off", "toggle"}:
            return

        service_data = event_data.get("service_data") or {}
        entity_ids = service_data.get("entity_id")
        if isinstance(entity_ids, str):
            targets = [entity_ids]
        elif isinstance(entity_ids, list):
            targets = [item for item in entity_ids if isinstance(item, str)]
        else:
            targets = []

        desired = "on" if service == "turn_on" else "off" if service == "turn_off" else None
        now = self._now_ms()

        for entity_id in targets:
            self.pending[entity_id] = PendingSwitchCommand(
                entity_id=entity_id,
                desired_state=desired,
                issued_at=now,
                source="call_service",
            )

    async def _handle_state_changed(self, event_data: dict[str, Any]) -> None:
        entity_id = event_data.get("entity_id")
        if not isinstance(entity_id, str) or not entity_id.startswith("switch."):
            return

        new_state_obj = event_data.get("new_state") or {}
        old_state_obj = event_data.get("old_state") or {}

        new_state = new_state_obj.get("state")
        old_state = old_state_obj.get("state")
        if new_state not in {"on", "off"}:
            return

        self.states[entity_id] = new_state_obj

        pending = self.pending.get(entity_id)
        if pending and (pending.desired_state is None or pending.desired_state == new_state):
            delay = max(0.0, self._now_ms() - pending.issued_at)
            self.delay_samples.append(
                {
                    "entity_id": entity_id,
                    "delay_ms": round(delay, 2),
                    "ts": datetime.now(tz=UTC).isoformat(),
                    "expected": pending.desired_state,
                    "actual": new_state,
                    "source": pending.source,
                }
            )
            self.command_log.append({
                "entity_id": entity_id,
                "action": new_state,
                "status": "confirmed",
                "delay_ms": round(delay, 2),
                "ts": datetime.now(tz=UTC).isoformat(),
                "source": pending.source,
            })
            self.pending.pop(entity_id, None)

        if new_state != old_state:
            await self._apply_mirror_rules(source_entity=entity_id, source_state=new_state)

    async def _apply_mirror_rules(self, source_entity: str, source_state: str) -> None:
        if source_state not in {"on", "off"}:
            return

        for rule in self.mirror_rules:
            if not rule.get("enabled", True):
                continue

            src = rule.get("source")
            dst = rule.get("target")
            bidirectional = bool(rule.get("bidirectional", True))

            pairs: list[tuple[str, str]] = []
            if src and dst:
                pairs.append((src, dst))
                if bidirectional:
                    pairs.append((dst, src))

            for pair_source, pair_target in pairs:
                if pair_source != source_entity:
                    continue
                await self._mirror_to_target(pair_target, source_state)

    async def _mirror_to_target(self, target_entity: str, state: str) -> None:
        now = self._now_ms()
        last_mirror = self.recent_mirror_targets.get(target_entity, 0.0)
        if (now - last_mirror) < self.mirror_cooldown_ms:
            return

        current_target = self.states.get(target_entity, {}).get("state")
        if current_target == state:
            return

        service = "turn_on" if state == "on" else "turn_off"
        ok = await self.call_switch_service(target_entity, service, source="mirror")
        if ok:
            self.recent_mirror_targets[target_entity] = now

    async def _evaluate_sensor_rules(self) -> None:
        if not self.sensor_rules:
            return

        for rule in self.sensor_rules:
            if not rule.get("enabled", True):
                continue

            rule_id = str(rule.get("id", ""))
            sensor_entity = str(rule.get("sensor_entity", ""))
            switch_entity = str(rule.get("switch_entity", ""))
            min_value = rule.get("min_value")
            max_value = rule.get("max_value")
            in_action = str(rule.get("action_in_range", "turn_on"))
            out_action = str(rule.get("action_out_of_range", "none"))
            cooldown_ms = int(rule.get("cooldown_ms", 4000))

            if not sensor_entity.startswith("sensor.") or not switch_entity.startswith("switch."):
                continue

            sensor_state = self.states.get(sensor_entity)
            if not sensor_state:
                continue

            value = self._numeric_state_value(sensor_state)
            if value is None:
                continue

            in_range = True
            if min_value is not None and value < float(min_value):
                in_range = False
            if max_value is not None and value > float(max_value):
                in_range = False

            action = in_action if in_range else out_action
            if action not in {"turn_on", "turn_off", "toggle"}:
                continue

            now = self._now_ms()
            key = f"{rule_id}:{switch_entity}:{action}"
            last = self.recent_sensor_actions.get(key, 0.0)
            if (now - last) < cooldown_ms:
                continue

            ok = await self.call_switch_service(switch_entity, action, source="sensor-rule")
            if ok:
                self.recent_sensor_actions[key] = now

    async def call_switch_service(self, entity_id: str, action: str, source: str = "ui") -> bool:
        if not self.session or action not in {"turn_on", "turn_off", "toggle"}:
            return False

        async with self.session.post(
            f"{SUPERVISOR_API}/services/switch/{action}",
            json={"entity_id": entity_id},
            timeout=ClientTimeout(total=20),
        ) as response:
            if response.status >= 300:
                return False

        desired = "on" if action == "turn_on" else "off" if action == "turn_off" else None
        self.pending[entity_id] = PendingSwitchCommand(
            entity_id=entity_id,
            desired_state=desired,
            issued_at=self._now_ms(),
            source=source,
        )
        self.command_log.append({
            "entity_id": entity_id,
            "action": action,
            "status": "sent",
            "delay_ms": None,
            "ts": datetime.now(tz=UTC).isoformat(),
            "source": source,
        })
        return True

    def dashboard_payload(self) -> dict[str, Any]:
        samples = list(self.delay_samples)
        delays = [float(sample["delay_ms"]) for sample in samples]

        delay_avg = round(mean(delays), 2) if delays else None
        delay_max = round(max(delays), 2) if delays else None
        p95 = None
        if delays:
            sorted_delays = sorted(delays)
            idx = int(0.95 * (len(sorted_delays) - 1))
            p95 = round(sorted_delays[idx], 2)

        return {
            "theme": self.grafana_theme,
            "runtime": {
                "token_present": bool(self.token),
                "last_error": self.last_error,
                "last_success_utc": self.last_success_utc,
            },
            "summary": {
                "zigbee_entities": len(self.zigbee_entities),
                "zigbee_switches": len([x for x in self.switch_entities if self._is_zigbee_state(self.states.get(x["entity_id"], {}))]),
                "switches_total": len(self.switch_entities),
                "sensor_rules": len(self.sensor_rules),
                "mirror_rules": len(self.mirror_rules),
                "pending_commands": len(self.pending),
                "command_errors": sum(1 for c in self.command_log if c.get("status") == "timeout"),
                "command_success_rate": self._command_success_rate(),
                "delay_avg_ms": delay_avg,
                "delay_p95_ms": p95,
                "delay_max_ms": delay_max,
            },
            "delay_samples": samples[-180:],
            "telemetry": {
                "spikes": self._telemetry_bins_with_current(),
                "events": list(self.telemetry_log)[-200:],
            },
            "mirror_rules": self.mirror_rules,
            "sensor_rules": self.sensor_rules,
            "zigbee_devices": self.zigbee_entities,
            "switches": self.switch_entities,
            "sensors": self.sensor_entities,
            "battery_devices": self.battery_entities,
            "battery_alerts": self.battery_alerts,
            "notify_entities": self.notify_entities,
            "command_log": list(self.command_log)[-100:],
            "zha_devices_full": self.zha_devices_full,
            "zigbee_error_log": list(self.zigbee_error_log)[-200:],
            "zigbee_full_log": list(self.zigbee_full_log)[-500:],
            "zha_health_issues": self.zha_health_issues,
            "unavailable_devices": self.unavailable_devices,
            "device_entity_map": self.device_entity_map,
            "zha_groups": self.zha_groups,
            "zha_network_settings": self.zha_network_settings,
            "zha_configuration": self.zha_configuration,
            "area_registry": self.area_registry,
        }

    def _command_success_rate(self) -> float | None:
        finished = [c for c in self.command_log if c.get("status") in ("confirmed", "timeout")]
        if not finished:
            return None
        confirmed = sum(1 for c in finished if c["status"] == "confirmed")
        return round(confirmed / len(finished) * 100, 1)

    @staticmethod
    def _now_ms() -> float:
        return datetime.now(tz=UTC).timestamp() * 1000.0

    @staticmethod
    def _numeric_state_value(item: dict[str, Any]) -> float | None:
        value = item.get("state")
        try:
            if value is None:
                return None
            if value in {"unknown", "unavailable"}:
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _extract_lqi(item: dict[str, Any]) -> int | None:
        attrs = item.get("attributes") or {}
        for key in ("linkquality", "lqi", "signal_strength"):
            value = attrs.get(key)
            if isinstance(value, (int, float)):
                return int(value)
        return None

    @staticmethod
    def _extract_battery(item: dict[str, Any]) -> int | None:
        """Extract battery level from entity state or attributes."""
        attrs = item.get("attributes") or {}
        entity_id = str(item.get("entity_id", ""))
        device_class = attrs.get("device_class", "")

        # sensor with device_class battery
        if device_class == "battery" and entity_id.startswith("sensor."):
            try:
                val = item.get("state")
                if val not in {None, "unknown", "unavailable"}:
                    return int(float(val))
            except (TypeError, ValueError):
                pass

        # battery attribute on any entity
        for key in ("battery", "battery_level"):
            val = attrs.get(key)
            if isinstance(val, (int, float)):
                return int(val)

        return None

    @staticmethod
    def _is_zigbee_state(item: dict[str, Any]) -> bool:
        if not item:
            return False
        return DiagnosticRuntime._is_zigbee_entity(item)

    @staticmethod
    def _normalize_ieee(ieee: str) -> str:
        """Normalize IEEE address to lowercase hex without separators."""
        return ieee.lower().replace(":", "").replace("-", "").replace("0x", "")

    @staticmethod
    def _extract_ieee_from_unique_id(unique_id: str) -> str:
        """Extract IEEE address from a ZHA entity unique_id.

        ZHA unique_ids look like: 'aa:bb:cc:dd:ee:ff:00:11-1-0x0006'
        or 'aa:bb:cc:dd:ee:ff:00:11-1' (IEEE-endpoint[-cluster]).
        """
        if not unique_id:
            return ""
        # Split on '-' and check if the first part looks like an IEEE (8 colon-separated hex pairs)
        parts = unique_id.split("-")
        candidate = parts[0]
        octets = candidate.split(":")
        if len(octets) == 8 and all(len(o) == 2 for o in octets):
            try:
                int(candidate.replace(":", ""), 16)
                return candidate
            except ValueError:
                pass
        return ""

    @staticmethod
    def _is_zigbee_entity(item: dict[str, Any]) -> bool:
        entity_id = str(item.get("entity_id", "")).lower()
        attrs = item.get("attributes") or {}
        attrs_blob = json.dumps(attrs, ensure_ascii=False).lower()
        haystack = f"{entity_id} {attrs_blob}"

        if any(keyword in haystack for keyword in ZIGBEE_KEYWORDS):
            return True
        if any(key in attrs for key in ("ieee", "linkquality", "lqi", "last_seen")):
            return True
        return False


runtime = DiagnosticRuntime()


async def get_zigbee_logs(_: web.Request) -> web.Response:
    return web.json_response({"items": list(runtime.zigbee_error_log)})


async def get_zha_network(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.zha_devices_full})


_STATIC_DIR_RESOLVED = STATIC_DIR.resolve()
_STATIC_MIME: dict[str, str] = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
    ".json": "application/json",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
}
_TEXT_PREFIXES = ("text/", "application/javascript", "application/json")


async def static_file(request: web.Request) -> web.Response:
    """Custom static file handler — never returns 304, always sets no-cache headers."""
    filename = request.match_info.get("filename", "")
    if ".." in filename:
        raise web.HTTPForbidden()
    try:
        filepath = (_STATIC_DIR_RESOLVED / filename).resolve()
        filepath.relative_to(_STATIC_DIR_RESOLVED)
    except (ValueError, OSError):
        raise web.HTTPForbidden()
    if not filepath.is_file():
        raise web.HTTPNotFound()
    ct = _STATIC_MIME.get(filepath.suffix.lower(), "application/octet-stream")
    charset = "utf-8" if any(ct.startswith(p) for p in _TEXT_PREFIXES) else None
    resp = web.Response(body=filepath.read_bytes(), content_type=ct, charset=charset)
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


async def index(_: web.Request) -> web.Response:
    global _INDEX_HTML  # noqa: PLW0603
    resp = web.Response(
        body=_INDEX_HTML,
        content_type="text/html",
        charset="utf-8",
    )
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


async def dashboard(_: web.Request) -> web.Response:
    return web.json_response(runtime.dashboard_payload())


async def get_zigbee_devices(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.zigbee_entities})


async def get_switches(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.switch_entities})


async def get_sensors(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.sensor_entities})


async def get_mirror_rules(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.mirror_rules})


async def create_mirror_rule(request: web.Request) -> web.Response:
    body = await request.json()
    source = str(body.get("source", "")).strip()
    target = str(body.get("target", "")).strip()
    bidirectional = bool(body.get("bidirectional", True))

    if not source.startswith("switch.") or not target.startswith("switch."):
        return web.json_response({"error": "source and target must be switch.*"}, status=400)
    if source == target:
        return web.json_response({"error": "source and target cannot be the same"}, status=400)

    rule = {
        "id": f"{source}->{target}",
        "source": source,
        "target": target,
        "bidirectional": bidirectional,
        "enabled": True,
        "created_at": datetime.now(tz=UTC).isoformat(),
    }

    if any(str(item.get("id")) == rule["id"] for item in runtime.mirror_rules):
        return web.json_response({"error": "Rule already exists"}, status=409)

    runtime.mirror_rules.append(rule)
    runtime._save_json(MIRROR_RULES_PATH, runtime.mirror_rules)
    return web.json_response(rule, status=201)


async def delete_mirror_rule(request: web.Request) -> web.Response:
    rule_id = request.match_info.get("rule_id", "")
    before = len(runtime.mirror_rules)
    runtime.mirror_rules = [rule for rule in runtime.mirror_rules if str(rule.get("id")) != rule_id]
    if len(runtime.mirror_rules) == before:
        return web.json_response({"error": "Rule not found"}, status=404)
    runtime._save_json(MIRROR_RULES_PATH, runtime.mirror_rules)
    return web.json_response({"ok": True})


async def get_sensor_rules(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.sensor_rules})


async def create_sensor_rule(request: web.Request) -> web.Response:
    body = await request.json()
    sensor_entity = str(body.get("sensor_entity", "")).strip()
    switch_entity = str(body.get("switch_entity", "")).strip()

    if not sensor_entity.startswith("sensor."):
        return web.json_response({"error": "sensor_entity must be sensor.*"}, status=400)
    if not switch_entity.startswith("switch."):
        return web.json_response({"error": "switch_entity must be switch.*"}, status=400)

    rule = {
        "id": f"{sensor_entity}->{switch_entity}",
        "sensor_entity": sensor_entity,
        "switch_entity": switch_entity,
        "min_value": body.get("min_value"),
        "max_value": body.get("max_value"),
        "action_in_range": str(body.get("action_in_range", "turn_on")),
        "action_out_of_range": str(body.get("action_out_of_range", "none")),
        "cooldown_ms": int(body.get("cooldown_ms", 4000)),
        "enabled": bool(body.get("enabled", True)),
        "created_at": datetime.now(tz=UTC).isoformat(),
    }

    if any(str(item.get("id")) == rule["id"] for item in runtime.sensor_rules):
        return web.json_response({"error": "Rule already exists"}, status=409)

    runtime.sensor_rules.append(rule)
    runtime._save_json(SENSOR_RULES_PATH, runtime.sensor_rules)
    return web.json_response(rule, status=201)


async def delete_sensor_rule(request: web.Request) -> web.Response:
    rule_id = request.match_info.get("rule_id", "")
    before = len(runtime.sensor_rules)
    runtime.sensor_rules = [rule for rule in runtime.sensor_rules if str(rule.get("id")) != rule_id]
    if len(runtime.sensor_rules) == before:
        return web.json_response({"error": "Rule not found"}, status=404)
    runtime._save_json(SENSOR_RULES_PATH, runtime.sensor_rules)
    return web.json_response({"ok": True})


async def switch_action(request: web.Request) -> web.Response:
    body = await request.json()
    entity_id = str(body.get("entity_id", "")).strip()
    action = str(body.get("action", "toggle")).strip()

    if not entity_id.startswith("switch."):
        return web.json_response({"error": "entity_id must be switch.*"}, status=400)

    ok = await runtime.call_switch_service(entity_id, action, source="ui")
    if not ok:
        return web.json_response({"error": "Failed to execute switch action"}, status=500)

    return web.json_response({"ok": True})


async def refresh_now(_: web.Request) -> web.Response:
    runtime._last_zha_map_ts = 0
    await runtime._maybe_fetch_zha_map()
    await runtime.refresh_states()
    return web.json_response({"ok": True})


async def network_scan(_: web.Request) -> web.Response:
    """Trigger a ZHA topology scan (reads neighbor tables), then re-fetch devices."""
    try:
        # Ask ZHA to scan all devices' neighbor tables — can take 30-60 seconds
        await runtime._ws_command({"type": "zha/topology/update"}, timeout=90)
    except Exception as exc:  # noqa: BLE001
        LOGGER.debug("ZHA topology/update: %s (continuing with device fetch)", exc)
    runtime._last_zha_map_ts = 0
    await runtime._maybe_fetch_zha_map()
    return web.json_response({"ok": True, "devices": len(runtime.zha_devices_full)})


# ---- Battery alerts CRUD ----

async def get_battery_alerts(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.battery_alerts})


async def create_battery_alert(request: web.Request) -> web.Response:
    body = await request.json()
    threshold = int(body.get("threshold", 20))
    notify_entity = str(body.get("notify_entity", "")).strip()

    if not notify_entity:
        return web.json_response({"error": "notify_entity is required"}, status=400)

    alert = {
        "id": f"bat-{threshold}-{notify_entity}",
        "threshold": threshold,
        "notify_entity": notify_entity,
        "enabled": True,
        "created_at": datetime.now(tz=UTC).isoformat(),
    }

    if any(str(a.get("id")) == alert["id"] for a in runtime.battery_alerts):
        return web.json_response({"error": "Alert already exists"}, status=409)

    runtime.battery_alerts.append(alert)
    runtime._save_json(BATTERY_ALERTS_PATH, runtime.battery_alerts)
    return web.json_response(alert, status=201)


async def delete_battery_alert(request: web.Request) -> web.Response:
    alert_id = request.match_info.get("alert_id", "")
    before = len(runtime.battery_alerts)
    runtime.battery_alerts = [a for a in runtime.battery_alerts if str(a.get("id")) != alert_id]
    if len(runtime.battery_alerts) == before:
        return web.json_response({"error": "Alert not found"}, status=404)
    runtime._save_json(BATTERY_ALERTS_PATH, runtime.battery_alerts)
    return web.json_response({"ok": True})


# ---- ZHA Device Helper ----


async def get_zha_devices_helper(_: web.Request) -> web.Response:
    try:
        resp = await runtime._ws_command({"type": "zha/devices"})
        if resp.get("success"):
            return web.json_response({"items": resp.get("result", [])})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def get_zha_clusters(request: web.Request) -> web.Response:
    ieee = request.match_info.get("ieee", "")
    try:
        resp = await runtime._ws_command({"type": "zha/devices/clusters", "ieee": ieee})
        if resp.get("success"):
            return web.json_response(resp.get("result", {}))
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def get_zha_cluster_attributes(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    endpoint_id = int(body.get("endpoint_id", 1))
    cluster_id = int(body.get("cluster_id", 0))
    cluster_type = str(body.get("cluster_type", "in"))
    try:
        resp = await runtime._ws_command({
            "type": "zha/devices/clusters/attributes",
            "ieee": ieee,
            "endpoint_id": endpoint_id,
            "cluster_id": cluster_id,
            "cluster_type": cluster_type,
        })
        if resp.get("success"):
            return web.json_response({"attributes": resp.get("result", [])})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def zha_read_attribute(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    endpoint_id = int(body.get("endpoint_id", 1))
    cluster_id = int(body.get("cluster_id", 0))
    cluster_type = str(body.get("cluster_type", "in"))
    attribute = body.get("attribute", 0)
    try:
        resp = await runtime._ws_command({
            "type": "zha/devices/clusters/attributes/value",
            "ieee": ieee,
            "endpoint_id": endpoint_id,
            "cluster_id": cluster_id,
            "cluster_type": cluster_type,
            "attribute": attribute,
        })
        if resp.get("success"):
            return web.json_response(resp.get("result", {}))
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def get_zha_cluster_commands(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    endpoint_id = int(body.get("endpoint_id", 1))
    cluster_id = int(body.get("cluster_id", 0))
    cluster_type = str(body.get("cluster_type", "in"))
    try:
        resp = await runtime._ws_command({
            "type": "zha/devices/clusters/commands",
            "ieee": ieee,
            "endpoint_id": endpoint_id,
            "cluster_id": cluster_id,
            "cluster_type": cluster_type,
        })
        if resp.get("success"):
            return web.json_response({"commands": resp.get("result", [])})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def zha_write_attribute(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    endpoint_id = int(body.get("endpoint_id", 1))
    cluster_id = int(body.get("cluster_id", 0))
    cluster_type = str(body.get("cluster_type", "in"))
    attribute = body.get("attribute", 0)
    value = body.get("value")
    manufacturer = body.get("manufacturer")

    if not ieee:
        return web.json_response({"error": "ieee is required"}, status=400)

    try:
        if not runtime.session:
            return web.json_response({"error": "No session"}, status=500)
        svc_data: dict[str, Any] = {
            "ieee": ieee,
            "endpoint_id": endpoint_id,
            "cluster_id": cluster_id,
            "cluster_type": cluster_type,
            "attribute": attribute,
            "value": value,
        }
        if manufacturer is not None:
            svc_data["manufacturer"] = manufacturer
        async with runtime.session.post(
            f"{SUPERVISOR_API}/services/zha/set_zigbee_cluster_attribute",
            json=svc_data,
            timeout=ClientTimeout(total=30),
        ) as response:
            if response.status >= 300:
                text = await response.text()
                return web.json_response({"error": text[:200]}, status=response.status)
            return web.json_response({"ok": True})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def zha_command(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    endpoint_id = int(body.get("endpoint_id", 1))
    cluster_id = int(body.get("cluster_id", 0))
    cluster_type = str(body.get("cluster_type", "in"))
    command = int(body.get("command", 0))
    command_type = str(body.get("command_type", "server"))
    args = body.get("args", [])
    params = body.get("params")

    if not ieee:
        return web.json_response({"error": "ieee is required"}, status=400)

    try:
        if not runtime.session:
            return web.json_response({"error": "No session"}, status=500)
        svc_data: dict[str, Any] = {
            "ieee": ieee,
            "endpoint_id": endpoint_id,
            "cluster_id": cluster_id,
            "cluster_type": cluster_type,
            "command": command,
            "command_type": command_type,
        }
        if params:
            svc_data["params"] = params
        else:
            svc_data["args"] = args if isinstance(args, list) else []
        async with runtime.session.post(
            f"{SUPERVISOR_API}/services/zha/issue_zigbee_cluster_command",
            json=svc_data,
            timeout=ClientTimeout(total=30),
        ) as response:
            if response.status >= 300:
                text = await response.text()
                return web.json_response({"error": text[:200]}, status=response.status)
            return web.json_response({"ok": True})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---- ZHA Groups API ----


async def get_zha_groups(_: web.Request) -> web.Response:
    try:
        resp = await runtime._ws_command({"type": "zha/groups"})
        if resp.get("success"):
            return web.json_response({"items": resp.get("result", [])})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def create_zha_group(request: web.Request) -> web.Response:
    body = await request.json()
    group_name = str(body.get("group_name", "")).strip()
    members = body.get("members", [])
    if not group_name:
        return web.json_response({"error": "group_name is required"}, status=400)
    cmd: dict[str, Any] = {"type": "zha/group/add", "group_name": group_name}
    if members:
        cmd["members"] = members
    group_id = body.get("group_id")
    if group_id is not None:
        cmd["group_id"] = int(group_id)
    try:
        resp = await runtime._ws_command(cmd)
        if resp.get("success"):
            return web.json_response(resp.get("result", {}), status=201)
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def remove_zha_groups(request: web.Request) -> web.Response:
    body = await request.json()
    group_ids = body.get("group_ids", [])
    if not group_ids:
        return web.json_response({"error": "group_ids is required"}, status=400)
    try:
        resp = await runtime._ws_command({"type": "zha/group/remove", "group_ids": [int(g) for g in group_ids]})
        if resp.get("success"):
            return web.json_response({"ok": True})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def add_group_members(request: web.Request) -> web.Response:
    body = await request.json()
    group_id = body.get("group_id")
    members = body.get("members", [])
    if group_id is None or not members:
        return web.json_response({"error": "group_id and members are required"}, status=400)
    try:
        resp = await runtime._ws_command({
            "type": "zha/group/members/add",
            "group_id": int(group_id),
            "members": members,
        })
        if resp.get("success"):
            return web.json_response(resp.get("result", {}))
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def remove_group_members(request: web.Request) -> web.Response:
    body = await request.json()
    group_id = body.get("group_id")
    members = body.get("members", [])
    if group_id is None or not members:
        return web.json_response({"error": "group_id and members are required"}, status=400)
    try:
        resp = await runtime._ws_command({
            "type": "zha/group/members/remove",
            "group_id": int(group_id),
            "members": members,
        })
        if resp.get("success"):
            return web.json_response(resp.get("result", {}))
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---- ZHA Binding API ----


async def get_bindable_devices(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    if not ieee:
        return web.json_response({"error": "ieee is required"}, status=400)
    try:
        resp = await runtime._ws_command({"type": "zha/devices/bindable", "ieee": ieee})
        if resp.get("success"):
            return web.json_response({"items": resp.get("result", [])})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def bind_devices(request: web.Request) -> web.Response:
    body = await request.json()
    source_ieee = str(body.get("source_ieee", ""))
    target_ieee = str(body.get("target_ieee", ""))
    if not source_ieee or not target_ieee:
        return web.json_response({"error": "source_ieee and target_ieee are required"}, status=400)
    try:
        resp = await runtime._ws_command({
            "type": "zha/devices/bind",
            "source_ieee": source_ieee,
            "target_ieee": target_ieee,
        })
        if resp.get("success"):
            return web.json_response({"ok": True})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def unbind_devices(request: web.Request) -> web.Response:
    body = await request.json()
    source_ieee = str(body.get("source_ieee", ""))
    target_ieee = str(body.get("target_ieee", ""))
    if not source_ieee or not target_ieee:
        return web.json_response({"error": "source_ieee and target_ieee are required"}, status=400)
    try:
        resp = await runtime._ws_command({
            "type": "zha/devices/unbind",
            "source_ieee": source_ieee,
            "target_ieee": target_ieee,
        })
        if resp.get("success"):
            return web.json_response({"ok": True})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---- ZHA Network Settings API ----


async def get_network_settings(_: web.Request) -> web.Response:
    try:
        resp = await runtime._ws_command({"type": "zha/network/settings"})
        if resp.get("success"):
            return web.json_response(resp.get("result", {}))
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def change_channel(request: web.Request) -> web.Response:
    body = await request.json()
    new_channel = body.get("new_channel")
    if new_channel is None:
        return web.json_response({"error": "new_channel is required (11-26 or 'auto')"}, status=400)
    if new_channel != "auto":
        new_channel = int(new_channel)
        if not 11 <= new_channel <= 26:
            return web.json_response({"error": "Channel must be 11-26 or 'auto'"}, status=400)
    try:
        resp = await runtime._ws_command({"type": "zha/network/change_channel", "new_channel": new_channel}, timeout=60)
        if resp.get("success"):
            return web.json_response({"ok": True})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---- ZHA Backups API ----


async def list_backups(_: web.Request) -> web.Response:
    try:
        resp = await runtime._ws_command({"type": "zha/network/backups/list"})
        if resp.get("success"):
            return web.json_response({"items": resp.get("result", [])})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def create_backup(_: web.Request) -> web.Response:
    try:
        resp = await runtime._ws_command({"type": "zha/network/backups/create"}, timeout=60)
        if resp.get("success"):
            return web.json_response(resp.get("result", {}), status=201)
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---- ZHA Device Management API ----


async def permit_join(request: web.Request) -> web.Response:
    body = await request.json()
    duration = int(body.get("duration", 60))
    duration = max(0, min(254, duration))
    cmd: dict[str, Any] = {"type": "zha/devices/permit", "duration": duration}
    ieee = body.get("ieee")
    if ieee:
        cmd["ieee"] = str(ieee)
    source_ieee = body.get("source_ieee")
    if source_ieee:
        cmd["source_ieee"] = str(source_ieee)
    install_code = body.get("install_code")
    if install_code:
        cmd["install_code"] = str(install_code)
    qr_code = body.get("qr_code")
    if qr_code:
        cmd["qr_code"] = str(qr_code)
    try:
        resp = await runtime._ws_command(cmd)
        if resp.get("success"):
            return web.json_response({"ok": True})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def reconfigure_device(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    if not ieee:
        return web.json_response({"error": "ieee is required"}, status=400)
    try:
        resp = await runtime._ws_command({"type": "zha/devices/reconfigure", "ieee": ieee}, timeout=60)
        if resp.get("success"):
            return web.json_response({"ok": True})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def remove_device(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", ""))
    if not ieee:
        return web.json_response({"error": "ieee is required"}, status=400)
    if not runtime.session:
        return web.json_response({"error": "No session"}, status=500)
    try:
        async with runtime.session.post(
            f"{SUPERVISOR_API}/services/zha/remove",
            json={"ieee": ieee},
            timeout=ClientTimeout(total=30),
        ) as response:
            if response.status >= 300:
                text = await response.text()
                return web.json_response({"error": text[:200]}, status=response.status)
            return web.json_response({"ok": True})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def get_zha_device(request: web.Request) -> web.Response:
    ieee = request.match_info.get("ieee", "")
    if not ieee:
        return web.json_response({"error": "ieee is required"}, status=400)
    try:
        resp = await runtime._ws_command({"type": "zha/device", "ieee": ieee})
        if resp.get("success"):
            return web.json_response(resp.get("result", {}))
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---- ZHA Configuration API ----


async def get_zha_config(_: web.Request) -> web.Response:
    try:
        resp = await runtime._ws_command({"type": "zha/configuration"})
        if resp.get("success"):
            return web.json_response(resp.get("result", {}))
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


async def update_zha_config(request: web.Request) -> web.Response:
    body = await request.json()
    data = body.get("data")
    if not data:
        return web.json_response({"error": "data is required"}, status=400)
    try:
        resp = await runtime._ws_command({"type": "zha/configuration/update", "data": data})
        if resp.get("success"):
            return web.json_response({"ok": True})
        return web.json_response({"error": resp.get("error", {}).get("message", "Unknown")}, status=500)
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=500)


# ---- Keepalive CRUD ----


async def get_keepalive_configs(_: web.Request) -> web.Response:
    return web.json_response({"items": runtime.keepalive_configs})


async def create_keepalive(request: web.Request) -> web.Response:
    body = await request.json()
    ieee = str(body.get("ieee", "")).strip()
    endpoint_id = int(body.get("endpoint_id", 1))
    interval = int(body.get("interval_seconds", 60))
    enabled = bool(body.get("enabled", True))

    if not ieee:
        return web.json_response({"error": "ieee is required"}, status=400)

    cfg = {
        "id": f"ka-{ieee}",
        "ieee": ieee,
        "endpoint_id": endpoint_id,
        "interval_seconds": max(10, min(3600, interval)),
        "enabled": enabled,
        "last_sent": None,
        "created_at": datetime.now(tz=UTC).isoformat(),
    }

    existing = next((c for c in runtime.keepalive_configs if c.get("id") == cfg["id"]), None)
    if existing:
        existing.update(cfg)
    else:
        runtime.keepalive_configs.append(cfg)

    runtime._save_json(KEEPALIVE_PATH, runtime.keepalive_configs)
    return web.json_response(cfg, status=201)


async def delete_keepalive(request: web.Request) -> web.Response:
    ka_id = request.match_info.get("ka_id", "")
    before = len(runtime.keepalive_configs)
    runtime.keepalive_configs = [c for c in runtime.keepalive_configs if str(c.get("id")) != ka_id]
    if len(runtime.keepalive_configs) == before:
        return web.json_response({"error": "Not found"}, status=404)
    runtime._save_json(KEEPALIVE_PATH, runtime.keepalive_configs)
    return web.json_response({"ok": True})


# ---- Entity history (for sensor charts) ----

HISTORY_PERIODS = {"24h": 24, "7d": 168, "30d": 720, "5mo": 3600}

async def get_entity_history(request: web.Request) -> web.Response:
    entity_id = request.match_info.get("entity_id", "")
    if not entity_id or not runtime.session:
        return web.json_response({"error": "Missing entity_id"}, status=400)
    period = request.query.get("period", "24h")
    hours = HISTORY_PERIODS.get(period, 24)
    start = (datetime.now(tz=UTC) - timedelta(hours=hours)).isoformat()
    try:
        async with runtime.session.get(
            f"{SUPERVISOR_API}/history/period/{start}",
            params={"filter_entity_id": entity_id, "minimal_response": "", "significant_changes_only": ""},
            timeout=ClientTimeout(total=30),
        ) as resp:
            if resp.status >= 300:
                return web.json_response({"error": f"HA returned {resp.status}"}, status=502)
            data = await resp.json()
    except Exception as exc:  # noqa: BLE001
        return web.json_response({"error": str(exc)}, status=502)
    points: list[dict[str, Any]] = []
    for entity_history in data:
        if not entity_history:
            continue
        for pt in entity_history:
            state_str = pt.get("state", "")
            try:
                val = float(state_str)
                points.append({"ts": pt.get("last_changed"), "v": val})
            except (TypeError, ValueError):
                pass
    return web.json_response({"entity_id": entity_id, "period": period, "points": points})


async def on_startup(_: web.Application) -> None:
    global _INDEX_HTML  # noqa: PLW0603
    _INDEX_HTML = _build_index_html()  # rebuild with fresh content hashes
    await runtime.start()


async def on_cleanup(_: web.Application) -> None:
    await runtime.stop()


def create_app() -> web.Application:
    @web.middleware
    async def no_cache_middleware(request: web.Request, handler):
        resp = await handler(request)
        if request.path.startswith("/static") or request.path == "/":
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
            for hdr in ("ETag", "Last-Modified"):
                resp.headers.pop(hdr, None)
        return resp

    app = web.Application(middlewares=[no_cache_middleware])
    app.router.add_get("/", index)
    app.router.add_get("/static/{filename:.+}", static_file)

    app.router.add_get("/api/dashboard", dashboard)
    app.router.add_get("/api/zigbee-devices", get_zigbee_devices)
    app.router.add_get("/api/switches", get_switches)
    app.router.add_get("/api/sensors", get_sensors)

    app.router.add_get("/api/mirror-rules", get_mirror_rules)
    app.router.add_post("/api/mirror-rules", create_mirror_rule)
    app.router.add_delete("/api/mirror-rules/{rule_id}", delete_mirror_rule)

    app.router.add_get("/api/sensor-rules", get_sensor_rules)
    app.router.add_post("/api/sensor-rules", create_sensor_rule)
    app.router.add_delete("/api/sensor-rules/{rule_id}", delete_sensor_rule)

    app.router.add_post("/api/switch-action", switch_action)
    app.router.add_post("/api/refresh", refresh_now)
    app.router.add_post("/api/network-scan", network_scan)

    app.router.add_get("/api/zigbee-logs", get_zigbee_logs)
    app.router.add_get("/api/zha-network", get_zha_network)

    app.router.add_get("/api/battery-alerts", get_battery_alerts)
    app.router.add_post("/api/battery-alerts", create_battery_alert)
    app.router.add_delete("/api/battery-alerts/{alert_id}", delete_battery_alert)

    app.router.add_get("/api/zha-helper/devices", get_zha_devices_helper)
    app.router.add_get("/api/zha-helper/clusters/{ieee}", get_zha_clusters)
    app.router.add_post("/api/zha-helper/attributes", get_zha_cluster_attributes)
    app.router.add_post("/api/zha-helper/read-attribute", zha_read_attribute)
    app.router.add_post("/api/zha-helper/write-attribute", zha_write_attribute)
    app.router.add_post("/api/zha-helper/command", zha_command)
    app.router.add_post("/api/zha-helper/commands", get_zha_cluster_commands)

    # ZHA Groups
    app.router.add_get("/api/zha/groups", get_zha_groups)
    app.router.add_post("/api/zha/groups", create_zha_group)
    app.router.add_post("/api/zha/groups/remove", remove_zha_groups)
    app.router.add_post("/api/zha/groups/members/add", add_group_members)
    app.router.add_post("/api/zha/groups/members/remove", remove_group_members)

    # ZHA Binding
    app.router.add_post("/api/zha/bindable", get_bindable_devices)
    app.router.add_post("/api/zha/bind", bind_devices)
    app.router.add_post("/api/zha/unbind", unbind_devices)

    # ZHA Network
    app.router.add_get("/api/zha/network/settings", get_network_settings)
    app.router.add_post("/api/zha/network/channel", change_channel)

    # ZHA Backups
    app.router.add_get("/api/zha/backups", list_backups)
    app.router.add_post("/api/zha/backups", create_backup)

    # ZHA Device Management
    app.router.add_post("/api/zha/permit", permit_join)
    app.router.add_post("/api/zha/reconfigure", reconfigure_device)
    app.router.add_post("/api/zha/remove", remove_device)
    app.router.add_get("/api/zha/device/{ieee}", get_zha_device)

    # ZHA Configuration
    app.router.add_get("/api/zha/configuration", get_zha_config)
    app.router.add_post("/api/zha/configuration", update_zha_config)

    app.router.add_get("/api/keepalive", get_keepalive_configs)
    app.router.add_post("/api/keepalive", create_keepalive)
    app.router.add_delete("/api/keepalive/{ka_id}", delete_keepalive)

    app.router.add_get("/api/entity-history/{entity_id}", get_entity_history)

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == "__main__":
    web.run_app(create_app(), host="0.0.0.0", port=8099)
