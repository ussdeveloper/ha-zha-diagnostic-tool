# Changelog - ZHA Diagnostic Companion

## [0.9.15] - 2026-02-28

### Fixed
- **Device Helper — cluster parsing**: fixed empty clusters — ZHA WS returns `input_clusters`/`output_clusters`, code read `in_clusters`/`out_clusters`. Now handles both field names and hex string IDs.
- **Device Helper — Identify**: no longer hardcoded to endpoint 1. Dynamically finds the first endpoint with Identify cluster (0x0003).
- **Device Helper — profile/device type badges**: now correctly parse hex string profile_id/device_type from ZHA WS data. Endpoint headers show HA/ZLL profile, device type name, and cluster count.
- **Unavailable devices popup**: clicking a device now opens the device detail window (was non-interactive static HTML).
- **Entity detail — all entities**: sensor_entities now include `device_ieee` field, so opening device detail shows ALL entities (switches, sensors, zigbee) for the physical device.
- **Network map layout**: routers placed in inner ring, end-devices in outer ring with parent-proximity placement. Seeded jitter prevents overlap. Force layout has minimum separation distance and gated attraction.
- **Notify entities**: filter now includes `tts.*` entities (HA 2024+ mobile_app companion services).

### Changed
- Cache-bust bumped to `?v=0915`.
- Cluster headers show `in`/`out` type with interpunct separator and cluster count per endpoint.

## [0.9.14] - 2026-02-28

### Fixed
- **Device Helper — cluster commands**: expanding a cluster now auto-fetches available ZCL commands via `zha/devices/clusters/commands` WebSocket API. Commands shown with names, IDs, and Execute buttons — no more manual command ID typing.
- **Device Helper — command execution**: fixed 400 Bad Request error — `zha.issue_zigbee_cluster_command` now properly sends `args` parameter (was missing, causing HA schema validation failure).
- **Zigbee Logs**: fixed empty logs — state_changed filter now uses known zigbee entity set (by device_ieee) instead of keyword-matching entity_id. Captures ALL ZHA device state changes.
- **Network map animation**: fixed swirling/freezing — repulsion reduced from quadratic DPR scaling to linear, progressive damping (0.6→0.35), velocity clamping prevents explosion, converges smoothly in ~200 frames.
- **Entity detail window**: clicking an entity now finds ALL entities for the same physical device using `device_ieee` matching instead of fragile entity_id slug matching.

### Added
- **Backend**: new `POST /api/zha-helper/commands` endpoint for fetching cluster commands.
- **Device Helper**: cluster commands section with Execute buttons and optional JSON args input per command.

### Changed
- Cache-bust bumped to `?v=0914`.

## [0.9.13] - 2026-02-27

### Fixed
- **Folder system**: context menu now works inside open folder windows — paste, remove entity, and open entity actions available.
- **Copy/paste to folders**: pasting clipboard entities inside a folder window adds them to the folder instead of creating desktop shortcuts.
- **Copy from folders**: copying entities from inside a folder window now captures them to clipboard.
- **Unavailable devices popup**: health banner now triggers with ≥1 unavailable device (was ≥3), so the ZHA Issues banner and popup appear reliably.
- **Unavailable devices window**: added missing WM.defaults entry for proper window sizing/positioning.

### Added
- **Network map animation**: force-directed layout now animates visually over ~120 frames via `requestAnimationFrame` instead of running 80 iterations synchronously. Nodes settle smoothly into position.
- **Zigbee Logs — full activity mode**: new "All" / "Errors" toggle in the Zigbee Logs window. "All" mode shows every `zha_event`, zigbee `state_changed`, and zigbee-related `system_log_event` — not just errors.
- **Backend full zigbee log**: new `zigbee_full_log` deque (max 2000 entries) captures ALL ZHA events, zigbee entity state changes, and zigbee system log events.
- **Device Helper — Read All button**: reads all attributes in a cluster with one click.
- **Device Helper — Issue Command**: inline ZCL command interface per cluster (command ID, server/client type, send button).

### Changed
- Cache-bust bumped to `?v=0913`.

## [0.9.12] - 2026-02-27

