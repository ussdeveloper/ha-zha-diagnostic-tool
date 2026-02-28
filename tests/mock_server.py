"""Lightweight mock aiohttp server serving the UI with fake ZHA data.

Run:  python tests/mock_server.py
Then open http://localhost:8099
"""
from __future__ import annotations

import json
from pathlib import Path

from aiohttp import web

STATIC_DIR = Path(__file__).resolve().parent.parent / "addons" / "zha_diagnostic_tool" / "app" / "static"

FAKE_ZHA_DEVICES = [
    {
        "ieee": "00:11:22:33:44:55:66:77",
        "nwk": 12345,
        "name": "Aqara Temperature Sensor",
        "user_given_name": "Living Room Temp",
        "manufacturer": "Xiaomi",
        "model": "lumi.weather",
        "available": True,
        "is_coordinator": False,
        "lqi": 210,
        "device_type": "EndDevice",
        "quirk_applied": True,
        "quirk_class": "XiaomiAqaraE1Thermostat",
        "endpoints": {
            "1": {
                "profile_id": 260,
                "device_type": 770,
                "input_clusters": [0, 1, 3, 1026, 1029, 1027],
                "output_clusters": [3, 25],
            }
        },
        "neighbors": [],
    },
    {
        "ieee": "aa:bb:cc:dd:ee:ff:00:11",
        "nwk": 54321,
        "name": "Ikea Outlet",
        "user_given_name": "Kitchen Plug",
        "manufacturer": "IKEA of Sweden",
        "model": "TRADFRI control outlet",
        "available": True,
        "is_coordinator": False,
        "lqi": 180,
        "device_type": "Router",
        "quirk_applied": False,
        "endpoints": {
            "1": {
                "profile_id": 260,
                "device_type": 266,
                "input_clusters": [0, 3, 4, 5, 6, 8, 2820],
                "output_clusters": [3, 25],
            }
        },
        "neighbors": [{"ieee": "00:11:22:33:44:55:66:77", "lqi": 190, "relationship": "child"}],
    },
    {
        "ieee": "cc:dd:ee:ff:00:11:22:33",
        "nwk": 1,
        "name": "Coordinator",
        "user_given_name": "",
        "manufacturer": "Texas Instruments",
        "model": "CC2652",
        "available": True,
        "is_coordinator": True,
        "lqi": 255,
        "device_type": "Coordinator",
        "endpoints": {"1": {"profile_id": 260, "device_type": 5, "input_clusters": [0], "output_clusters": []}},
        "neighbors": [
            {"ieee": "00:11:22:33:44:55:66:77", "lqi": 210, "relationship": "child"},
            {"ieee": "aa:bb:cc:dd:ee:ff:00:11", "lqi": 180, "relationship": "child"},
        ],
    },
    {
        "ieee": "11:22:33:44:55:66:77:88",
        "nwk": 9999,
        "name": "Tuya Smart Plug",
        "user_given_name": "Desk Lamp",
        "manufacturer": "TuYa",
        "model": "TS0121",
        "available": False,
        "is_coordinator": False,
        "lqi": 60,
        "device_type": "Router",
        "quirk_applied": True,
        "quirk_class": "TuyaTS0121Plug",
        "endpoints": {
            "1": {
                "profile_id": 260,
                "device_type": 81,
                "input_clusters": [0, 3, 4, 5, 6, 0xEF00, 2820],
                "output_clusters": [25],
            }
        },
        "neighbors": [{"ieee": "cc:dd:ee:ff:00:11:22:33", "lqi": 55, "relationship": "parent"}],
    },
]

DEVICE_ENTITY_MAP = {
    "00:11:22:33:44:55:66:77": [
        "sensor.living_room_temp_temperature",
        "sensor.living_room_temp_humidity",
        "sensor.living_room_temp_pressure",
        "sensor.living_room_temp_battery",
    ],
    "aa:bb:cc:dd:ee:ff:00:11": [
        "switch.kitchen_plug",
        "sensor.kitchen_plug_power",
        "sensor.kitchen_plug_energy",
    ],
    "11:22:33:44:55:66:77:88": [
        "switch.desk_lamp",
        "sensor.desk_lamp_power",
    ],
}

FAKE_ZIGBEE_ENTITIES = [
    {"entity_id": "sensor.living_room_temp_temperature", "state": "22.5", "friendly_name": "Living Room Temperature", "device_class": "temperature", "lqi": 210, "icon": "mdi:thermometer", "last_updated": "2026-02-28T12:00:00Z", "device_ieee": "00:11:22:33:44:55:66:77"},
    {"entity_id": "sensor.living_room_temp_humidity", "state": "45", "friendly_name": "Living Room Humidity", "device_class": "humidity", "lqi": 210, "icon": "mdi:water-percent", "last_updated": "2026-02-28T12:00:00Z", "device_ieee": "00:11:22:33:44:55:66:77"},
    {"entity_id": "sensor.living_room_temp_pressure", "state": "1013", "friendly_name": "Living Room Pressure", "device_class": "pressure", "lqi": 210, "icon": "mdi:gauge", "last_updated": "2026-02-28T12:00:00Z", "device_ieee": "00:11:22:33:44:55:66:77"},
]

