from __future__ import annotations

import asyncio
import contextlib
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
import json
import logging
import os
from pathlib import Path
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
STATIC_DIR = Path(__file__).parent / "static"

ZIGBEE_KEYWORDS = ("zigbee", "zha", "deconz", "zigbee2mqtt", "bellows", "ezsp")


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

        self.poll_interval_seconds = int(self.options.get("poll_interval_seconds", 2))
        self.max_delay_samples = int(self.options.get("max_delay_samples", 300))
        self.mirror_cooldown_ms = int(self.options.get("mirror_cooldown_ms", 1200))
        self.grafana_theme = str(self.options.get("grafana_theme", "vscode-dark"))

        self.states: dict[str, dict[str, Any]] = {}
        self.zigbee_entities: list[dict[str, Any]] = []
        self.switch_entities: list[dict[str, Any]] = []
        self.sensor_entities: list[dict[str, Any]] = []

        self.delay_samples: deque[dict[str, Any]] = deque(maxlen=self.max_delay_samples)
        self.pending: dict[str, PendingSwitchCommand] = {}
        self.recent_mirror_targets: dict[str, float] = {}
        self.recent_sensor_actions: dict[str, float] = {}

        self.mirror_rules: list[dict[str, Any]] = self._load_json(MIRROR_RULES_PATH, default=[])
        self.sensor_rules: list[dict[str, Any]] = self._load_json(SENSOR_RULES_PATH, default=[])

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
            self.last_error = "Brak SUPERVISOR_TOKEN (sprawdź homeassistant_api/hassio_api w config.yaml)"
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
                await self.refresh_states()
                self.last_error = None
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
                LOGGER.warning("State poll error: %s", exc)
            await asyncio.sleep(self.poll_interval_seconds)

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
                    }
                )

        self.states = states
        self.zigbee_entities = sorted(zigbee_entities, key=lambda e: e["entity_id"])
        self.switch_entities = sorted(switch_entities, key=lambda e: e["entity_id"])
        self.sensor_entities = sorted(sensor_entities, key=lambda e: e["entity_id"])
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

            while True:
                msg = await ws.receive(timeout=60)
                if msg.type == WSMsgType.TEXT:
                    await self._handle_ws_message(json.loads(msg.data))
                elif msg.type in {WSMsgType.CLOSED, WSMsgType.CLOSE, WSMsgType.ERROR}:
                    raise RuntimeError("Websocket closed")

    async def _handle_ws_message(self, data: dict[str, Any]) -> None:
        if data.get("type") != "event":
            return

        event = data.get("event", {})
        event_type = event.get("event_type")
        event_data = event.get("data", {})

        if event_type == "call_service":
            self._handle_call_service(event_data)
        elif event_type == "state_changed":
            await self._handle_state_changed(event_data)

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
                "delay_avg_ms": delay_avg,
                "delay_p95_ms": p95,
                "delay_max_ms": delay_max,
            },
            "delay_samples": samples[-180:],
            "mirror_rules": self.mirror_rules,
            "sensor_rules": self.sensor_rules,
            "zigbee_devices": self.zigbee_entities,
            "switches": self.switch_entities,
            "sensors": self.sensor_entities,
        }

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
    def _is_zigbee_state(item: dict[str, Any]) -> bool:
        if not item:
            return False
        return DiagnosticRuntime._is_zigbee_entity(item)

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


async def index(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


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
        return web.json_response({"error": "source i target muszą być switch.*"}, status=400)
    if source == target:
        return web.json_response({"error": "source i target nie mogą być takie same"}, status=400)

    rule = {
        "id": f"{source}->{target}",
        "source": source,
        "target": target,
        "bidirectional": bidirectional,
        "enabled": True,
        "created_at": datetime.now(tz=UTC).isoformat(),
    }

    if any(str(item.get("id")) == rule["id"] for item in runtime.mirror_rules):
        return web.json_response({"error": "Taka reguła już istnieje"}, status=409)

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
        return web.json_response({"error": "sensor_entity musi być sensor.*"}, status=400)
    if not switch_entity.startswith("switch."):
        return web.json_response({"error": "switch_entity musi być switch.*"}, status=400)

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
        return web.json_response({"error": "Taka reguła już istnieje"}, status=409)

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
        return web.json_response({"error": "Nie udało się wykonać akcji switch"}, status=500)

    return web.json_response({"ok": True})


async def refresh_now(_: web.Request) -> web.Response:
    await runtime.refresh_states()
    return web.json_response({"ok": True})


async def on_startup(_: web.Application) -> None:
    await runtime.start()


async def on_cleanup(_: web.Application) -> None:
    await runtime.stop()


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_static("/static", str(STATIC_DIR), show_index=False)

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

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
    return app


if __name__ == "__main__":
    web.run_app(create_app(), host="0.0.0.0", port=8099)
