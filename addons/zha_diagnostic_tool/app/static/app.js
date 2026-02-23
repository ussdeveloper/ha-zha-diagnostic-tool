const state = {
  dashboard: null,
  zhaItems: [],
  switchItems: [],
  sensorItems: [],
  telemetrySpikes: [],
  telemetryEvents: [],
};

const $ = (id) => document.getElementById(id);
const safeEl = (id) => $(id);

function syncCanvasSize(canvas) {
  const w = canvas.offsetWidth;
  const h = canvas.offsetHeight;
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
  }
}

function setText(id, value) {
  const el = safeEl(id);
  if (!el) return;
  el.textContent = value;
}

function setHTML(id, value) {
  const el = safeEl(id);
  if (!el) return;
  el.innerHTML = value;
}

const mdi = {
  zigbee: "mdi-zigbee",
  switch: "mdi-toggle-switch",
  sensor: "mdi-gauge",
  link: "mdi-link-variant",
  chart: "mdi-chart-line",
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

function setStatus(text, cls = "") {
  const node = safeEl("status-bar");
  if (!node) return;
  node.textContent = text;
  node.className = `status-bar ${cls}`.trim();
}

function setSummary(summary) {
  setText("kpi-entities", summary.zigbee_entities ?? "-");
  setText("kpi-switches", summary.switches_total ?? summary.zigbee_switches ?? "-");
  setText("kpi-rules", summary.mirror_rules ?? "-");
  setText("kpi-srules", summary.sensor_rules ?? "-");
  setText("kpi-avg", summary.delay_avg_ms == null ? "-" : `${summary.delay_avg_ms} ms`);
  setText("kpi-p95", summary.delay_p95_ms == null ? "-" : `${summary.delay_p95_ms} ms`);
  setText("kpi-max", summary.delay_max_ms == null ? "-" : `${summary.delay_max_ms} ms`);
  setText("kpi-pending", summary.pending_commands ?? "-");
}

function renderDelayChart(samples) {
  const canvas = $("delay-chart");
  if (!canvas) return;
  syncCanvasSize(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const grd = ctx.createLinearGradient(0, 0, 0, height);
  grd.addColorStop(0, "#161b26");
  grd.addColorStop(1, "#0e1118");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  if (!samples.length) {
    ctx.fillStyle = "#9aa4b2";
    ctx.font = "14px Segoe UI";
    ctx.fillText("Brak próbek delay", 14, 24);
    return;
  }

  const values = samples.map((s) => Number(s.delay_ms) || 0);
  const max = Math.max(50, ...values);

  const padX = 36;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  ctx.strokeStyle = "#233046";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padY + (innerH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(width - padX, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "#4ea1ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = padX + (i / Math.max(values.length - 1, 1)) * innerW;
    const y = height - padY - (v / max) * innerH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#e5e9f0";
  ctx.font = "12px Segoe UI";
  ctx.fillText(`max ${max.toFixed(0)} ms`, width - 120, 16);
}

function renderTelemetryChart(spikes) {
  const canvas = safeEl("telemetry-chart");
  if (!canvas) return;
  syncCanvasSize(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#0f131c";
  ctx.fillRect(0, 0, width, height);

  const data = (spikes || []).slice(-120);
  if (!data.length) {
    ctx.fillStyle = "#9aa4b2";
    ctx.font = "13px Segoe UI";
    ctx.fillText("Brak eventów telemetrycznych", 14, 24);
    return;
  }

  const series = {
    zha: { color: "#4ea1ff", values: data.map((d) => d.zha || 0) },
    state: { color: "#33d17a", values: data.map((d) => d.state || 0) },
    call: { color: "#f6d365", values: data.map((d) => d.call || 0) },
    log_error: { color: "#ff6b6b", values: data.map((d) => d.log_error || 0) },
  };

  const all = Object.values(series).flatMap((s) => s.values);
  const max = Math.max(1, ...all);
  const padX = 30;
  const padY = 16;
  const innerW = width - 2 * padX;
  const innerH = height - 2 * padY;

  ctx.strokeStyle = "#223046";
  for (let i = 0; i <= 4; i++) {
    const y = padY + (innerH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padX, y);
    ctx.lineTo(width - padX, y);
    ctx.stroke();
  }

  Object.values(series).forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = padX + (i / Math.max(s.values.length - 1, 1)) * innerW;
      const y = height - padY - (v / max) * innerH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function renderTelemetryLog(events) {
  const host = safeEl("telemetry-log");
  if (!host) return;
  host.innerHTML = "";

  const rows = (events || []).slice(-200).reverse();
  for (const ev of rows) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `
      <div>
        <div class="entity-title"><i class="mdi mdi-flash"></i>${ev.type || "event"}</div>
        <div class="entity-sub">${ev.summary || "-"}</div>
      </div>
      <div class="entity-sub">${ev.ts || "-"}</div>
    `;
    host.appendChild(row);
  }
}

function rowRightActions(entityId, stateText, allowToggle = false) {
  const host = document.createElement("div");
  host.className = "right-actions";

  const badge = document.createElement("span");
  badge.className = `badge ${stateText === "on" ? "on" : stateText === "off" ? "off" : "mid"}`;
  badge.textContent = stateText ?? "-";
  host.appendChild(badge);

  if (allowToggle) {
    const btn = document.createElement("button");
    btn.innerHTML = '<i class="mdi mdi-toggle-switch"></i>';
    btn.title = "Toggle";
    btn.onclick = () => switchAction(entityId, "toggle");
    host.appendChild(btn);
  }

  return host;
}

function renderZhaList() {
  const searchEl = safeEl("zha-search");
  const host = safeEl("zha-list");
  if (!host) return;
  const query = ((searchEl && searchEl.value) || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.zhaItems.filter((item) => {
    if (!query) return true;
    const blob = `${item.entity_id} ${item.friendly_name || ""} ${item.state || ""}`.toLowerCase();
    return blob.includes(query);
  });

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="entity-title"><i class="mdi ${item.icon?.startsWith("mdi:") ? item.icon.replace(":", "-") : mdi.zigbee}"></i>${item.friendly_name || item.entity_id}</div>
      <div class="entity-sub">${item.entity_id} · LQI: ${item.lqi ?? "-"} · ${item.last_updated ?? "-"}</div>
    `;

    row.appendChild(left);
    row.appendChild(rowRightActions(item.entity_id, item.state, item.entity_id.startsWith("switch.")));
    host.appendChild(row);
  }
}

function renderSwitchList() {
  const searchEl = safeEl("switch-search");
  const host = safeEl("switch-list");
  if (!host) return;
  const query = ((searchEl && searchEl.value) || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.switchItems.filter((item) => {
    if (!query) return true;
    const blob = `${item.entity_id} ${item.friendly_name || ""} ${item.state || ""}`.toLowerCase();
    return blob.includes(query);
  });

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="entity-title"><i class="mdi ${mdi.switch}"></i>${item.friendly_name || item.entity_id}</div>
      <div class="entity-sub">${item.entity_id}</div>
    `;

    const right = document.createElement("div");
    right.className = "right-actions";

    const badge = document.createElement("span");
    badge.className = `badge ${item.state === "on" ? "on" : item.state === "off" ? "off" : "mid"}`;
    badge.textContent = item.state ?? "-";

    const onBtn = document.createElement("button");
    onBtn.textContent = "ON";
    onBtn.onclick = () => switchAction(item.entity_id, "turn_on");

    const offBtn = document.createElement("button");
    offBtn.textContent = "OFF";
    offBtn.onclick = () => switchAction(item.entity_id, "turn_off");

    const toggleBtn = document.createElement("button");
    toggleBtn.innerHTML = '<i class="mdi mdi-toggle-switch"></i>';
    toggleBtn.title = "Toggle";
    toggleBtn.onclick = () => switchAction(item.entity_id, "toggle");

    right.appendChild(badge);
    right.appendChild(onBtn);
    right.appendChild(offBtn);
    right.appendChild(toggleBtn);

    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);
  }

  const switchOptions = ['<option value="">-- switch --</option>'];
  for (const item of state.switchItems) {
    switchOptions.push(`<option value="${item.entity_id}">${item.entity_id}</option>`);
  }
  setHTML("mirror-source", switchOptions.join(""));
  setHTML("mirror-target", switchOptions.join(""));
  setHTML("sensor-switch", switchOptions.join(""));
}

function renderMirrorRules(rules) {
  const host = safeEl("rules-list");
  if (!host) return;
  host.innerHTML = "";

  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="entity-title"><i class="mdi ${mdi.link}"></i>${rule.source} ↔ ${rule.target}</div>
      <div class="entity-sub">${rule.bidirectional ? "Bidirectional" : "One-way"}</div>
    `;

    const del = document.createElement("button");
    del.textContent = "Usuń";
    del.onclick = async () => {
      await api(`api/mirror-rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      await load();
    };

    row.appendChild(left);
    row.appendChild(del);
    host.appendChild(row);
  }
}

function renderSensorRules(rules) {
  const host = safeEl("sensor-rules-list");
  if (!host) return;
  host.innerHTML = "";

  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="entity-title"><i class="mdi ${mdi.sensor}"></i>${rule.sensor_entity} → ${rule.switch_entity}</div>
      <div class="entity-sub">zakres: [${rule.min_value ?? "-∞"}, ${rule.max_value ?? "+∞"}] · in:${rule.action_in_range} · out:${rule.action_out_of_range}</div>
    `;

    const del = document.createElement("button");
    del.textContent = "Usuń";
    del.onclick = async () => {
      await api(`api/sensor-rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      await load();
    };

    row.appendChild(left);
    row.appendChild(del);
    host.appendChild(row);
  }
}