### Added
- **i18n locale system**: new `locale.js` file with `ZHA_STRINGS.en` dictionary holding all user-visible UI strings. Add a new language block and set `window.ZHA_LANG` before the script loads to enable translation.
- **`t()` helper** in `app.js`: retrieves a string by key from the active locale, falling back to English and then to the key itself.
- **`applyLocale()`** in `app.js`: walks the DOM on `DOMContentLoaded` and applies `data-i18n` (textContent), `data-i18n-placeholder` (placeholder), and `data-i18n-title` (title) attributes.
- **`data-i18n*` attributes**: all static user-visible strings in `index.html` are annotated (desktop shortcuts, window titles, KPI labels, button text, input placeholders, filter labels, tooltips, status text, dialog strings, sensor option labels, telemetry legend).
- Dynamic strings in `app.js` now use `t()`: network map canvas text, battery empty-state messages, Device Helper loading/error messages, battery alert list empty state, notify entity selector placeholder, alert dialogs.

### Changed
- `README.md` translated to English (was in Polish).
- `CHANGELOG.md` entries v0.1.0–v0.5.1 translated to English.
- `app.js` version comment updated to v0.9.12.
- Cache-bust bumped to `?v=0912` on CSS/JS includes.

## [0.9.11] - 2026-02-26

### Added
- **Unavailable devices popup**: clicking the “N Zigbee device(s) are currently unavailable” link in the ZHA health banner now opens a dedicated window listing each offline device with name, IEEE address, model and device type.
- **Battery Monitor — mobile device dropdown**: the notify entity selector is now a proper `<select>` dropdown populated from all discovered `notify.*` HA entities; no manual typing needed.

### Fixed
- **UI cache after add-on update**: replaced aiohttp’s built-in `add_static` (which can return HTTP 304 cached responses) with a custom file handler that never sends 304 and always includes `Cache-Control: no-cache, no-store, must-revalidate` headers. Browser now always loads fresh files after an add-on update without needing to reinstall.

## [0.9.10] - 2026-02-26

### Improved
- **Network Map — label readability**: node name and LQI badge now have a dark semi-transparent pill background so text is always legible regardless of what’s drawn underneath.
- **Network Map — zoom transparency**: edges fade when zoomed in (alpha scales down ~30% per 2× zoom) so the focused nodes’ data is cleaner to read.
- **Network Map — viewport culling**: nodes outside the current view are skipped during rendering (performance).
- **Network Map — high-zoom detail**: at zoom > 2.5×, the device model ID appears below the label.

## [0.9.9] - 2026-02-27

### Added
- **DevHelper — endpoint header**: each endpoint now always shows a header with Zigbee profile name (e.g., "HA", "ZLL") and device type name (e.g., "On/Off Light") decoded from the ZHA device data.
- **DevHelper — HA entity matching**: selecting a device now shows all related HA entities matched by `device_ieee` field (with name-slug fallback). Each entity row is clickable and opens the device detail panel.
- **DevHelper — LQI colour indicator**: LQI is now colour-coded (green / yellow / red).
- **Add-on icon**: added `icon.png` (512×512) and `logo.png` (512×200) for HA Supervisor add-on store.

### Fixed
- `zigbee_entities` and `switch_entities` now include `device_ieee` so the frontend can link entities to ZHA devices.
- Coordinator excluded from DevHelper device list.

## [0.9.8] - 2026-02-26

### Fixed
- **Zigbee Logs — `item.raw.slice is not a function` crash**: `item.raw` is now coerced via `String(item.raw ?? "")` before `.slice()`. Also fixed the search filter to use `JSON.stringify` fallback for non-string raw values.
- **Python — `system_log_event` message as list**: HA sometimes delivers `message` as a `list[str]` in system log events. The server now joins list messages with a space before storing, preventing `[object Object]` appearing in logs.
- **Cache-bust mismatch**: `styles.css` version tag was stuck at `v=091`. Synchronized with `app.js` at `v=098`.

## [0.9.7] - 2026-02-25

