# ZHA Diagnostic Tool — Companion Add-on

A Home Assistant Supervisor add-on with a Windows 11 Fluent Design desktop-style web UI (available via Ingress). Monitors Zigbee devices and visualises switch delay metrics in real time.

## Features

- Windows 11 Fluent Design dark theme (Mica, Acrylic) desktop UI,
- Switch → ack delay charts (time series, Grafana-style),
- Full ZHA entity list with live search,
- Dedicated switch panel with search and ON/OFF/Toggle actions,
- Per-switch delay monitoring (`call_service` → confirmed `state_changed`),
- Mirror rules: link two switches (bidirectional by default),
- Sensor-range rules: automatically control a switch when a sensor enters/exits a range,
- ZHA Network Map: force-directed topology, LQI-coloured edges, zoom/pan, minimap,
- Device Helper Explorer: read/write Zigbee cluster attributes, keep-alive scheduler,
- Battery Monitor: weakest-first list, drain chart, configurable low-battery alerts,
- Zigbee Logs: live error stream (timeout, not_delivered, LQI critical, system log),
- ZHA health banner: warns about multiple coordinators or many offline devices.

## How delay measurement works

The add-on subscribes to Home Assistant events (`call_service` and `state_changed`) and builds delay samples for each switch command.

- `AVG` — average round-trip delay,
- `P95` — 95th-percentile delay,
- `MAX` — maximum delay observed.

## Mirror rules

Add a rule `source → target` in the Mirror Switches window.

- State changes on `source` are mirrored to `target`,
- `bidirectional` option mirrors in both directions,
- Cooldown prevents reflection loops.

## Add-on options

| Option | Type | Default | Description |
|---|---|---|---|
| `poll_interval_seconds` | int | 2 | How often (seconds) to poll HA for state updates |
| `max_delay_samples` | int | 300 | Maximum number of delay samples to keep in memory |
| `mirror_cooldown_ms` | int | 1200 | Minimum gap (ms) between mirror actions to prevent loops |
| `grafana_theme` | string | `vscode-dark` | Reserved for future chart theming |

## Notes

This is a **companion** add-on. It reads from the standard ZHA integration; no custom components are required.
