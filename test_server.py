"""Local test server — serves static files + mock API for UI testing."""
import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
import os

os.chdir(os.path.join(os.path.dirname(__file__), "addons", "zha_diagnostic_tool", "app"))

MOCK_DASHBOARD = json.dumps({
    "summary": {
        "zigbee_entities": 12,
        "switches_total": 5,
        "zigbee_switches": 5,
        "mirror_rules": 2,
        "sensor_rules": 1,
        "delay_avg_ms": 42,
        "delay_p95_ms": 87,
        "delay_max_ms": 134,
        "pending_commands": 0,
        "command_errors": 1,
        "command_success_rate": 87.5,
    },
    "zigbee_devices": [
        {"entity_id": "light.living_room", "friendly_name": "Living Room LED", "state": "on", "icon": "mdi:lightbulb", "lqi": 210, "last_updated": "2026-02-23T12:30:01"},
        {"entity_id": "sensor.temp_bedroom", "friendly_name": "Bedroom Temp", "state": "22.3", "icon": "mdi:thermometer", "lqi": 180, "last_updated": "2026-02-23T12:30:05"},
        {"entity_id": "switch.plug_kitchen", "friendly_name": "Kitchen Plug", "state": "off", "icon": "mdi:power-plug", "lqi": 195, "last_updated": "2026-02-23T12:29:50"},
        {"entity_id": "light.hallway", "friendly_name": "Hallway", "state": "off", "icon": "mdi:ceiling-light", "lqi": 165, "last_updated": "2026-02-23T12:28:10"},
        {"entity_id": "sensor.humidity_bath", "friendly_name": "Bathroom Humidity", "state": "58", "icon": "mdi:water-percent", "lqi": 200, "last_updated": "2026-02-23T12:30:02"},
    ],
    "switches": [
        {"entity_id": "switch.plug_kitchen", "friendly_name": "Kitchen Plug", "state": "off"},
        {"entity_id": "switch.plug_office", "friendly_name": "Office Plug", "state": "on"},
        {"entity_id": "switch.plug_garage", "friendly_name": "Garage Plug", "state": "off"},
    ],
    "sensors": [
        {"entity_id": "sensor.temp_bedroom", "friendly_name": "Bedroom Temp", "state": "22.3"},
        {"entity_id": "sensor.humidity_bath", "friendly_name": "Bathroom Humidity", "state": "58"},
    ],
    "battery_devices": [
        {"entity_id": "sensor.motion_hallway_battery", "friendly_name": "Hallway Motion Battery", "battery": 8, "last_updated": "2026-02-23T12:25:00",
         "battery_history": [
             {"ts": "2026-02-23T12:20:00", "value": 20},
             {"ts": "2026-02-23T12:21:00", "value": 18},
             {"ts": "2026-02-23T12:22:00", "value": 15},
             {"ts": "2026-02-23T12:23:00", "value": 12},
             {"ts": "2026-02-23T12:24:00", "value": 10},
             {"ts": "2026-02-23T12:25:00", "value": 8},
         ]},
        {"entity_id": "sensor.door_front_battery", "friendly_name": "Front Door Battery", "battery": 15, "last_updated": "2026-02-23T12:20:00",
         "battery_history": [
             {"ts": "2026-02-23T12:20:00", "value": 22},
             {"ts": "2026-02-23T12:21:00", "value": 20},
             {"ts": "2026-02-23T12:22:00", "value": 18},
             {"ts": "2026-02-23T12:23:00", "value": 17},
             {"ts": "2026-02-23T12:24:00", "value": 16},
             {"ts": "2026-02-23T12:25:00", "value": 15},
         ]},
        {"entity_id": "sensor.temp_bedroom_battery", "friendly_name": "Bedroom Temp Battery", "battery": 45, "last_updated": "2026-02-23T12:15:00",
         "battery_history": [
             {"ts": "2026-02-23T12:20:00", "value": 48},
             {"ts": "2026-02-23T12:21:00", "value": 47},
             {"ts": "2026-02-23T12:22:00", "value": 47},
             {"ts": "2026-02-23T12:23:00", "value": 46},
             {"ts": "2026-02-23T12:24:00", "value": 46},
             {"ts": "2026-02-23T12:25:00", "value": 45},
         ]},
        {"entity_id": "sensor.phone_battery_level", "friendly_name": "Phone Battery", "battery": 72, "last_updated": "2026-02-23T12:25:00",
         "battery_history": [
             {"ts": "2026-02-23T12:20:00", "value": 75},
             {"ts": "2026-02-23T12:22:00", "value": 74},
             {"ts": "2026-02-23T12:25:00", "value": 72},
         ]},
        {"entity_id": "sensor.motion_garage_battery", "friendly_name": "Garage Motion Battery", "battery": 78, "last_updated": "2026-02-23T12:10:00",
         "battery_history": [
             {"ts": "2026-02-23T12:20:00", "value": 80},
             {"ts": "2026-02-23T12:25:00", "value": 78},
         ]},
        {"entity_id": "sensor.smoke_kitchen_battery", "friendly_name": "Kitchen Smoke Battery", "battery": 92, "last_updated": "2026-02-23T12:05:00",
         "battery_history": [
             {"ts": "2026-02-23T12:20:00", "value": 93},
             {"ts": "2026-02-23T12:25:00", "value": 92},
         ]},
    ],
    "battery_alerts": [
        {"id": "bat-20-notify.mobile_app_phone", "threshold": 20, "notify_entity": "notify.mobile_app_phone", "enabled": True},
    ],
    "notify_entities": [
        {"entity_id": "notify.mobile_app_phone", "friendly_name": "Phone"},
        {"entity_id": "notify.mobile_app_tablet", "friendly_name": "Tablet"},
        {"entity_id": "notify.pushover", "friendly_name": "Pushover"},
    ],
    "command_log": [
        {"entity_id": "switch.plug_kitchen", "action": "turn_on", "status": "sent", "delay_ms": None, "ts": "2026-02-23T12:29:55", "source": "ui"},
        {"entity_id": "switch.plug_kitchen", "action": "on", "status": "confirmed", "delay_ms": 42.5, "ts": "2026-02-23T12:29:55", "source": "ui"},
        {"entity_id": "switch.plug_office", "action": "turn_off", "status": "sent", "delay_ms": None, "ts": "2026-02-23T12:28:30", "source": "ui"},
        {"entity_id": "switch.plug_office", "action": "off", "status": "confirmed", "delay_ms": 38.1, "ts": "2026-02-23T12:28:30", "source": "ui"},
        {"entity_id": "switch.plug_garage", "action": "turn_on", "status": "sent", "delay_ms": None, "ts": "2026-02-23T12:27:00", "source": "mirror"},
        {"entity_id": "switch.plug_garage", "action": "on", "status": "timeout", "delay_ms": 10023.4, "ts": "2026-02-23T12:27:10", "source": "mirror"},
    ],
    "delay_samples": [
        {"delay_ms": 30}, {"delay_ms": 45}, {"delay_ms": 38}, {"delay_ms": 52},
        {"delay_ms": 40}, {"delay_ms": 67}, {"delay_ms": 134}, {"delay_ms": 55},
        {"delay_ms": 42}, {"delay_ms": 35}, {"delay_ms": 48}, {"delay_ms": 87},
        {"delay_ms": 33}, {"delay_ms": 41}, {"delay_ms": 60}, {"delay_ms": 29},
    ],
    "mirror_rules": [
        {"id": "r1", "source": "switch.plug_kitchen", "target": "switch.plug_office", "bidirectional": True},
    ],
    "sensor_rules": [
        {"id": "sr1", "sensor_entity": "sensor.temp_bedroom", "switch_entity": "switch.plug_garage",
         "min_value": 18, "max_value": 25, "action_in_range": "turn_on", "action_out_of_range": "turn_off"},
    ],
    "telemetry": {
        "spikes": [
            {"zha": 3, "state": 5, "call": 1, "log_error": 0},
            {"zha": 4, "state": 3, "call": 2, "log_error": 0},
            {"zha": 2, "state": 6, "call": 0, "log_error": 1},
            {"zha": 5, "state": 4, "call": 3, "log_error": 0},
            {"zha": 1, "state": 2, "call": 1, "log_error": 0},
            {"zha": 6, "state": 7, "call": 2, "log_error": 0},
            {"zha": 3, "state": 5, "call": 1, "log_error": 2},
            {"zha": 4, "state": 3, "call": 4, "log_error": 0},
        ],
        "events": [
            {"type": "zha_event", "summary": "Device 0x1234 button press", "ts": "2026-02-23T12:30:01"},
            {"type": "state_changed", "summary": "light.living_room: off -> on", "ts": "2026-02-23T12:29:58"},
            {"type": "call_service", "summary": "switch.turn_on plug_kitchen", "ts": "2026-02-23T12:29:55"},
        ],
    },
    "zha_devices_full": [
        {
            "ieee": "00:00:00:00:00:00:00:00", "nwk": "0x0000",
            "name": "Coordinator", "user_given_name": "ZHA Coordinator",
            "manufacturer": "Dresden Elektronik", "model": "ConBee II",
            "is_coordinator": True, "device_type": "Coordinator",
            "power_source_str": "Main", "available": True,
            "endpoints": {},
            "neighbors": [],
        },
        {
            "ieee": "00:11:22:33:44:55:66:77", "nwk": "0x1234",
            "name": "TRADFRI motion sensor", "user_given_name": "Hallway Motion",
            "manufacturer": "IKEA of Sweden", "model": "TRADFRI motion sensor",
            "is_coordinator": False, "device_type": "EndDevice",
            "power_source_str": "Battery", "available": True,
            "lqi": 210,
            "endpoints": {
                "1": {"in_clusters": [0, 1, 3, 32, 1030], "out_clusters": [25]}
            },
            "neighbors": [
                {"ieee": "11:22:33:44:55:66:77:88", "lqi": 210},
                {"ieee": "aa:bb:cc:dd:ee:ff:00:11", "lqi": 185},
            ],
        },
        {
            "ieee": "aa:bb:cc:dd:ee:ff:00:11", "nwk": "0x5678",
            "name": "lumi.weather", "user_given_name": "Bedroom Temp",
            "manufacturer": "Xiaomi", "model": "lumi.weather",
            "is_coordinator": False, "device_type": "EndDevice",
            "power_source_str": "Battery", "available": True,
            "lqi": 180,
            "endpoints": {
                "1": {"in_clusters": [0, 1, 3, 1026, 1029], "out_clusters": []}
            },
            "neighbors": [
                {"ieee": "11:22:33:44:55:66:77:88", "lqi": 175},
            ],
        },
        {
            "ieee": "11:22:33:44:55:66:77:88", "nwk": "0x9ABC",
            "name": "TRADFRI control outlet", "user_given_name": "Kitchen Plug",
            "manufacturer": "IKEA of Sweden", "model": "TRADFRI control outlet",
            "is_coordinator": False, "device_type": "Router",
            "power_source_str": "Main", "available": True,
            "lqi": 195,
            "endpoints": {
                "1": {"in_clusters": [0, 3, 4, 5, 6, 8, 2820], "out_clusters": [25]}
            },
            "neighbors": [
                {"ieee": "00:11:22:33:44:55:66:77", "lqi": 210},
                {"ieee": "aa:bb:cc:dd:ee:ff:00:11", "lqi": 185},
                {"ieee": "22:33:44:55:66:77:88:99", "lqi": 155},
            ],
        },
        {
            "ieee": "22:33:44:55:66:77:88:99", "nwk": "0xDEF0",
            "name": "lumi.magnet.agl02", "user_given_name": None,
            "manufacturer": "Xiaomi", "model": "lumi.magnet.agl02",
            "is_coordinator": False, "device_type": "EndDevice",
            "power_source_str": "Battery", "available": True,
            "lqi": 80,
            "endpoints": {
                "1": {"in_clusters": [0, 1, 3, 1280], "out_clusters": []}
            },
            "neighbors": [
                {"ieee": "11:22:33:44:55:66:77:88", "lqi": 80},
            ],
        },
        {
            "ieee": "33:44:55:66:77:88:99:aa", "nwk": "0x1111",
            "name": "Aqara Vibration Sensor", "user_given_name": "Washing Machine",
            "manufacturer": "Xiaomi", "model": "lumi.vibration.agl01",
            "is_coordinator": False, "device_type": "EndDevice",
            "power_source_str": "Battery", "available": False,
            "lqi": 40,
            "endpoints": {
                "1": {"in_clusters": [0, 1, 3], "out_clusters": []}
            },
            "neighbors": [],
        },
    ],
    "zigbee_error_log": [
        {"ts": "2026-02-23T12:25:01", "type": "timeout", "ieee": "22:33:44:55:66:77:88:99", "command": "toggle", "lqi": 80, "raw": {"type":"zha_event","entity_id":"binary_sensor.door_front","event_type":"timeout"}},
        {"ts": "2026-02-23T12:27:15", "type": "not_delivered", "ieee": "33:44:55:66:77:88:99:aa", "command": "on", "lqi": 40, "raw": {"type":"zha_event","event_type":"not_delivered"}},
        {"ts": "2026-02-23T12:28:00", "type": "lqi_critical", "ieee": "22:33:44:55:66:77:88:99", "command": None, "lqi": 18, "raw": {"type":"zha_event","data":{"lqi":18}}},
        {"ts": "2026-02-23T12:29:30", "type": "log_error", "ieee": None, "command": None, "lqi": None, "raw": {"message": "zigbee coordinator lost connection", "level": "error"}},
    ],
    "zha_health_issues": [],
    "runtime": {"token_present": True, "last_error": None},
})

