# Changelog - ZHA Diagnostic Companion

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
