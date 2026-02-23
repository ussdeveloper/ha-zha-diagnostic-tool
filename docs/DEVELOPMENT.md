# Development Guide

## Struktura repo

- `custom_components/zigbee_diagnostic/` — główna integracja HA
- `addons/zha_diagnostic_tool/` — add-on companion
- `repository.yaml` — metadata repo dodatków
- `CHANGELOG.md` — historia zmian projektu

## Zasady zmian

- Najpierw implementacja w małych iteracjach.
- Po każdej iteracji: aktualizacja wersji + changelog.
- Brak zmian bez opisu wpływu na użytkownika.

## Konwencja wersji

- Integracja: `0.2.x`
- Add-on companion: `0.1.x`
- `PATCH` dla dokumentacji/fixów
- `MINOR` dla nowych funkcji
- `MAJOR` dla breaking changes

## QA przed wydaniem

1. Walidacja błędów w edytorze (Python/YAML).
2. Test uruchomienia integracji w HA.
3. Test instalacji add-on z własnego repo.
4. Weryfikacja CHANGELOG i zgodności wersji.
