#!/usr/bin/with-contenv bashio
set -euo pipefail

export PYTHONUNBUFFERED=1

bashio::log.info "Start ZHA Diagnostic Companion UI/API"

exec python3 /app/app.py