FAKE_SWITCHES = [
    {"entity_id": "switch.kitchen_plug", "state": "on", "friendly_name": "Kitchen Plug", "icon": "mdi:power-plug", "last_updated": "2026-02-28T11:30:00Z", "device_ieee": "aa:bb:cc:dd:ee:ff:00:11"},
    {"entity_id": "switch.desk_lamp", "state": "off", "friendly_name": "Desk Lamp", "icon": "mdi:desk-lamp", "last_updated": "2026-02-28T10:00:00Z", "device_ieee": "11:22:33:44:55:66:77:88"},
]

FAKE_SENSORS = [
    {"entity_id": "sensor.kitchen_plug_power", "state": "45.2", "numeric_state": 45.2, "friendly_name": "Kitchen Plug Power", "unit": "W", "icon": "mdi:flash", "device_ieee": "aa:bb:cc:dd:ee:ff:00:11"},
    {"entity_id": "sensor.kitchen_plug_energy", "state": "12.5", "numeric_state": 12.5, "friendly_name": "Kitchen Plug Energy", "unit": "kWh", "icon": "mdi:lightning-bolt", "device_ieee": "aa:bb:cc:dd:ee:ff:00:11"},
    {"entity_id": "sensor.desk_lamp_power", "state": "unavailable", "numeric_state": None, "friendly_name": "Desk Lamp Power", "unit": "W", "icon": "mdi:flash", "device_ieee": "11:22:33:44:55:66:77:88"},
    {"entity_id": "sensor.living_room_temp_battery", "state": "87", "numeric_state": 87, "friendly_name": "Living Room Battery", "unit": "%", "icon": "mdi:battery", "device_ieee": "00:11:22:33:44:55:66:77"},
]


async def index(_: web.Request) -> web.Response:
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    return web.Response(text=html, content_type="text/html")


async def static_file(request: web.Request) -> web.Response:
    filename = request.match_info["filename"]
    filepath = (STATIC_DIR / filename).resolve()
    if not str(filepath).startswith(str(STATIC_DIR.resolve())):
        return web.Response(status=403)
    if not filepath.exists():
        return web.Response(status=404)
    mime = {".html": "text/html", ".css": "text/css", ".js": "application/javascript"}.get(filepath.suffix, "application/octet-stream")
    return web.Response(body=filepath.read_bytes(), content_type=mime)


async def dashboard(_: web.Request) -> web.Response:
    return web.json_response({
        "kpi": {
            "zigbee_entities": len(FAKE_ZIGBEE_ENTITIES),
            "zigbee_switches": len(FAKE_SWITCHES),
            "switches_total": len(FAKE_SWITCHES),
            "sensor_rules": 0,
            "mirror_rules": 0,
            "pending_commands": 0,
            "command_errors": 0,
            "command_success_rate": 100.0,
            "delay_avg_ms": 120,
            "delay_p95_ms": 250,
            "delay_max_ms": 400,
        },
        "delay_samples": [{"ts": "2026-02-28T12:00:00Z", "delay_ms": 120}],
        "telemetry": {"spikes": [], "events": []},
        "mirror_rules": [],
        "sensor_rules": [],
        "zigbee_devices": FAKE_ZIGBEE_ENTITIES,
        "switches": FAKE_SWITCHES,
        "sensors": FAKE_SENSORS,
        "battery_devices": [{"entity_id": "sensor.living_room_temp_battery", "state": "87", "friendly_name": "Living Room Battery", "battery": 87, "last_updated": "2026-02-28T12:00:00Z", "battery_history": []}],
        "battery_alerts": [],
        "notify_entities": [],
        "command_log": [],
        "zha_devices_full": FAKE_ZHA_DEVICES,
        "zigbee_error_log": [],
        "zigbee_full_log": [],
        "zha_health_issues": [],
        "unavailable_devices": [
            {"name": "Desk Lamp", "ieee": "11:22:33:44:55:66:77:88", "lqi": 60, "model": "TS0121", "device_type": "Router"},
        ],
        "device_entity_map": DEVICE_ENTITY_MAP,
    })


async def zha_devices(_: web.Request) -> web.Response:
    return web.json_response({"items": FAKE_ZHA_DEVICES})


async def zha_clusters(request: web.Request) -> web.Response:
    ieee = request.match_info.get("ieee", "")
    dev = next((d for d in FAKE_ZHA_DEVICES if d["ieee"] == ieee), None)
    if not dev:
        return web.json_response({})
    return web.json_response(dev.get("endpoints", {}))