### Fixed
- **Network Map — neighbor matching bug**: The previous `(n.dev.device_ieee === nb.device_ieee)` condition compared two `undefined` values, causing every edge to point to the first node in the list. Fixed to use `nb.ieee || nb.ieee_address` for correct neighbor lookup (compatible with both older and newer ZHA/zigpy field names).
- **Network Map — coordinator edges missing**: Connections from devices to the Zigbee coordinator (the central HUB) were silently dropped because the coordinator was filtered out of the node list. Edges to coordinator now draw correctly to world (0,0).
- **Network Map — duplicate edges**: When device A listed device B as neighbor and vice versa, two overlapping lines were drawn. Edges are now deduplicated by sorted IEEE pair.
- **Network Map — duplicate nodes**: Added IEEE-based deduplication of devices before building the node list. Also checks `device_type === "Coordinator"` in addition to `is_coordinator`.
- **Network Map — stale layout after data change**: Node layout was only rebuilt when the device count changed. Now tracks device IEEE fingerprint (`nodesKey`) so the layout properly rebuilds when devices are added/removed.
- **Network Map — force-directed layout**: `_forceStep()` had the same undefined neighbor matching bug, causing incorrect topology-based attraction forces. Fixed.
- **Network Map — minimap edge matching**: Minimap edge drawing had the same `device_ieee` undefined bug. Fixed with same approach; coordinator edges also shown in minimap.

### Added
- **Network Map — Scan Network button**: "Scan Network" button overlaid on the map canvas. Clicking it forces an immediate ZHA device fetch (bypassing the 60-second cooldown) and rebuilds the topology layout.
- **Backend — `/api/network-scan` endpoint**: `POST /api/network-scan` resets the ZHA map cooldown timer and triggers `_maybe_fetch_zha_map()` immediately.

## [0.9.2] - 2026-02-24

### Added
- **Battery Monitor — device selection**: click any battery device row to toggle it on the drain chart. Selected rows are highlighted. Empty selection shows top-6 weakest (original behavior).
- **Battery Monitor — notify entity labels**: autocomplete now shows the HA mobile app friendly name next to the entity id.
- **Lights window**: new standalone window listing all `light.*` entities with ON/OFF/Toggle controls; taskbar button added.
- **Network Map — dblclick to open device**: double-click a node on the map to open the Device Detail window for that device. Double-click on empty area still resets view.
- **DevHelper — horizontal resize bar**: drag the divider between the device list (left) and settings panel (right) to adjust the split.
- **Entity drag to desktop/folder**: entity rows in ZHA, Switches, and Lights windows are now draggable. Drop onto the desktop to create a shortcut icon; drop onto a desktop folder to add the entity to that folder.

### Fixed
- **Dashboard KPI window — delay chart**: chart now grows to fill the full window height instead of being fixed at 170 px (`flex: 1` with `min-height: 60px`).
- **Battery chart**: chart canvas now flex-grows with window (was fixed 180 px).

## [0.9.1] - 2026-02-23

### Fixed
- **Dashboard delay chart**: canvas now redraws live during window resize (RAF-throttled), not just on mouse-up.
- **Network Map duplicate coordinator**: coordinator node (`is_coordinator: true`) is now filtered from the device list — only drawn once as the center HUB.
- **Network Map crash**: removed dangling `groupDevicesForMap` reference (function was removed in v0.9.0 but ref remained).
- **Device Helper clusters**: no longer calls broken `zha/devices/clusters` WS command. Uses embedded endpoint/cluster data from `state.zhaDevicesFull` (fetched by `zha/devices`) directly. Falls back to API only if data unavailable.
- **Device Helper device list**: also uses `state.zhaDevicesFull` when available (avoids duplicate WS call, coordinator excluded).

### Added
- **Network Map zoom toward cursor**: scroll wheel now zooms toward the mouse pointer, not canvas center.
- **Network Map minimap**: small 140×90 overlay in bottom-right corner showing full graph at scale with viewport rectangle.
- **ZHA Health Alert Banner**: banner shown above taskbar when ZHA issues are detected (multiple coordinators, many unavailable devices). Detects issues in `_maybe_fetch_zha_map`. Dismissable.

### Changed
- Cache-bust bumped to `?v=091`.

## [0.9.0] - 2026-02-25

