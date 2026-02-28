# Supervisor Add-on API Authentication & Configuration

## Authentication

- **Environment variable:** `SUPERVISOR_TOKEN` (replaces deprecated `HASSIO_TOKEN`)
- **REST proxy:** `http://supervisor/core/api/` with `Authorization: Bearer $SUPERVISOR_TOKEN`
- **WebSocket proxy:** `ws://supervisor/core/websocket`
  - Authenticate: `{"type": "auth", "access_token": "$SUPERVISOR_TOKEN"}`

## Config Requirements

In `config.yaml`:
```yaml
homeassistant_api: true   # Required for Core API access
hassio_api: true          # Required for Supervisor API access
ingress: true             # Web UI served through HA Ingress
ingress_port: 8099
```

### Without `hassio_api: true`, these work:
- `/core/api` (REST)
- `/core/api/stream` (SSE)
- `/core/websocket` (WS)
- `/addons/self/*` (add-on self-management)
- `/services*`, `/discovery*`, `/info`

## Add-on Options Access

Options defined in `config.yaml` schema are available at runtime as `/data/options.json`.

## Ingress Path Handling

HA Ingress rewrites all paths. **Always use relative paths** in frontend:
- `api/dashboard` ✅
- `/api/dashboard` ❌ (will break behind Ingress)
- `static/app.js` ✅
- `/static/app.js` ❌

## WebSocket Connection Pattern

```python
async with session.ws_connect("ws://supervisor/core/websocket", heartbeat=25) as ws:
    auth_required = await ws.receive_json(timeout=15)
    await ws.send_json({"type": "auth", "access_token": token})
    auth_ok = await ws.receive_json(timeout=15)
    # Now send commands with incrementing id
    await ws.send_json({"id": 1, "type": "zha/devices"})
```
