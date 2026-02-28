# ZHA Diagnostic Tool — Copilot Instructions

## Project Overview
Home Assistant Supervisor add-on for ZHA Zigbee diagnostics with a Windows 11 Fluent Design desktop-style web UI.

## Architecture
- **Backend**: Python 3.12 + aiohttp on Alpine Linux (`ghcr.io/home-assistant/${BUILD_ARCH}-base:3.22`)
- **Frontend**: Vanilla JS + CSS (no frameworks), MDI icons from CDN
- **Add-on config**: `addons/zha_diagnostic_tool/config.yaml`
- **Backend**: `addons/zha_diagnostic_tool/app/app.py`
- **Frontend**: `addons/zha_diagnostic_tool/app/static/index.html`, `styles.css`, `app.js`

## Critical Constraints
1. **NO pip** — Alpine 3.22+ blocks pip (PEP 668). Always use `apk add py3-*` packages.
2. **Relative paths only** — HA Ingress rewrites paths. Use `api/...` and `static/...`, NEVER `/api/...` or `/static/...`.
3. **SUPERVISOR_TOKEN** — env var for HA API auth: `Authorization: Bearer $SUPERVISOR_TOKEN`
4. **WebSocket URL**: `ws://supervisor/core/websocket` (not http)
5. **REST API URL**: `http://supervisor/core/api`
6. **Canvas sync** — always call `syncCanvas(canvas)` before drawing (fixes DPR + flex sizing)
7. **Null-safe DOM** — all `getElementById` calls must handle null (elements may not exist during init)

## UI Design Rules
- Windows 11 Fluent Design dark theme (Mica material, Acrylic blur)
- Window chrome: icon + title + min/max/close (decorative) buttons
- Taskbar at bottom with centered app icons + clock + status dot
- Color tokens from CSS variables (--accent: #60cdff, --surface: #2b2b2b, etc.)
- Rounded corners: 12px windows, 8px cards, 4px controls

## Version Management
- **Always bump version** on every code change:
  - `addons/zha_diagnostic_tool/config.yaml` → `version: "X.Y.Z"`
  - `addons/zha_diagnostic_tool/CHANGELOG.md` → add-on changelog
  - `CHANGELOG.md` → root repo changelog
- Versioning: add-on uses `0.X.Y`, root uses `0.(X+1).Y`
- Commit message format: `type(scope): description`
- Always `git push` after commit

## File Structure
```
addons/zha_diagnostic_tool/
├── Dockerfile
├── config.yaml           # HA add-on manifest (version here!)
├── run.sh
├── CHANGELOG.md
├── app/
│   ├── app.py            # aiohttp server + HA WS integration
│   └── static/
│       ├── index.html    # Windows 11 desktop layout
│       ├── styles.css    # Fluent Design dark Mica theme
│       └── app.js        # Frontend logic + charts
```

## API Routes
- `GET /api/dashboard` — full payload (KPIs, devices, rules, telemetry)
- `GET /api/zigbee-devices`, `/api/switches`, `/api/sensors`
- `GET|POST|DELETE /api/mirror-rules[/{rule_id}]`
- `GET|POST|DELETE /api/sensor-rules[/{rule_id}]`
- `POST /api/switch-action` — `{ entity_id, action }`
- `POST /api/refresh` — force state refresh

## Config Options (schema)
- `poll_interval_seconds` (default: 2)
- `max_delay_samples` (default: 300)
- `mirror_cooldown_ms` (default: 1200)
- `grafana_theme` (default: "vscode-dark")

## Context Knowledge Base

Detailed API references and gap analysis are stored in `.github/context/`:
- **`zha-websocket-api.md`** — Complete ZHA WS command reference (27+ commands with params/returns)
- **`ha-core-api.md`** — HA Core WebSocket + REST API reference
- **`supervisor-addon-api.md`** — Supervisor add-on auth, proxy URLs, config flags
- **`zcl-data-model.md`** — Zigbee Cluster Library: device hierarchy, clusters, device types
- **`current-integration-gaps.md`** — Gap analysis: what app.py implements vs what's available

**Always read these files when working on ZHA integration features.**
