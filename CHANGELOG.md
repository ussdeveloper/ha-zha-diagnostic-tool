# Changelog

All notable changes to this project are documented in this file.

Format inspired by Keep a Changelog, versioning follows SemVer.

## [0.10.14] - 2026-02-28

### Fixed
- Entity-device binding: `openDeviceDetail()` + network map double-click now use `deviceEntityMap` from HA registry as primary lookup.
- Device Helper: endpoint/attribute IDs always sent as proper integers.
- Network map: stronger force layout — wider spacing, soft separation zone, more animation frames.

### Added
- ZCL database: expanded from 12 to ~95 clusters with comprehensive attributes (standard ZCL + manufacturer-specific: Xiaomi, Tuya, Ikea, Philips, etc.).

## [0.10.13] - 2026-02-28

### Fixed
- Network map: much wider spacing (idealDist 90-160, repulsion 5000, center gravity 0.0005).
- Device Helper: complete rewrite — cluster expand/collapse, attribute read/write, command execution all fully working.

### Added
- Network map: hover tooltip (name, manufacturer, IEEE, NWK, LQI) + highlight ring.
- Network map: minimap click-to-focus viewport panning.
- Sensor history chart: icon in device detail, canvas chart with 24h/7d/30d/5mo slider.
- Backend: `GET /api/entity-history/{entity_id}?period=` endpoint.

## [0.10.12] - 2026-02-28

### Fixed
- Notify select: fetches mobile_app targets from HA services API (not state entities).
- Network map: topology scan via `zha/topology/update`, weaker center gravity, stronger repulsion, canvas-scaled layout.
- Device Helper: entity matching via HA device+entity registry (IEEE→entity_id mapping).
- Device Helper: improved cluster layout with sticky endpoint headers, directional cluster type icons.

### Added
- Backend configurable WS timeout (`_ws_command`), device_entity_map in dashboard payload.
- Network map topology info bar with device counts.

## [0.10.11] - 2026-02-28

### Fixed
- Device Helper: fixed empty clusters — handles both `input_clusters`/`output_clusters` and `in_clusters`/`out_clusters` field names, plus hex string cluster/profile IDs.
- Device Helper: Identify now finds correct endpoint with cluster 0x0003 (was hardcoded to EP 1).
- Device Helper: endpoint headers show profile name, device type, and cluster count.
- Unavailable popup: devices are now clickable — opens device detail window.
- Entity detail: sensor_entities include device_ieee — all device entities now visible.
- Network map: layered ring layout (routers inner, end-devices outer), force layout with min separation.
- Notify entities: includes tts.* for HA 2024+ mobile_app services.

## [0.10.10] - 2026-02-28

### Fixed
- Device Helper: auto-fetch and display cluster commands with named Execute buttons (was manual command ID input).
- Device Helper: fixed 400 error on command execution (missing args/params in service call).
- Zigbee Logs: entity set-based filter captures all ZHA device state changes (was keyword-only).
- Network map: stable force-directed layout with progressive damping and velocity clamping.
- Entity detail window: uses device_ieee for reliable multi-entity device matching.

### Added
- Backend cluster commands endpoint (`/api/zha-helper/commands`).

## [0.10.9] - 2026-02-27

### Fixed
- Folder system: context menu, copy/paste, and entity management now work inside open folder windows.
- Unavailable devices health banner triggers at ≥1 device (was ≥3); popup window has proper WM sizing.

### Added
- Network map animated force-directed layout — nodes settle smoothly over ~120 frames.
- Zigbee Logs "All Activity" mode showing every ZHA event, zigbee state change, and system log entry.
- Device Helper "Read All" and "Issue Command" buttons per cluster.

## [0.10.8] - 2026-02-27

### Added
- i18n locale system (`locale.js`) with `ZHA_STRINGS.en` dictionary covering all user-visible UI strings. Add a new language block and set `window.ZHA_LANG` to enable a translation.
- `t()` helper and `applyLocale()` in `app.js`; all static HTML strings annotated with `data-i18n`, `data-i18n-placeholder`, and `data-i18n-title` attributes.
- Dynamic strings in `app.js` (network map, battery, Device Helper) now use `t()` for full translation coverage.

### Changed
- `README.md` (add-on) rewritten in English; CHANGELOG entries v0.1.0–v0.5.1 translated from Polish to English.
- Cache-bust bumped to `?v=0912`.

## [0.10.7] - 2026-02-26

### Added
- Unavailable ZHA devices popup window — click the health banner link to see details (name, IEEE, model, type).
- Battery Monitor notify entity is now a `<select>` dropdown sourced from all `notify.*` entities.

### Fixed
- Static file caching: replaced `add_static` with a custom handler that always returns HTTP 200 with `no-cache, no-store` headers, eliminating stale UI after add-on updates.

## [0.10.6] - 2026-02-26

