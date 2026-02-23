# Release Process

## Cel

Utrzymanie powtarzalnych iteracji i czytelnych wydań projektu.

## Kroki release

1. Zaimplementuj zmianę.
2. Podbij wersję:
   - `custom_components/zigbee_diagnostic/manifest.json`
   - `addons/zha_diagnostic_tool/config.yaml` (jeśli add-on dotknięty)
3. Uzupełnij:
   - `CHANGELOG.md`
   - `addons/zha_diagnostic_tool/CHANGELOG.md` (jeśli dotyczy)
4. Zaktualizuj README/dokumentację.
5. Commit z czytelnym komunikatem.
6. Push do `main`.
7. (Opcjonalnie) Utwórz tag i release na GitHub.

## Sugerowany format commitów

- `docs: add release and install documentation`
- `feat: improve zigbee stale device detection`
- `fix: prevent duplicate diagnostic notifications`

## Sugerowany format tagów

- `v0.2.1` (repo główne)
- opis release z sekcjami Added / Changed / Fixed
