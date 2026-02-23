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
    },
    "zigbee_devices": [
        {"entity_id": "light.living_room", "friendly_name": "Salon LED", "state": "on", "icon": "mdi:lightbulb", "lqi": 210, "last_updated": "12:30:01"},
        {"entity_id": "sensor.temp_bedroom", "friendly_name": "Temp Sypialnia", "state": "22.3", "icon": "mdi:thermometer", "lqi": 180, "last_updated": "12:30:05"},
        {"entity_id": "switch.plug_kitchen", "friendly_name": "Gniazdko Kuchnia", "state": "off", "icon": "mdi:power-plug", "lqi": 195, "last_updated": "12:29:50"},
        {"entity_id": "light.hallway", "friendly_name": "Korytarz", "state": "off", "icon": "mdi:ceiling-light", "lqi": 165, "last_updated": "12:28:10"},
        {"entity_id": "sensor.humidity_bath", "friendly_name": "Wilgotnosc Lazienka", "state": "58", "icon": "mdi:water-percent", "lqi": 200, "last_updated": "12:30:02"},
    ],
    "switches": [
        {"entity_id": "switch.plug_kitchen", "friendly_name": "Gniazdko Kuchnia", "state": "off"},
        {"entity_id": "switch.plug_office", "friendly_name": "Gniazdko Biuro", "state": "on"},
        {"entity_id": "switch.plug_garage", "friendly_name": "Gniazdko Garaz", "state": "off"},
    ],
    "sensors": [
        {"entity_id": "sensor.temp_bedroom", "friendly_name": "Temp Sypialnia", "state": "22.3"},
        {"entity_id": "sensor.humidity_bath", "friendly_name": "Wilgotnosc Lazienka", "state": "58"},
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
