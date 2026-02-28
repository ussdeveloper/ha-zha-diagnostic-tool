# ZHA WebSocket API — Complete Reference

Source: `homeassistant/components/zha/websocket_api.py` (HA Core)

## Device Commands

### `zha/devices` — List all ZHA devices
- No params required
- Returns: `list[zha_device_info]`

### `zha/device` — Get single device by IEEE
- Params: `{ ieee: "aa:bb:cc:dd:ee:ff:00:11" }`
- Returns: `zha_device_info`

### `zha/devices/permit` — Open network for joining
- Params: `{ duration: 60 }` (optional: `ieee`, `source_ieee`, `install_code`, `qr_code`)
- Duration: 0–254 seconds

### `zha/devices/reconfigure` — Reconfigure device
- Params: `{ ieee: "..." }`
- Re-binds clusters, re-configures reporting

### `zha/devices/clusters` — Get clusters for device
- Params: `{ ieee: "..." }`
- Returns: `list[{id, name, type, endpoint_id}]`

### `zha/devices/clusters/attributes` — List attributes for cluster
- Params: `{ ieee, endpoint_id, cluster_id, cluster_type }`
- cluster_type: `"in"` or `"out"`
- Returns: `list[{id, name, type}]`

### `zha/devices/clusters/attributes/value` — Read attribute value
- Params: `{ ieee, endpoint_id, cluster_id, cluster_type, attribute }` (optional: `manufacturer`)
- Returns: attribute value

### `zha/devices/clusters/commands` — List commands for cluster
- Params: `{ ieee, endpoint_id, cluster_id, cluster_type }`
- Returns: `list[{id, name, type, schema}]` (schema serialized with voluptuous_serialize)

## Binding Commands

### `zha/devices/groupable` — Get devices eligible for group membership
- No params
- Returns: `list[{...device_info, endpoint_id}]`

### `zha/devices/bindable` — Get bindable target devices
- Params: `{ ieee: "..." }` (source device)
- Returns: `list[zha_device_info]` (potential binding targets)

### `zha/devices/bind` — Bind two devices
- Params: `{ source_ieee, target_ieee }`
- Creates Zigbee binding between two devices

### `zha/devices/unbind` — Unbind two devices
- Params: `{ source_ieee, target_ieee }`

## Group Commands

### `zha/groups` — List all ZHA groups
- No params
- Returns: `list[group_info]`
- group_info: `{name, group_id, members: [{endpoint_id, device: zha_device_info, entities: [...]}]}`

### `zha/group` — Get single group
- Params: `{ group_id: 1234 }`
- Returns: `group_info`

### `zha/group/add` — Create new group
- Params: `{ group_name: "...", members: [{ieee, endpoint_id}] }` (optional: `group_id`)

### `zha/group/remove` — Remove groups
- Params: `{ group_ids: [1234, 5678] }`

### `zha/group/members/add` — Add members to group
- Params: `{ group_id, members: [{ieee, endpoint_id}] }`

### `zha/group/members/remove` — Remove members from group
- Params: `{ group_id, members: [{ieee, endpoint_id}] }`

### `zha/groups/bind` — Bind device to group
- Params: `{ source_ieee, group_id, bindings: [{name, type, id, endpoint_id}] }`

### `zha/groups/unbind` — Unbind device from group
- Params: `{ source_ieee, group_id, bindings: [{name, type, id, endpoint_id}] }`

## Network Commands

### `zha/topology/update` — Trigger topology scan
- No params (can take 30–60 seconds)
- Scans all devices' neighbor tables

### `zha/network/settings` — Get network settings
- No params
- Returns: `{radio_type, device: {path, baudrate, flow_control}, settings: {pan_id, extended_pan_id, channel, ...}}`

### `zha/network/backups/list` — List network backups
- No params
- Returns: `list[backup]`

### `zha/network/backups/create` — Create network backup
- No params (takes 5–30 seconds)
- Returns: backup object

### `zha/network/backups/restore` — Restore network backup
- Params: `{ backup: {...} }` (optional: `ezsp_force_write_eui64`)
- Takes 30–40 seconds

### `zha/network/change_channel` — Change Zigbee channel
- Params: `{ new_channel: 15 }` (11–26, or `"auto"` for energy scan)

## Configuration Commands

### `zha/configuration` — Get ZHA configuration
- No params
- Returns: `{data: {schemas, data}}` — config schemas + current values

### `zha/configuration/update` — Update ZHA configuration
- Params: `{ data: {...} }` — same structure as configuration schemas

## zha_device_info Structure

```json
{
  "ieee": "aa:bb:cc:dd:ee:ff:00:11",
  "nwk": "0x1234",
  "manufacturer": "IKEA of Sweden",
  "model": "TRADFRI bulb E27",
  "name": "TRADFRI bulb E27",
  "quirk_applied": true,
  "quirk_class": "zhaquirks.ikea.tradfri...",
  "exposes_features": true,
  "manufacturer_code": 4476,
  "power_source": "Mains",
  "lqi": 255,
  "rssi": -40,
  "last_seen": "2024-01-01T12:00:00",
  "available": true,
  "device_type": "Router",
  "signature": { "endpoints": {...}, "manufacturer": "...", ... },
  "active_coordinator": false,
  "entities": [{"entity_id": "light.tradfri_bulb", "name": "..."}],
  "neighbors": [{"device_type": "Router", "ieee": "...", "nwk": "...", "lqi": "255", ...}],
  "routes": [{"DstNWK": "0x...", "RouteStatus": "Active", "NextHop": "0x...", ...}],
  "endpoint_names": [{"name": "Color dimmable light"}],
  "user_given_name": "Kitchen Light",
  "device_reg_id": "abcdef1234",
  "area_id": "living_room"
}
```

## ZHA Service Actions (REST)

- `POST /api/services/zha/permit` — `{ duration, ieee? }`
- `POST /api/services/zha/remove` — `{ ieee }`
- `POST /api/services/zha/set_zigbee_cluster_attribute` — `{ ieee, endpoint_id, cluster_id, cluster_type, attribute, value, manufacturer? }`
- `POST /api/services/zha/issue_zigbee_cluster_command` — `{ ieee, endpoint_id, cluster_id, cluster_type, command, command_type, args?, params? }`
- `POST /api/services/zha/issue_zigbee_group_command` — `{ group, cluster_id, cluster_type, command, command_type, args?, manufacturer? }`
- `POST /api/services/zha/warning_device_squawk` — IAS WD squawk
- `POST /api/services/zha/warning_device_warn` — IAS WD warning
