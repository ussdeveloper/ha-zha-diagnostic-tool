# ZHA Diagnostic Companion (Add-on)

Companion add-on dla Home Assistanta, który cyklicznie analizuje `home-assistant.log` i raportuje potencjalne problemy Zigbee w logach dodatku.

## Co robi

- działa iteracyjnie co `run_interval_minutes`,
- analizuje ostatnie `log_tail_lines` linii z `home-assistant.log`,
- wyszukuje wpisy Zigbee (`zigbee`, `zha`, `bellows`, `ezsp`, `deconz`, `zigbee2mqtt`),
- sygnalizuje potencjalne błędy (`error`, `warning`, `critical`) w logu add-ona.

## Opcje

- `run_interval_minutes` (1-1440), domyślnie `15`
- `log_tail_lines` (100-50000), domyślnie `5000`

## Ważne

To add-on **companion**. Główna diagnostyka encji Zigbee (LQI/offline/stale/powiadomienia) jest realizowana przez custom integration `zigbee_diagnostic`.