### Improved
- Network map: label + LQI badges have dark pill backgrounds for readability.
- Network map: edge opacity scales down when zoomed in, reducing visual noise.
- Network map: viewport culling skips off-screen nodes.
- Network map: model ID shown below device name at zoom > 2.5×.

## [0.10.5] - 2026-02-27

### Added
- DevHelper endpoint headers now decode Zigbee profile ID and device type to human-readable names (e.g., "HA · On/Off Light").
- DevHelper shows related HA entities matched by `device_ieee` with LQI colour-coding; entity rows clickable.
- `icon.png` (512×512) and `logo.png` added to add-on directory for HA store display.

### Fixed
- `device_ieee` now included in backend entity payloads enabling correct device→entity linking.
- Coordinator excluded from DevHelper device list.

## [0.10.4] - 2026-02-26

### Fixed
- `item.raw.slice` crash in Zigbee Logs when raw value is non-string.
- HA `system_log_event` message list coercion on Python backend.
- CSS/JS cache-bust version mismatch (synchronized at v098).

## [0.10.3] - 2026-02-25

### Fixed
- Network Map: neighbor matching bug (undefined === undefined matched all nodes), coordinator edges now visible, duplicate edges deduplicated, stale layout after device changes fixed, force-directed attraction fixed, minimap edges fixed.

### Added
- Network Map: "Scan Network" button forces immediate ZHA topology fetch.
- Backend: `POST /api/network-scan` endpoint.

## [0.10.2] - 2026-02-24

### Added
- Battery device chart selection, Lights window, map node dblclick, entity drag-to-desktop, DevHelper resize bar.

### Fixed
- KPI delay chart now fills window height (flex instead of fixed px).

## [0.9.1] - 2026-02-23

### Fixed
- Dashboard delay chart live resize (RAF-throttled canvas sync during drag).
- Network Map: coordinator filtered from node list (no more duplicate HUB).
- Network Map: removed dangling `groupDevicesForMap` call.
- Device Helper: uses `zhaDevicesFull` embedded endpoint data instead of broken `zha/devices/clusters` WS command.

### Added
- Network Map: zoom toward mouse cursor on scroll wheel.
- Network Map: minimap overlay (140×90) in bottom-right with viewport indicator.
- ZHA Health Banner: detected issues (multiple coordinators, unavailable devices) shown as a dismissable alert banner above the taskbar.

### Changed
- Cache-bust `?v=091`.

## [0.9.0] - 2026-02-25

### Added
- **Zigbee Logs window**: live stream of all Zigbee errors (timeout, not_delivered, LQI critical, system log errors) with search, filter by type, pause, clear, and click-to-raw JSON textarea.
- **ZHA Network Map rewrite**: true force-directed topology from `zha/devices` WS data (every 60s). Neighbor edges colored by LQI, router rings, gradient nodes, legend, double-click to reset.
- **Zigbee error tracking**: backend captures `zha_event` timeouts, not_delivered, LQI < 20, and `system_log_event` Zigbee keyword messages into a rolling 500-entry log.
- **Desktop icon drag & drop**: shortcuts and folder icons draggable; positions persisted to `localStorage`.
- **Split resize bar**: draggable divider between Telemetry chart and log panels, accent-themed.
- **Themed UI components**: custom select dropdown arrow, themed scrollbars, improved autocomplete list.
- **Entity → Device window**: single click opens device-grouped window with all related entities, state badges, switch controls, and auto-scrolled activity log.
- New API: `GET /api/zigbee-logs`, `GET /api/zha-network`.

### Changed
- Cache-bust `?v=090`.
- Device Helper Explorer (from v0.8.0): ZHA device configuration tool with cluster browsing, attribute read/write, ZCL help descriptions, identify command, and keep-alive periodic pings.
- Battery history charts: real data from HA History API with 5-minute lookback.
- Phone battery entities in Battery Monitor (any HA entity with battery data).
- Keep-alive CRUD API endpoints and periodic evaluation task.
- ZHA device helper API: devices list, clusters, attributes, read/write, command endpoints.

### Fixed
- CSS caching issue: stripped ETag/Last-Modified headers, added Expires: 0. Static files always re-fetch.

### Changed
- Test server: mock ZHA devices/clusters, battery history with timestamps.
- Cache-bust version v=080.

## [0.8.0] - 2026-02-23

### Added
- Command tracking with sent/confirmed/timeout lifecycle in telemetry log.
- KPI error count and success rate cards with color-coded values.
- Desktop right-click context menu with folder creation and refresh.
- Desktop folders with custom icons, entity search/assignment, localStorage persistence.
- Device detail window on entity double-click showing related entities and activity log.
- Network Map window with canvas-based ZHA topology, LQI-colored connections, zoom/pan.

### Changed
- All dates and times standardized to YYYY-MM-DD HH:MM:SS format.
- Clock shows seconds, updates every second.
- LQI displayed only when available (hidden when null).
- Telemetry log merges WS events + command log with status icons.
- Backend: command_log deque, 10-second timeout detection, command_errors/success_rate in summary.