### Added
- **Zigbee Logs window**: live stream of all Zigbee errors (timeout, not_delivered, LQI critical, system log errors) with search, filter by type, pause, clear, and click-to-raw JSON textarea.
- **ZHA Network Map rewrite**: true force-directed topology using real `zha/devices` data (fetched every 60s via WebSocket). Shows neighbor edges with LQI-colored lines (dashed for weak links), router rings, gradient node circles, and a legend. Double-click to reset view.
- **Zigbee error tracking**: backend now detects `zha_event` timeouts, not_delivered commands, LQI < 20 critical alerts, and `system_log_event` messages with Zigbee keywords.
- **Desktop icon drag & drop**: all desktop shortcuts and folder icons are draggable; positions saved to `localStorage` and restored on reload.
- **Split resize bar**: in Telemetry window, draggable bar between the chart and log panels, styled with accent theme.
- **Themed UI components**: dropdowns and selects use custom SVG arrow, `select option` background themed; global thin scrollbar styled with accent color; autocomplete list improved (accent border, z-index fix, box-shadow).
- **Entity click opens device window**: single click on ZHA entity now opens a device-grouped detail window showing ALL related entities with state badges and switch controls, plus activity log auto-scrolled to latest.
- New API endpoints: `GET /api/zigbee-logs`, `GET /api/zha-network`.

### Changed
- Cache-bust bumped to `?v=090` on CSS/JS includes.
- `netmap-win` default size increased to 820×600.
- Entity click changed from double-click to single click in ZHA list.
- `zha_devices_full` and `zigbee_error_log` included in `/api/dashboard` payload.

## [0.8.0] - 2026-02-23

### Added
- Device Helper Explorer: new window for ZHA device configuration and cluster management.
  - Browse all ZHA devices with search, view endpoints and clusters.
  - Read/write individual Zigbee cluster attributes with ZCL help descriptions.
  - Identify button: send identify command to make device blink.
  - Keep-alive system: periodic attribute reads to keep sleepy devices responsive.
- Battery history charts from HA History API (5-minute lookback, refreshed every 30s).
- Phone battery entities visible in Battery Monitor (all HA entities with battery data).

### Fixed
- CSS/JS caching: enhanced no-cache middleware to strip ETag and Last-Modified headers, add Expires: 0. No more reinstall needed for CSS updates.

### Changed
- Cache-bust version bumped to ?v=080 on CSS/JS includes.
- Test server updated with mock ZHA device/cluster data and battery history timestamps.

## [0.7.0] - 2026-02-23

### Added
- Command tracking: telemetry log now shows sent/confirmed/timeout command status with icons.
- KPI cards: Errors count and Success% with color-coded highlighting (red/yellow/green).
- Desktop context menu: right-click to create folders, refresh data, or manage folders.
- Desktop folder system: create folders, assign custom icons, add entities, open as windows.
- Device detail window: double-click any ZHA entity to view all related entities and activity log.
- Network Map window: canvas-based ZHA device topology with LQI-colored connections, zoom (wheel), pan (drag).
- Network Map desktop icon and taskbar button.

### Changed
- All timestamps use YYYY-MM-DD HH:MM:SS format everywhere (clock, updated-at, telemetry, etc.).
- Clock now shows seconds and updates every second.
- LQI only displayed when data is available (no more "LQI: -").
- Telemetry log merges events and command log, sorted newest first with status icons.
- Backend tracks command lifecycle: sent → confirmed/timeout with 10-second timeout detection.
- Dashboard payload now includes command_log, command_errors, and command_success_rate.

## [0.6.0] - 2026-02-23

### Added
- Battery Monitor window: weakest-first sorted list, battery drain chart (top 6), color-coded badges.
- Battery alerts with configurable threshold and phone/notify entity selection.
- Autocomplete dropdowns for all entity selection fields (mirror, sensor, battery alerts).
- Window resize handles on all floating windows (drag bottom-right corner).
- Phone/notify entity selection for battery alert notifications.

### Changed
- Entire UI, comments, and docs translated to English.
- Start button icon replaced: Windows logo → ZHA/Zigbee icon.
- Clock locale changed from pl-PL to en-US.
- Select dropdowns replaced with searchable autocomplete inputs.
- Backend error messages translated to English.

### Fixed
- Entity selection no longer uses `<select>` elements (replaced with autocomplete inputs for better UX).

## [0.5.1] - 2026-02-23

