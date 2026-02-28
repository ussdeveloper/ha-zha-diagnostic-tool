# Current Integration Gaps — app.py vs Available ZHA API

## Currently Implemented (6 ZHA WS commands + 2 registry + 2 REST services)

| Command | Usage |
|---|---|
| `zha/devices` | Poll all devices every 60s, Device Helper list |
| `zha/devices/clusters` | Device Helper cluster browser |
| `zha/devices/clusters/attributes` | Device Helper attribute list |
| `zha/devices/clusters/attributes/value` | Read attribute, keepalive ping |
| `zha/devices/clusters/commands` | Device Helper command list |
| `zha/topology/update` | Network scan button |
| `config/device_registry/list` | Build IEEE→entity_id mapping |
| `config/entity_registry/list` | Build IEEE→entity_id mapping |
| `services/zha/set_zigbee_cluster_attribute` | Write attribute from UI |
| `services/zha/issue_zigbee_cluster_command` | Issue command from UI |

## MISSING — High Priority

### 1. Groups Management (complete gap)
- `zha/groups` — List groups
- `zha/group` — Get single group
- `zha/group/add` — Create group
- `zha/group/remove` — Remove group
- `zha/group/members/add` — Add members
- `zha/group/members/remove` — Remove members
- `zha/devices/groupable` — Get groupable devices
- **Impact:** No Zigbee group management at all. Groups are essential for multi-device control.

### 2. Device Binding (complete gap)
- `zha/devices/bindable` — Discover bindable targets
- `zha/devices/bind` — Bind two devices
- `zha/devices/unbind` — Unbind two devices
- `zha/groups/bind` — Bind device to group
- `zha/groups/unbind` — Unbind device from group
- **Impact:** No direct device-to-device or device-to-group binding from UI.

### 3. Network Settings & Channel (complete gap)
- `zha/network/settings` — Get current network config (radio type, channel, PAN ID, etc.)
- `zha/network/change_channel` — Change Zigbee channel
- **Impact:** No visibility into network parameters. Can't change channel for interference avoidance.

### 4. Network Backups (complete gap)
- `zha/network/backups/list` — List backups
- `zha/network/backups/create` — Create backup
- `zha/network/backups/restore` — Restore backup
- **Impact:** No backup/restore capability from diagnostic tool.

### 5. ZHA Configuration (complete gap)
- `zha/configuration` — Get config schemas + current values
- `zha/configuration/update` — Update config
- **Impact:** Can't view/modify ZHA integration settings (light transition, polling, unavailability thresholds).

## MISSING — Medium Priority

### 6. Device Pairing
- `zha/devices/permit` — Open network for joining (with install code / QR support)
- **Impact:** Must use HA UI to pair new devices.

### 7. Device Reconfigure
- `zha/devices/reconfigure` — Re-bind clusters, re-configure reporting
- **Impact:** No "reconfigure" button for misbehaving devices.

### 8. Single Device Fetch
- `zha/device` — Get single device by IEEE (more efficient than fetching all)
- **Impact:** Minor — could improve refresh performance for Device Helper.

### 9. Area Registry
- `config/area_registry/list` — Get all areas
- **Impact:** Devices don't show area assignment in UI.

## MISSING — Lower Priority / Niche

### 10. Group Commands (REST)
- `services/zha/issue_zigbee_group_command` — Send command to group
- **Impact:** Niche — useful if group management is implemented.

### 11. IAS Warning Devices
- `services/zha/warning_device_squawk` — Sirens
- `services/zha/warning_device_warn` — Sirens
- **Impact:** Only relevant for IAS WD devices (sirens).

### 12. Lock User Codes
- `services/zha/set_lock_user_code` / `clear_lock_user_code` etc.
- **Impact:** Only relevant for Zigbee locks.

## Architecture Observations

1. **Polling vs Real-time:** Currently uses REST `GET /api/states` polling every 2s. Already subscribes to `state_changed` via WS but only uses it for switch delay tracking — doesn't update `self.states` from events.
2. **WS connection pattern:** Each `_ws_command()` call opens a NEW WebSocket connection, authenticates, sends one command, reads response, then disconnects. This is wasteful — should maintain a persistent connection with command multiplexing.
3. **No persistent WS for commands:** The event subscription WS (`_ws_loop`) is separate from the command WS. Should merge or use a shared connection pool.
