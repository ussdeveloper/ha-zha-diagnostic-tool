# Changelog

All notable changes to this project are documented in this file.

Format inspired by Keep a Changelog, versioning follows SemVer.

## [0.9.0] - 2026-02-23

### Added
- Device Helper Explorer window: ZHA device configuration tool with cluster browsing, attribute read/write, ZCL help descriptions, identify command, and keep-alive periodic pings.
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