async def zha_attributes(request: web.Request) -> web.Response:
    return web.json_response({"attributes": [
        {"id": 0, "name": "zcl_version", "value": 3},
        {"id": 1, "name": "application_version", "value": 1},
        {"id": 4, "name": "manufacturer_name", "value": "Xiaomi"},
        {"id": 5, "name": "model_identifier", "value": "lumi.weather"},
    ]})


async def zha_commands(request: web.Request) -> web.Response:
    return web.json_response({"commands": [
        {"id": 0, "name": "reset_to_factory_defaults", "type": "server"},
    ]})


async def stub_get(_: web.Request) -> web.Response:
    return web.json_response({"items": []})


async def stub_post(request: web.Request) -> web.Response:
    return web.json_response({"ok": True})


async def zha_read_attribute(request: web.Request) -> web.Response:
    return web.json_response({"value": 0})


async def zha_groups_get(_: web.Request) -> web.Response:
    return web.json_response({"groups": [
        {"group_id": 1, "name": "Living Room", "members": [
            {"ieee": "00:11:22:33:44:55:66:77", "endpoint_id": 1},
        ]},
    ]})


async def zha_bindable(request: web.Request) -> web.Response:
    return web.json_response({"devices": FAKE_ZHA_DEVICES[:2]})


async def zha_network_settings(_: web.Request) -> web.Response:
    return web.json_response({"settings": {
        "radio_type": "znp",
        "network_info": {
            "channel": 15,
            "pan_id": "0x1A62",
            "extended_pan_id": "00:11:22:33:44:55:66:77",
            "coordinator_ieee": "cc:dd:ee:ff:00:11:22:33",
            "network_key": "hidden",
            "nwk_update_id": 0,
        },
    }})


async def zha_backups(_: web.Request) -> web.Response:
    return web.json_response({"items": []})


async def entity_history(request: web.Request) -> web.Response:
    return web.json_response({"history": []})


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/", index)
    app.router.add_get("/static/{filename:.+}", static_file)
    app.router.add_get("/api/dashboard", dashboard)
    # ZHA helper
    app.router.add_get("/api/zha-helper/devices", zha_devices)
    app.router.add_get("/api/zha-helper/clusters/{ieee}", zha_clusters)
    app.router.add_post("/api/zha-helper/attributes", zha_attributes)
    app.router.add_post("/api/zha-helper/commands", zha_commands)
    app.router.add_post("/api/zha-helper/command", stub_post)
    app.router.add_post("/api/zha-helper/read-attribute", zha_read_attribute)
    app.router.add_post("/api/zha-helper/write-attribute", stub_post)
    # Basic entities
    app.router.add_get("/api/zigbee-devices", stub_get)
    app.router.add_get("/api/switches", stub_get)
    app.router.add_get("/api/sensors", stub_get)
    app.router.add_get("/api/mirror-rules", stub_get)
    app.router.add_post("/api/mirror-rules", stub_post)
    app.router.add_delete("/api/mirror-rules/{rule_id}", stub_post)
    app.router.add_get("/api/sensor-rules", stub_get)
    app.router.add_post("/api/sensor-rules", stub_post)
    app.router.add_delete("/api/sensor-rules/{rule_id}", stub_post)
    app.router.add_get("/api/battery-alerts", stub_get)
    app.router.add_post("/api/battery-alerts", stub_post)
    app.router.add_delete("/api/battery-alerts/{alert_id}", stub_post)
    app.router.add_get("/api/zigbee-logs", stub_get)
    app.router.add_get("/api/keepalive-configs", stub_get)
    app.router.add_get("/api/keepalive", stub_get)
    app.router.add_post("/api/keepalive", stub_post)
    app.router.add_post("/api/refresh", stub_post)
    app.router.add_post("/api/switch-action", stub_post)
    # ZHA groups
    app.router.add_get("/api/zha/groups", zha_groups_get)
    app.router.add_post("/api/zha/groups", stub_post)
    app.router.add_post("/api/zha/groups/remove", stub_post)
    # ZHA binding
    app.router.add_post("/api/zha/bindable", zha_bindable)
    app.router.add_post("/api/zha/bind", stub_post)
    app.router.add_post("/api/zha/unbind", stub_post)
    # Network settings
    app.router.add_get("/api/zha/network/settings", zha_network_settings)
    app.router.add_post("/api/zha/network/channel", stub_post)
    app.router.add_get("/api/zha/backups", zha_backups)
    app.router.add_post("/api/zha/backups", stub_post)
    app.router.add_post("/api/zha/permit", stub_post)
    app.router.add_post("/api/network-scan", stub_post)
    # Entity history
    app.router.add_get("/api/entity-history/{eid}", entity_history)
    return app


if __name__ == "__main__":
    print("Mock server starting on http://localhost:8099")
    web.run_app(create_app(), host="127.0.0.1", port=8099)
