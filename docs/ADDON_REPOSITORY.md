# Dodanie repo do Home Assistant Add-on Store

## URL repo

`https://github.com/ussdeveloper/ha-zha-diagnostic-tool`

## Kroki w Home Assistant

1. **Ustawienia → Dodatki → Sklep dodatków**.
2. Menu (3 kropki) → **Repozytoria**.
3. Wklej URL repo i zapisz.
4. Odśwież sklep dodatków.
5. Wyszukaj i zainstaluj **ZHA Diagnostic Companion**.
6. Po uruchomieniu otwórz panel add-ona (Ingress), aby użyć UI.

## Jak to działa

- Home Assistant rozpoznaje repo po pliku `repository.yaml`.
- Katalog `addons/zha_diagnostic_tool` dostarcza metadata i obraz add-ona.

## Rozwiązywanie problemów

- Jeśli add-on nie pojawia się na liście: sprawdź, czy repo jest publiczne.
- Jeśli instalacja się nie buduje: sprawdź logi add-on buildera w HA.
- Jeśli panel nie pokazuje danych: sprawdź logi add-ona i dostęp do API Supervisor.
- Jeśli delay nie liczy się poprawnie: upewnij się, że eventy `call_service` i `state_changed` są odbierane.
