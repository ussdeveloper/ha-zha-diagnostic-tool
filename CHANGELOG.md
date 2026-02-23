# Changelog

Wszystkie istotne zmiany w projekcie są dokumentowane w tym pliku.

Format inspirowany Keep a Changelog, wersjonowanie zgodne z SemVer.

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