MOCK_ZHA_DEVICES = json.dumps({
    "items": [
        {"ieee": "00:11:22:33:44:55:66:77", "nwk": "0x1234", "name": "IKEA Motion Sensor", "user_given_name": "Hallway Motion",
         "manufacturer": "IKEA of Sweden", "model": "TRADFRI motion sensor", "quirk_applied": True,
         "entities": [{"entity_id": "binary_sensor.hallway_motion"}]},
        {"ieee": "aa:bb:cc:dd:ee:ff:00:11", "nwk": "0x5678", "name": "Aqara Temperature Sensor", "user_given_name": "Bedroom Temp",
         "manufacturer": "Xiaomi", "model": "lumi.weather", "quirk_applied": True,
         "entities": [{"entity_id": "sensor.temp_bedroom"}, {"entity_id": "sensor.humidity_bath"}]},
        {"ieee": "11:22:33:44:55:66:77:88", "nwk": "0x9ABC", "name": "IKEA Plug", "user_given_name": "Kitchen Plug",
         "manufacturer": "IKEA of Sweden", "model": "TRADFRI control outlet", "quirk_applied": False,
         "entities": [{"entity_id": "switch.plug_kitchen"}]},
        {"ieee": "22:33:44:55:66:77:88:99", "nwk": "0xDEF0", "name": "Aqara Door Sensor", "user_given_name": None,
         "manufacturer": "Xiaomi", "model": "lumi.magnet.agl02", "quirk_applied": True,
         "entities": [{"entity_id": "binary_sensor.door_front"}]},
    ]
})

