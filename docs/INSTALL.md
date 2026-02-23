# Instalacja (quick start)

## Wymagania

- Home Assistant (zalecane `2024.6+`)
- Dostęp do konfiguracji HA (`/config`)
- Sieć Zigbee działająca przez ZHA/deCONZ/Zigbee2MQTT

## 1) Instalacja custom integration

1. Skopiuj katalog `custom_components/zigbee_diagnostic` do `/config/custom_components/`.
2. Zrestartuj Home Assistanta.
3. Przejdź do **Ustawienia → Urządzenia i usługi → Dodaj integrację**.
4. Wybierz **Zigbee Network Diagnostic** i skonfiguruj progi.

## 2) (Opcjonalnie) Instalacja add-on companion

1. Dodaj repozytorium dodatków według `docs/ADDON_REPOSITORY.md`.
2. Zainstaluj add-on **ZHA Diagnostic Companion**.
3. Ustaw `run_interval_minutes` oraz `log_tail_lines`.
4. Uruchom add-on i obserwuj jego logi.

## Co sprawdzić po instalacji

- encja `binary_sensor` sygnalizuje problemy,
- sensory diagnostyczne raportują liczność i typy problemów,
- powiadomienia działają (jeśli skonfigurowano `notify.*`).
