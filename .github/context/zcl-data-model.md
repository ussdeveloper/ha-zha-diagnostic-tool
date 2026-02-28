# ZCL (Zigbee Cluster Library) Data Model Reference

## Zigbee Device Hierarchy

```
Device (IEEE: aa:bb:cc:dd:ee:ff:00:11, NWK: 0x1234)
  ├── Endpoint 1 (profile: 0x0104 HA, device_type: 0x0100 On/Off Light)
  │   ├── Input Cluster 0x0000 (Basic)
  │   │   ├── Attribute 0: zcl_version (uint8)
  │   │   ├── Attribute 4: manufacturer_name (string)
  │   │   └── Attribute 5: model_identifier (string)
  │   ├── Input Cluster 0x0006 (On/Off)
  │   │   └── Attribute 0: on_off (bool)
  │   ├── Input Cluster 0x0008 (Level Control)
  │   │   └── Attribute 0: current_level (uint8)
  │   └── Output Cluster 0x0019 (OTA Upgrade)
  └── Endpoint 2 (optional — some devices have multiple)
```

## Key Clusters (commonly encountered)

| Cluster ID | Name | Common Attributes |
|---|---|---|
| 0x0000 | Basic | zcl_version, manufacturer_name, model_identifier, power_source, sw_build_id |
| 0x0001 | Power Configuration | battery_voltage, battery_percentage_remaining |
| 0x0003 | Identify | identify_time |
| 0x0006 | On/Off | on_off |
| 0x0008 | Level Control | current_level, on_off_transition_time |
| 0x000A | Time | time, time_status |
| 0x0019 | OTA Upgrade | current_file_version |
| 0x0020 | Poll Control | checkin_interval, long_poll_interval |
| 0x0101 | Door Lock | lock_state, lock_type |
| 0x0201 | Thermostat | local_temperature, occupied_cooling_setpoint, occupied_heating_setpoint, system_mode |
| 0x0204 | Thermostat UI | temperature_display_mode, keypad_lockout |
| 0x0300 | Color Control | current_hue, current_saturation, color_temperature_mireds, color_mode |
| 0x0400 | Illuminance | measured_value |
| 0x0402 | Temperature | measured_value |
| 0x0403 | Pressure | measured_value |
| 0x0405 | Relative Humidity | measured_value |
| 0x0406 | Occupancy | occupancy, occupancy_sensor_type |
| 0x0500 | IAS Zone | zone_state, zone_type, zone_status |
| 0x0502 | IAS WD | max_duration |
| 0x0702 | Metering | instantaneous_demand, current_summation_delivered |
| 0x0B04 | Electrical Measurement | active_power, rms_voltage, rms_current |
| 0xFC00–0xFFFF | Manufacturer-specific clusters | Varies |

## Device Types

| Type | Description |
|---|---|
| Coordinator | Network coordinator (USB stick / gateway) — usually 1 per network |
| Router | Mains-powered device that routes messages (most plugs, bulbs) |
| EndDevice | Battery-powered device (sensors, remotes) — no routing |

## Power Sources

- `Mains` — AC powered
- `Battery` — Battery powered
- `Unknown` — Not reported

## ZHA Unique ID Format

Format: `{ieee}-{endpoint_id}-{cluster_id_hex}`

Examples:
- `aa:bb:cc:dd:ee:ff:00:11-1-0x0006` (endpoint 1, On/Off cluster)
- `aa:bb:cc:dd:ee:ff:00:11-1-0x0402` (endpoint 1, Temperature cluster)
- `aa:bb:cc:dd:ee:ff:00:11-1` (endpoint 1, no cluster — device tracker etc.)

## Neighbor Table Entry Fields

From `zha_device_info.neighbors`:
- `device_type`: Coordinator / Router / EndDevice / Unknown
- `rx_on_when_idle`: True / False / Unknown
- `relationship`: Parent / Child / Sibling / None_of_the_above / Previous_Child
- `extended_pan_id`: Network extended PAN ID
- `ieee`: IEEE of neighbor
- `nwk`: Network address of neighbor
- `permit_joining`: Accepting joins or not
- `depth`: Network depth (hops from coordinator)
- `lqi`: Link Quality Indicator (0–255, higher = better)

## Route Table Entry Fields

From `zha_device_info.routes`:
- `DstNWK`: Destination network address
- `RouteStatus`: Active / Discovery_underway / Discovery_failed / Inactive / Validation_underway
- `MemoryConstrained`: boolean
- `ManyToOne`: boolean (many-to-one route)
- `RouteRecordRequired`: boolean
- `NextHop`: Next hop network address