MOCK_ZHA_CLUSTERS = json.dumps({
    "1": {
        "endpoint_id": 1,
        "clusters": {
            "in": [
                {"id": 0, "name": "Basic"},
                {"id": 1, "name": "Power Configuration"},
                {"id": 3, "name": "Identify"},
                {"id": 6, "name": "On/Off"},
                {"id": 32, "name": "Poll Control"},
                {"id": 1030, "name": "Occupancy Sensing"},
            ],
            "out": [
                {"id": 25, "name": "OTA"},
            ]
        }
    }
})

MOCK_ZHA_ATTRIBUTES = json.dumps({
    "attributes": [
        {"id": 0, "name": "zcl_version", "type": "uint8"},
        {"id": 4, "name": "manufacturer_name", "type": "string"},
        {"id": 5, "name": "model_identifier", "type": "string"},
        {"id": 7, "name": "power_source", "type": "enum8"},
        {"id": 16384, "name": "sw_build_id", "type": "string"},
    ]
})


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.path = "/static/index.html"
            return super().do_GET()
        if self.path.startswith("/api/dashboard"):
            self._json_response(MOCK_DASHBOARD)
            return
        if self.path.startswith("/api/zha-helper/devices"):
            self._json_response(MOCK_ZHA_DEVICES)
            return
        if self.path.startswith("/api/zha-helper/clusters/"):
            self._json_response(MOCK_ZHA_CLUSTERS)
            return
        if self.path.startswith("/api/keepalive"):
            self._json_response('{"items":[]}')
            return
        if self.path.startswith("/api/zha-network"):
            # Return the same zha_devices_full from dashboard
            import json as _json
            dash = _json.loads(MOCK_DASHBOARD)
            self._json_response(_json.dumps(dash["zha_devices_full"]))
            return
        if self.path.startswith("/api/zigbee-logs"):
            import json as _json
            dash = _json.loads(MOCK_DASHBOARD)
            self._json_response(_json.dumps(dash["zigbee_error_log"]))
            return
        if self.path.startswith("/api/"):
            self._json_response("[]")
            return
        return super().do_GET()

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        self.rfile.read(content_len)  # consume body
        if self.path.startswith("/api/zha-helper/attributes"):
            self._json_response(MOCK_ZHA_ATTRIBUTES)
            return
        if self.path.startswith("/api/zha-helper/read-attribute"):
            self._json_response('{"zcl_version": 3}')
            return
        self._json_response('{"ok":true}')

    def do_DELETE(self):
        self._json_response('{"ok":true}')

    def _json_response(self, data):
        body = data.encode() if isinstance(data, str) else data
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


print("Test server: http://localhost:8099")
HTTPServer(("0.0.0.0", 8099), Handler).serve_forever()
