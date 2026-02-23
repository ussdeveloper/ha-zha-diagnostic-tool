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
        {"entity_id": "light.living_room", "friendly_name": "Living Room LED", "state": "on", "icon": "mdi:lightbulb", "lqi": 210, "last_updated": "12:30:01"},
        {"entity_id": "sensor.temp_bedroom", "friendly_name": "Bedroom Temp", "state": "22.3", "icon": "mdi:thermometer", "lqi": 180, "last_updated": "12:30:05"},
        {"entity_id": "switch.plug_kitchen", "friendly_name": "Kitchen Plug", "state": "off", "icon": "mdi:power-plug", "lqi": 195, "last_updated": "12:29:50"},
        {"entity_id": "light.hallway", "friendly_name": "Hallway", "state": "off", "icon": "mdi:ceiling-light", "lqi": 165, "last_updated": "12:28:10"},
        {"entity_id": "sensor.humidity_bath", "friendly_name": "Bathroom Humidity", "state": "58", "icon": "mdi:water-percent", "lqi": 200, "last_updated": "12:30:02"},
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
        {"entity_id": "sensor.motion_hallway_battery", "friendly_name": "Hallway Motion Battery", "battery": 8, "last_updated": "12:25:00",
         "battery_history": [{"value": 95}, {"value": 88}, {"value": 72}, {"value": 55}, {"value": 38}, {"value": 20}, {"value": 8}]},
        {"entity_id": "sensor.door_front_battery", "friendly_name": "Front Door Battery", "battery": 15, "last_updated": "12:20:00",
         "battery_history": [{"value": 100}, {"value": 92}, {"value": 80}, {"value": 60}, {"value": 35}, {"value": 15}]},
        {"entity_id": "sensor.temp_bedroom_battery", "friendly_name": "Bedroom Temp Battery", "battery": 45, "last_updated": "12:15:00",
         "battery_history": [{"value": 100}, {"value": 95}, {"value": 85}, {"value": 70}, {"value": 55}, {"value": 45}]},
        {"entity_id": "sensor.motion_garage_battery", "friendly_name": "Garage Motion Battery", "battery": 78, "last_updated": "12:10:00",
         "battery_history": [{"value": 100}, {"value": 98}, {"value": 92}, {"value": 85}, {"value": 78}]},
        {"entity_id": "sensor.smoke_kitchen_battery", "friendly_name": "Kitchen Smoke Battery", "battery": 92, "last_updated": "12:05:00",
         "battery_history": [{"value": 100}, {"value": 99}, {"value": 97}, {"value": 94}, {"value": 92}]},
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
            {"type": "zha_event", "summary": "Device 0x1234 button press", "ts": "12:30:01"},
            {"type": "state_changed", "summary": "light.living_room: off -> on", "ts": "12:29:58"},
            {"type": "call_service", "summary": "switch.turn_on plug_kitchen", "ts": "12:29:55"},
        ],
    },
    "runtime": {"token_present": True, "last_error": None},
})


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            self.path = "/static/index.html"
            return super().do_GET()
        if self.path.startswith("/api/dashboard"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(MOCK_DASHBOARD.encode())
            return
        if self.path.startswith("/api/"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"[]")
            return
        return super().do_GET()

    def do_POST(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_DELETE(self):
        self.do_POST()


print("Test server: http://localhost:8099")
HTTPServer(("0.0.0.0", 8099), Handler).serve_forever()
