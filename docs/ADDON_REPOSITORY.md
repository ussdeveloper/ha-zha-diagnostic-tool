# Dodanie repo do Home Assistant Add-on Store

## URL repo

`https://github.com/ussdeveloper/ha-zha-diagnostic-tool`

## Kroki w Home Assistant

1. **Ustawienia → Dodatki → Sklep dodatków**.
2. Menu (3 kropki) → **Repozytoria**.
3. Wklej URL repo i zapisz.
4. Odśwież sklep dodatków.
5. Wyszukaj i zainstaluj **ZHA Diagnostic Companion**.

## Jak to działa

- Home Assistant rozpoznaje repo po pliku `repository.yaml`.
- Katalog `addons/zha_diagnostic_tool` dostarcza metadata i obraz add-ona.

## Rozwiązywanie problemów

- Jeśli add-on nie pojawia się na liście: sprawdź, czy repo jest publiczne.
- Jeśli instalacja się nie buduje: sprawdź logi add-on buildera w HA.
- Jeśli brak logu `home-assistant.log`: upewnij się, że add-on ma mapowanie `config:rw`.
