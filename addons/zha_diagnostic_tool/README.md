# ZHA Diagnostic Companion (Add-on)

Add-on z własnym web UI (Ingress), który monitoruje Zigbee i pokazuje metryki opóźnień przełączeń switchy.

## Najważniejsze funkcje

- własny interfejs UI (stylistyka VSCode dark),
- wykresy opóźnień switch -> ack (Grafana-style time series),
- lista wszystkich wykrytych encji Zigbee,
- monitorowanie opóźnienia między `switch.turn_on/off/toggle` a potwierdzonym `state_changed`,
- reguły mirror: możliwość spięcia 2 switchy (one-way lub bidirectional).

## Jak działa pomiar delay

Add-on subskrybuje eventy Home Assistant (`call_service` i `state_changed`) i buduje próbki delay dla switchy.

- `AVG` = średni delay,
- `p95` = 95 percentyl,
- `MAX` = maksymalny delay.

## Mirror switch

W UI dodajesz regułę `source -> target`.

- zmiana stanu `source` ustawia taki sam stan na `target`,
- opcja `bidirectional` działa w obie strony,
- cooldown zabezpiecza przed pętlami odbić.

## Opcje add-ona

- `poll_interval_seconds` (1-30)
- `max_delay_samples` (50-5000)
- `mirror_cooldown_ms` (100-10000)
- `grafana_theme` (`vscode-dark` lub `grafana-dark`)

## Ważne

To nadal add-on **companion**. Integracja `custom_components/zigbee_diagnostic` pozostaje głównym źródłem diagnoz LQI/offline/stale.
