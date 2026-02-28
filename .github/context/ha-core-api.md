# Home Assistant Core WebSocket API Reference

Source: `developers.home-assistant.io/docs/api/websocket`

## Connection

1. Connect to `ws://supervisor/core/websocket` (from add-on)
2. Receive `{"type": "auth_required"}`
3. Send `{"type": "auth", "access_token": "$SUPERVISOR_TOKEN"}`
4. Receive `{"type": "auth_ok"}`
5. Send commands with incrementing `id` field

## Core Commands

### `get_states` — Get all entity states
- Returns: `list[state_object]`
- state_object: `{entity_id, state, attributes, last_changed, last_updated, context}`

### `get_config` — Get HA configuration
- Returns: `{latitude, longitude, elevation, unit_system, location_name, time_zone, ...}`

### `get_services` — Get all available services
- Returns: `dict[domain, dict[service_name, {description, fields}]]`

### `get_panels` — Get registered frontend panels
- Returns: `dict[panel_id, {...}]`

### `call_service` — Call a service
- Params: `{ domain, service, service_data?, target?, return_response? }`
- target: `{ entity_id?, device_id?, area_id? }`

### `subscribe_events` — Subscribe to event bus
- Params: `{ event_type? }` (omit for ALL events)
- Common event_types: `state_changed`, `call_service`, `zha_event`, `system_log_event`
- Returns: subscription_id for unsubscribing

### `unsubscribe_events` — Unsubscribe
- Params: `{ subscription: <id> }`

### `fire_event` — Fire custom event
- Params: `{ event_type, event_data? }`

### `ping` — Heartbeat
- Returns: `{ type: "pong" }`

## Registry Commands

### `config/device_registry/list` — List all devices
- Returns: `list[{id, name, name_by_user, manufacturer, model, identifiers, area_id, ...}]`
- identifiers: `[["zha", "aa:bb:cc:dd:ee:ff:00:11"], ...]`

### `config/entity_registry/list` — List all entities
- Returns: `list[{entity_id, device_id, platform, unique_id, name, icon, disabled_by, ...}]`

### `config/area_registry/list` — List all areas
- Returns: `list[{area_id, name, picture, aliases, floor_id, ...}]`

## Event Subscriptions

### `state_changed` event
```json
{
  "event_type": "state_changed",
  "data": {
    "entity_id": "light.kitchen",
    "old_state": { "state": "off", "attributes": {...} },
    "new_state": { "state": "on", "attributes": {...} }
  }
}
```

### `zha_event` event
```json
{
  "event_type": "zha_event",
  "data": {
    "device_ieee": "aa:bb:cc:dd:ee:ff:00:11",
    "device_id": "abc123",
    "unique_id": "aa:bb:cc:dd:ee:ff:00:11:1:0x0006",
    "command": "click",
    "args": { "button": 1 }
  }
}
```

### `system_log_event` event
```json
{
  "event_type": "system_log_event",
  "data": {
    "level": "ERROR",
    "message": "...",
    "source": ["homeassistant/components/zha/..."],
    "timestamp": 1234567890.123
  }
}
```

## REST API Endpoints (most relevant)

- `GET /api/states` — All entity states
- `GET /api/states/<entity_id>` — Single entity state
- `POST /api/states/<entity_id>` — Set entity state
- `GET /api/services` — All services
- `POST /api/services/<domain>/<service>` — Call service
- `GET /api/history/period/<timestamp>` — History data
- `GET /api/config` — HA configuration
- `GET /api/events` — Event listeners
- `POST /api/events/<event_type>` — Fire event
