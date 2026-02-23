# HA ZHA Diagnostic Tool

Repozytorium zawiera:

1. **custom integration** `zigbee_diagnostic` do Home Assistanta,
2. **Home Assistant Add-on Repository** (możliwe do dodania w Supervisor/Add-on Store).

Główny URL repo: `https://github.com/ussdeveloper/ha-zha-diagnostic-tool`

## Dokumentacja

- `docs/INSTALL.md` — szybka instalacja i uruchomienie
- `docs/ADDON_REPOSITORY.md` — dodanie repo do Add-on Store
- `docs/DEVELOPMENT.md` — rozwój, testy i struktura repo
- `docs/RELEASE.md` — proces wersjonowania i wydania

## Co monitoruje

Integracja cyklicznie analizuje urządzenia Zigbee (ZHA/deCONZ/MQTT) i wykrywa:

- urządzenia offline (wszystkie encje niedostępne przez dłuższy czas),
- niski poziom LQI,
- brak świeżych aktualizacji (stale devices),
- błędy/ostrzeżenia Zigbee w logach (`system_log_event`).

## Co tworzy w HA

- `sensor` z liczbą problemów,
- `sensor` z najniższym LQI,
- `sensor` z liczbą monitorowanych urządzeń,
- `sensor` z liczbą błędów Zigbee w logach,
- `binary_sensor` informujący, czy są aktywne problemy.

Dodatkowo sensor z liczbą problemów publikuje szczegóły problemów w atrybutach.

## Instalacja integracji (custom_components)

1. Skopiuj folder `custom_components/zigbee_diagnostic` do katalogu konfiguracji Home Assistanta.
2. Zrestartuj Home Assistanta.
3. Wejdź w **Ustawienia → Urządzenia i usługi → Dodaj integrację**.
4. Wyszukaj **Zigbee Network Diagnostic**.

## Dodanie repo jako Home Assistant Add-on Repository

1. W Home Assistant przejdź do **Ustawienia → Dodatki → Sklep dodatków**.
2. Kliknij menu (3 kropki) i wybierz **Repozytoria**.
3. Dodaj URL: `https://github.com/ussdeveloper/ha-zha-diagnostic-tool`
4. Odśwież sklep dodatków — pojawi się add-on z tego repo.

> Uwaga: add-on jest komponentem towarzyszącym (companion), a główna diagnostyka encji Zigbee działa w custom integration.

## Konfiguracja

W formularzu konfiguracji ustawiasz:

- interwał skanowania,
- próg niskiego LQI,
- czas uznania urządzenia za nieaktywne,
- okno analizy błędów logów,
- opcjonalną usługę notify (np. `notify.mobile_app_pixel`),
- czy tworzyć `persistent_notification`.

## Powiadomienia

Integracja wysyła powiadomienia tylko o **nowych** problemach (anty-spam).

- `persistent_notification` (opcjonalnie),
- usługa `notify.<nazwa>` (opcjonalnie).

## Ograniczenia MVP

- Heurystyka wykrywania urządzeń Zigbee opiera się o platformy encji (`zha`, `deconz`, `mqtt`).
- Jakość diagnozy zależy od dostępności atrybutów typu `linkquality`, `lqi`, `last_seen`.
- Brak jeszcze analizy topologii tras (routing map / parent-child graph).

## Następne kroki

- dodać analizę topologii mesh i jakości routingu,
- dodać automatyczne rekomendacje naprawcze per typ problemu,
- dodać `repairs` oraz `diagnostics` endpoint dla wsparcia.

## Wersjonowanie i iteracje

- Stosujemy semver: `MAJOR.MINOR.PATCH`.
- Iteracje dokumentacyjne i poprawki podbijają `PATCH`.
- Iteracje funkcjonalne podbijają `MINOR`.
- Historia zmian jest prowadzona w `CHANGELOG.md`.