### Fixed
- Cache-busting: added `?v=` query param to CSS/JS in HTML.
- `no-cache` middleware on static + index — browser/HA Ingress no longer caches stale files.
- Improved window default positions (cascade from top-left).

## [0.5.0] - 2026-02-23

### Changed
- True Win11 desktop: shortcut icons on the desktop open floating windows.
- Window Manager: drag (title-bar drag), close, minimize, maximize, focus.
- Desktop icon click opens a window; taskbar click toggles/focuses.
- Window open animation (scale + opacity).
- Taskbar with dynamic open/focused state (dot under icon).
- Start button with Windows logo icon.
- Desktop wallpaper in Win11 dark bloom-gradient style.
- Null-safe `setStatus` — no more crashes on start.

### Fixed
- TypeError: Cannot set properties of null (setting 'textContent') at setStatus.
- Canvas sync skips hidden windows (`offsetParent === null`).

## [0.4.0] - 2026-02-23

### Changed
- Full UI rebuild to Windows 11 Fluent Design (Mica, Acrylic, WinUI 3).
- Windows with real window chrome (icon + title + min/max/close).
- Taskbar at the bottom with app icons, clock and status indicator.
- Canvas rendering with DPR sync (sharp charts on HiDPI displays).
- `app.js` rewrite: eliminated flickering, added loading guard, null-safe DOM.
- Telemetry window with colour legend.

### Fixed
- Auto-refresh no longer crashes on null elements.
- Switch list no longer has nested `.right-actions`.
- Mirror and Sensor windows no longer overlap (4-row grid).

## [0.3.2] - 2026-02-23

### Fixed
- Fixed overlap between Mirror and Sensor windows (both had the same grid-row).
- Grid changed to 4 rows — all windows visible simultaneously.
- Synchronised canvas resolution with CSS size (eliminated blurry charts).
- Removed nested `.right-actions` in switch list (duplicated buttons).
- `.window-body` with `flex: 1` — lists properly fill available space.

## [0.3.1] - 2026-02-23

### Added
- New Telemetry window split horizontally:
  - Top: real-time spike event chart (ZHA/state/call/log errors),
  - Bottom: live ZHA/system event log.

### Fixed
- Fixed UI crash: `Cannot set properties of null (setting 'innerHTML')`.
- Hardened frontend against missing DOM elements (null-safe rendering).
- Rebalanced desktop layout for more readable and stable windows.

## [0.3.0] - 2026-02-23

### Added
- Full-screen desktop-style UI (Windows-like window layout).
- ZHA entity search and a separate switch search.
- Desktop KPI widgets (including P95 delay) and improved delay chart.
- Separate application/window for linking mirror switches (bidirectional by default).
- Sensor-range → switch action automation rules (in-range/out-of-range).

### Changed
- Extended backend API: sensors, switches, sensor-rules, and more detailed dashboard payload.

## [0.2.2] - 2026-02-23

### Fixed
- Fixed UI paths for Home Assistant Ingress (relative `api/*` and `static/*`).
- Added backend connection and error status indicators in UI.
- Enabled required `hassio_api` and `homeassistant_api` permissions.
- Corrected WebSocket URL to `ws://supervisor/core/websocket`.

## [0.2.1] - 2026-02-23

### Fixed
- Fixed add-on image build on Alpine (PEP 668 / externally managed environment).
- Removed `pip3 install aiohttp` from Dockerfile.
- `aiohttp` dependency now delivered via `apk` as `py3-aiohttp`.

## [0.2.0] - 2026-02-23

### Added
- Custom add-on web UI accessible via Home Assistant Ingress.
- Dashboard with VSCode dark styling.
- Switch → ack delay chart (Grafana-style).
- API for reading the dashboard and controlling switches.
- Support for mirror rules (one-way / bidirectional) between switches.

### Changed
- Rebuilt add-on runtime from a simple bash script to a Python backend (`aiohttp`).
- New add-on configuration model for event-based monitoring.

## [0.1.1] - 2026-02-23

### Added
- Additional add-on documentation and publishing process notes.

### Changed
- Add-on companion version bumped to `0.1.1` (release/doc iteration).

## [0.1.0] - 2026-02-23

### Added
- First iteration of the add-on companion.
- Periodic Zigbee log audit with a configurable interval.
- Potential error reporting to add-on logs.