function renderSensorOptions() {
  const options = ['<option value="">-- sensor --</option>'];
  for (const item of state.sensorItems) {
    options.push(`<option value="${item.entity_id}">${item.entity_id}</option>`);
  }
  setHTML("sensor-entity", options.join(""));
}

async function switchAction(entityId, action) {
  await api("api/switch-action", {
    method: "POST",
    body: JSON.stringify({ entity_id: entityId, action }),
  });
}

async function addMirrorRule() {
  const source = (safeEl("mirror-source") || {}).value;
  const target = (safeEl("mirror-target") || {}).value;
  const bidirectional = Boolean((safeEl("mirror-bidirectional") || {}).checked);

  if (!source || !target || source === target) {
    alert("Wybierz dwa różne switche");
    return;
  }

  await api("api/mirror-rules", {
    method: "POST",
    body: JSON.stringify({ source, target, bidirectional }),
  });

  await load();
}

async function addSensorRule() {
  const sensor_entity = (safeEl("sensor-entity") || {}).value;
  const switch_entity = (safeEl("sensor-switch") || {}).value;
  const minRaw = (safeEl("sensor-min") || {}).value ?? "";
  const maxRaw = (safeEl("sensor-max") || {}).value ?? "";
  const action_in_range = (safeEl("sensor-in-action") || {}).value;
  const action_out_of_range = (safeEl("sensor-out-action") || {}).value;

  if (!sensor_entity || !switch_entity) {
    alert("Wybierz sensor i switch");
    return;
  }

  const body = {
    sensor_entity,
    switch_entity,
    action_in_range,
    action_out_of_range,
    enabled: true,
  };

  if (minRaw !== "") body.min_value = Number(minRaw);
  if (maxRaw !== "") body.max_value = Number(maxRaw);

  await api("api/sensor-rules", {
    method: "POST",
    body: JSON.stringify(body),
  });

  await load();
}