## [0.7.0] - 2026-02-23

### Added
- Battery Monitor window with weakest-first list, drain chart, and color-coded badges.
- Battery alert system with threshold config and phone/notify entity notifications.
- Autocomplete searchable dropdowns for all entity selection fields.
- Window resize handles on all floating desktop windows.
- Notify entity detection from Home Assistant states.

### Changed
- Full English localization: UI labels, backend errors, comments, docs, changelogs.
- Start button icon changed from Windows to ZHA/Zigbee.
- Entity selection migrated from `<select>` to autocomplete inputs.
- Backend: battery device collection, battery alerts CRUD, notify entity collection.

## [0.6.1] - 2026-02-23

### Fixed
- Cache-busting CSS/JS + no-cache middleware.
- Ulepszone pozycje okien.

## [0.6.0] - 2026-02-23

### Changed
- Prawdziwy desktop Win11: ikony na pulpicie otwierające pływające okna.
- Window Manager (WM): drag, close, minimize, maximize, focus, z-stacking.
- Taskbar z dynamicznym stanem open/focused.
- Desktop bloom gradient wallpaper.

### Fixed
- Crash setStatus null textContent.
- Canvas sync na ukrytych oknach.

## [0.5.0] - 2026-02-23

### Changed
- Pełna przebudowa frontendu na Windows 11 Fluent Design.
- Taskbar, window chrome, Mica/Acrylic material, telemetry legend.
- Skrypt deploy.ps1 z interaktywnym menu stłrzalkowym.
- Plik .github/copilot-instructions.md dla agenta.

### Fixed
- Auto-refresh, canvas DPR, grid overlap, switch button nesting.

## [0.4.2] - 2026-02-23

### Fixed
- Naprawa layoutu desktop UI: okna Mirror i Sensor nie nakładają się.
- Poprawne skalowanie canvasów delay/telemetry (dynamiczne dopasowanie do rozmiaru CSS).
- Usunięcie duplikacji przycisków ON/OFF/Toggle w liście switchy.
- `window-body` poprawnie rozciąga zawartość w pionie.

## [0.4.1] - 2026-02-23

### Added
- Okno Telemetria (spike chart + live log eventów ZHA).

### Fixed
- Stabilizacja frontendu add-ona i usunięcie błędu `innerHTML` na null.

## [0.4.0] - 2026-02-23

### Added
- Desktop-style UI dla add-ona z pełnym wykorzystaniem przestrzeni.
- Wyszukiwanie encji ZHA/switchy, rozbudowane widgety KPI i wykresy.
- Okno mirror switches oraz reguły sterowania switchami na podstawie zakresów sensorów.

### Changed
- Backend add-ona rozszerzony o API i egzekucję reguł sensor-range.

## [0.3.2] - 2026-02-23

### Fixed
- Poprawiono integrację UI add-ona z HA Ingress (ścieżki względne dla API/static).
- Dodano diagnostykę runtime w UI oraz poprawiono dostęp add-ona do HA API.

## [0.3.1] - 2026-02-23

### Fixed
- Hotfix budowania add-ona `zha_diagnostic_tool` na Alpine/HA Supervisor.
- Eliminacja błędu PEP 668 (`externally-managed-environment`) przez rezygnację z `pip` w Dockerfile.

## [0.3.0] - 2026-02-23

### Added
- Add-on `zha_diagnostic_tool` otrzymał własny UI przez HA Ingress (VSCode-style).
- Grafana-style wykresy opóźnień przełączeń switch -> ack.
- Widok wszystkich wykrytych encji Zigbee.
- Reguły mirror switch (one-way i bidirectional) konfigurowane z UI.

### Changed
- Runtime add-ona przebudowany na backend Python + API eventowe.

## [0.2.1] - 2026-02-23

### Added
- Rozszerzona dokumentacja użytkowa i deweloperska w katalogu `docs/`.
- Opis procesu wydawniczego i publikacji repo do Home Assistant Add-on Store.

### Changed
- Integracja `zigbee_diagnostic` podbita do wersji `0.2.1` (iteracja dokumentacyjna/release).
- README rozszerzony o mapę dokumentacji i doprecyzowanie zasad iteracji.

## [0.2.0] - 2026-02-23

### Added
- Struktura repo pod publikację jako Home Assistant Add-on Repository.
- Dokumentacja publikacji repo i procesu iteracyjnego.
- Podstawy add-on companion (katalog `addons/zha_diagnostic_tool`).

### Changed
- Integracja `zigbee_diagnostic` podbita do wersji `0.2.0`.
- Linki `documentation` i `issue_tracker` wskazują na docelowe repo GitHub.

## [0.1.0] - 2026-02-23

### Added
- MVP custom integration `zigbee_diagnostic`.
- Diagnostyka Zigbee oparta o stan encji i logi systemowe.
- Encje diagnostyczne (`sensor`, `binary_sensor`) i powiadomienia.
- Config flow i opcje progów monitoringu.
