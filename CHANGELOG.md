# Changelog

Wszystkie istotne zmiany w projekcie są dokumentowane w tym pliku.

Format inspirowany Keep a Changelog, wersjonowanie zgodne z SemVer.

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
