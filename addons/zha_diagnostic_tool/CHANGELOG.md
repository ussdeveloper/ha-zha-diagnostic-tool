# Changelog - ZHA Diagnostic Companion

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
