#!/usr/bin/with-contenv bashio
set -euo pipefail

readonly LOG_FILE="/config/home-assistant.log"

bashio::log.info "Start ZHA Diagnostic Companion"

while true; do
  interval="$(bashio::config 'run_interval_minutes')"
  tail_lines="$(bashio::config 'log_tail_lines')"

  if [[ -z "${interval}" || "${interval}" == "null" ]]; then
    interval=15
  fi

  if [[ -z "${tail_lines}" || "${tail_lines}" == "null" ]]; then
    tail_lines=5000
  fi

  if [[ ! -f "${LOG_FILE}" ]]; then
    bashio::log.warning "Brak pliku ${LOG_FILE}. Czekam na kolejną iterację..."
    sleep "$((interval * 60))"
    continue
  fi

  zigbee_matches="$(tail -n "${tail_lines}" "${LOG_FILE}" | grep -Ei 'zigbee|zha|bellows|ezsp|deconz|zigbee2mqtt' || true)"

  if [[ -z "${zigbee_matches}" ]]; then
    bashio::log.info "Iteracja OK: brak wpisów Zigbee w ostatnich ${tail_lines} liniach logu."
    sleep "$((interval * 60))"
    continue
  fi

  error_count="$(printf '%s\n' "${zigbee_matches}" | grep -Eic 'error|warning|critical' || true)"

  if [[ "${error_count}" -gt 0 ]]; then
    bashio::log.warning "Iteracja ALERT: wykryto ${error_count} potencjalnych problemów Zigbee (tail=${tail_lines})."
  else
    bashio::log.info "Iteracja OK: znaleziono logi Zigbee bez error/warning/critical."
  fi

  sleep "$((interval * 60))"
done
