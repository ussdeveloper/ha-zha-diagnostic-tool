# Changelog - ZHA Diagnostic Companion

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
- Cache-busting: query param `?v=` na CSS/JS w HTML.
- Middleware `no-cache` na static + index — przeglądarka/HA Ingress nie cachują starych plików.
- Lepsze pozycje okien (cascade from top-left).

## [0.5.0] - 2026-02-23

### Changed
- Prawdziwy desktop Win11: ikony na pulpicie otwierające pływające okna.
- Window Manager: drag (przeciąganie za titlebar), close, minimize, maximize, focus.
- Kliknięcie ikony na pulpicie otwiera okno, kliknięcie w taskbar toggle/focus.
- Okna z animacją otwarcia (scale + opacity).
- Taskbar z dynamicznym stanem open/focused (kropka pod ikoną).
- Przycisk Start z ikoną Windows.
- Tapeta desktop w stylu Win11 dark bloom gradient.
- Null-safe setStatus — koniec crashy na starcie.

### Fixed
- TypeError: Cannot set properties of null (setting 'textContent') at setStatus.
- Canvas sync pomija ukryte okna (offsetParent === null).

## [0.4.0] - 2026-02-23

### Changed
- Pełna przebudowa UI na Windows 11 Fluent Design (Mica, Acrylic, WinUI 3).
- Okna z prawdziwym window chrome (ikona + tytuł + min/max/close).
- Taskbar na dole z ikonami aplikacji, zegarem i statusem.
- Canvas rendering z DPR sync (ostre wykresy na HiDPI).
- Re-write app.js: wyeliminowanie migotania, guard `loading`, null-safe DOM.
- Telemetria z legendą kolorów.

### Fixed
- Auto-refresh nie crashuje na null elementach.
- Lista switchy nie ma zagnieżdżonych `.right-actions`.
- Okna Mirror i Sensor nie nakładają się (4-wierszowy grid).

## [0.3.2] - 2026-02-23

### Fixed
- Naprawa nakładania się okien Mirror i Sensor (obie miały ten sam grid-row).
- Grid zmieniony na 4 wiersze — wszystkie okna widoczne jednocześnie.
- Synchronizacja rozdzielczości canvasu z rozmiarem CSS (wyeliminowanie rozmytych wykresów).
- Usunięcie zagnieżdżonych `.right-actions` w liście switchy (zduplikowane przyciski).
- `.window-body` z `flex: 1` — listy poprawnie wypełniają przestrzeń.

## [0.3.1] - 2026-02-23

### Added
- Nowe okno Telemetria podzielone horyzontalnie:
	- góra: wykres spike eventów (ZHA/state/call/log errors) w czasie rzeczywistym,
	- dół: log eventów ZHA/systemowych na żywo.

### Fixed
- Naprawa crasha UI: `Cannot set properties of null (setting 'innerHTML')`.
- Uodpornienie frontendu na brakujące elementy DOM (null-safe rendering).
- Rebalans layoutu desktop, aby okna były czytelniejsze i stabilniejsze.

## [0.3.0] - 2026-02-23

### Added
- Full-screen desktop-style UI (Windows-like układ okien).
- Wyszukiwarka encji ZHA i osobna wyszukiwarka switchy.
- Widgety pulpitowe KPI (w tym PHI/P95 delay) oraz ulepszony wykres delay.
- Osobna aplikacja/okno do linkowania mirror switchy (domyślnie bidirectional).
- Reguły automatyzacji sensor-range -> switch action (w zakresie/poza zakresem).

### Changed
- Rozszerzone API backendu o sensory, switche, sensor-rules i bardziej szczegółowy payload dashboardu.

## [0.2.2] - 2026-02-23

### Fixed
- Naprawa ścieżek UI pod Home Assistant Ingress (relatywne `api/*` i `static/*`).
- Dodano status połączenia i błędów backendu bezpośrednio w UI.
- Włączono wymagane uprawnienia `hassio_api` i `homeassistant_api`.
- Korekta URL websocket do `ws://supervisor/core/websocket`.

## [0.2.1] - 2026-02-23

### Fixed
- Naprawa builda obrazu add-ona na Alpine (PEP 668 / externally managed environment).
- Usunięto instalację `pip3 install aiohttp` z Dockerfile.
- Zależność `aiohttp` dostarczana przez `apk` jako `py3-aiohttp`.

## [0.2.0] - 2026-02-23

### Added
- Własny web UI add-ona dostępny przez Home Assistant Ingress.
- Dashboard w stylistyce VSCode dark.
- Wykres delay switch -> ack (Grafana-style).
- API do odczytu dashboardu i sterowania switchami.
- Obsługa reguł mirror (one-way / bidirectional) między switchami.

### Changed
- Przebudowa runtime add-ona z prostego skryptu bash na backend Python (`aiohttp`).
- Nowy model konfiguracji add-ona pod monitoring eventowy.

## [0.1.1] - 2026-02-23

### Added
- Dodatkowa dokumentacja add-ona i procesu publikacji repo.

### Changed
- Wersja add-on companion podbita do `0.1.1` (iteracja release/doc).

## [0.1.0] - 2026-02-23

### Added
- Pierwsza iteracja add-on companion.
- Cykliczny audyt logów Zigbee z konfigurowalnym interwałem.
- Raportowanie potencjalnych błędów do logów add-ona.