async function load() {
  const dashboard = await api("api/dashboard");

  state.dashboard = dashboard;
  state.zhaItems = dashboard.zigbee_devices || [];
  state.switchItems = dashboard.switches || [];
  state.sensorItems = dashboard.sensors || [];
  state.telemetrySpikes = dashboard.telemetry?.spikes || [];
  state.telemetryEvents = dashboard.telemetry?.events || [];

  setSummary(dashboard.summary || {});
  renderDelayChart(dashboard.delay_samples || []);
  renderZhaList();
  renderSwitchList();
  renderMirrorRules(dashboard.mirror_rules || []);
  renderSensorOptions();
  renderSensorRules(dashboard.sensor_rules || []);
  renderTelemetryChart(state.telemetrySpikes);
  renderTelemetryLog(state.telemetryEvents);

  if (dashboard.runtime?.last_error) {
    setStatus(`Błąd backendu: ${dashboard.runtime.last_error}`, "err");
  } else {
    setStatus(
      `API OK • token: ${dashboard.runtime?.token_present ? "OK" : "BRAK"} • zigbee: ${dashboard.summary?.zigbee_entities ?? 0}`,
      "ok"
    );
  }

  setText("updated-at", new Date().toLocaleTimeString());
}

document.addEventListener("DOMContentLoaded", async () => {
  const refreshBtn = safeEl("refresh-btn");
  if (refreshBtn) refreshBtn.addEventListener("click", async () => {
    try {
      await api("api/refresh", { method: "POST" });
      await load();
    } catch (error) {
      setStatus(`Refresh failed: ${error.message}`, "err");
    }
  });

  const zhaSearch = safeEl("zha-search");
  const switchSearch = safeEl("switch-search");
  if (zhaSearch) zhaSearch.addEventListener("input", renderZhaList);
  if (switchSearch) switchSearch.addEventListener("input", renderSwitchList);

  const addRuleBtn = safeEl("add-rule-btn");
  if (addRuleBtn) addRuleBtn.addEventListener("click", async () => {
    try {
      await addMirrorRule();
    } catch (error) {
      setStatus(`Mirror create failed: ${error.message}`, "err");
    }
  });

  const addSensorRuleBtn = safeEl("add-sensor-rule-btn");
  if (addSensorRuleBtn) addSensorRuleBtn.addEventListener("click", async () => {
    try {
      await addSensorRule();
    } catch (error) {
      setStatus(`Sensor rule create failed: ${error.message}`, "err");
    }
  });

  try {
    await load();
  } catch (error) {
    setStatus(`Load failed: ${error.message}`, "err");
  }

  setInterval(async () => {
    try {
      await load();
    } catch (error) {
      setStatus(`Auto-refresh failed: ${error.message}`, "err");
    }
  }, 5000);
});
