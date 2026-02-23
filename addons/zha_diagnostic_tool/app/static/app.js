/* ===== ZHA Diagnostic Desktop — app.js ===== */
"use strict";

const state = {
  dashboard: null,
  zhaItems: [],
  switchItems: [],
  sensorItems: [],
  telemetrySpikes: [],
  telemetryEvents: [],
  refreshTimer: null,
  loading: false,
};

/* ---------- DOM helpers (null-safe) ---------- */
const $ = (id) => document.getElementById(id);

function setText(id, val)  { const e = $(id); if (e) e.textContent = val; }
function setHTML(id, val)  { const e = $(id); if (e) e.innerHTML = val; }

function syncCanvas(canvas) {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(r.width * dpr);
  const h = Math.round(r.height * dpr);
  if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
    canvas.width = w;
    canvas.height = h;
  }
}

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

/* ---------- Taskbar status ---------- */
function setStatus(text, isError) {
  setText("taskbar-status-text", text);
  const dot = $("taskbar-dot");
  if (dot) dot.className = isError ? "dot err" : "dot";
}

/* ---------- Taskbar clock ---------- */
function tickClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const d = now.toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
  setHTML("taskbar-clock", `${h}:${m}<br>${d}`);
}

/* ---------- KPI ---------- */
function setSummary(s) {
  setText("kpi-entities", s.zigbee_entities ?? "-");
  setText("kpi-switches", s.switches_total ?? s.zigbee_switches ?? "-");
  setText("kpi-rules",    s.mirror_rules ?? "-");
  setText("kpi-srules",   s.sensor_rules ?? "-");
  setText("kpi-avg",      s.delay_avg_ms == null ? "-" : `${s.delay_avg_ms} ms`);
  setText("kpi-p95",      s.delay_p95_ms == null ? "-" : `${s.delay_p95_ms} ms`);
  setText("kpi-max",      s.delay_max_ms == null ? "-" : `${s.delay_max_ms} ms`);
  setText("kpi-pending",  s.pending_commands ?? "-");
}

/* ---------- Delay chart ---------- */
function renderDelayChart(samples) {
  const canvas = $("delay-chart");
  if (!canvas) return;
  syncCanvas(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, w, h);

  if (!samples.length) {
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${13 * dpr}px Segoe UI`;
    ctx.fillText("Brak próbek delay", 14 * dpr, 22 * dpr);
    return;
  }

  const values = samples.map((s) => Number(s.delay_ms) || 0);
  const max = Math.max(50, ...values);
  const pad = { x: 36 * dpr, y: 18 * dpr };
  const iw = w - pad.x * 2, ih = h - pad.y * 2;

  // Grid
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.y + (ih * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.x, y); ctx.lineTo(w - pad.x, y); ctx.stroke();
  }

  // Area fill
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.x + (i / Math.max(values.length - 1, 1)) * iw;
    const y = h - pad.y - (v / max) * ih;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(w - pad.x, h - pad.y);
  ctx.lineTo(pad.x, h - pad.y);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.y, 0, h - pad.y);
  grad.addColorStop(0, "rgba(96,205,255,0.18)");
  grad.addColorStop(1, "rgba(96,205,255,0.01)");
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.strokeStyle = "#60cdff";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.x + (i / Math.max(values.length - 1, 1)) * iw;
    const y = h - pad.y - (v / max) * ih;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Label
  ctx.fillStyle = "#ffffffde";
  ctx.font = `${11 * dpr}px Segoe UI`;
  ctx.fillText(`max ${max.toFixed(0)} ms`, w - 110 * dpr, 14 * dpr);
}

/* ---------- Telemetry chart ---------- */
function renderTelemetryChart(spikes) {
  const canvas = $("telemetry-chart");
  if (!canvas) return;
  syncCanvas(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, w, h);

  const data = (spikes || []).slice(-120);
  if (!data.length) {
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${12 * dpr}px Segoe UI`;
    ctx.fillText("Brak eventów telemetrycznych", 14 * dpr, 22 * dpr);
    return;
  }

  const series = [
    { key: "zha",       color: "#60cdff" },
    { key: "state",     color: "#6ccb5f" },
    { key: "call",      color: "#fce100" },
    { key: "log_error", color: "#ff6b6b" },
  ];

  const all = series.flatMap((s) => data.map((d) => d[s.key] || 0));
  const max = Math.max(1, ...all);
  const pad = { x: 28 * dpr, y: 14 * dpr };
  const iw = w - 2 * pad.x, ih = h - 2 * pad.y;

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.y + (ih * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.x, y); ctx.lineTo(w - pad.x, y); ctx.stroke();
  }

  for (const s of series) {
    const vals = data.map((d) => d[s.key] || 0);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = pad.x + (i / Math.max(vals.length - 1, 1)) * iw;
      const y = h - pad.y - (v / max) * ih;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

/* ---------- Telemetry log ---------- */
function renderTelemetryLog(events) {
  const host = $("telemetry-log");
  if (!host) return;
  host.innerHTML = "";
  const rows = (events || []).slice(-200).reverse();
  for (const ev of rows) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div>
        <div class="entity-title"><i class="mdi mdi-flash"></i>${ev.type || "event"}</div>
        <div class="entity-sub">${ev.summary || "-"}</div>
      </div><div class="entity-sub">${ev.ts || "-"}</div>`;
    host.appendChild(row);
  }
}

/* ---------- ZHA list ---------- */
function renderZhaList() {
  const host = $("zha-list");
  if (!host) return;
  const q = ($("zha-search")?.value || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.zhaItems.filter((it) => {
    if (!q) return true;
    return `${it.entity_id} ${it.friendly_name || ""} ${it.state || ""}`.toLowerCase().includes(q);
  });

  for (const it of items) {
    const icon = it.icon?.startsWith("mdi:") ? it.icon.replace(":", "-") : "mdi-zigbee";
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.innerHTML = `<div class="entity-title"><i class="mdi ${icon}"></i>${it.friendly_name || it.entity_id}</div>
      <div class="entity-sub">${it.entity_id} · LQI: ${it.lqi ?? "-"} · ${it.last_updated ?? "-"}</div>`;
    row.appendChild(left);
    row.appendChild(makeBadge(it.state));
    host.appendChild(row);
  }
}

/* ---------- Switch list ---------- */
function renderSwitchList() {
  const host = $("switch-list");
  if (!host) return;
  const q = ($("switch-search")?.value || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.switchItems.filter((it) => {
    if (!q) return true;
    return `${it.entity_id} ${it.friendly_name || ""} ${it.state || ""}`.toLowerCase().includes(q);
  });

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.innerHTML = `<div class="entity-title"><i class="mdi mdi-toggle-switch"></i>${it.friendly_name || it.entity_id}</div>
      <div class="entity-sub">${it.entity_id}</div>`;
    const right = document.createElement("div");
    right.className = "right-actions";
    right.appendChild(makeBadge(it.state));
    right.appendChild(makeBtn("ON",  () => switchAction(it.entity_id, "turn_on")));
    right.appendChild(makeBtn("OFF", () => switchAction(it.entity_id, "turn_off")));
    right.appendChild(makeBtn('<i class="mdi mdi-toggle-switch"></i>', () => switchAction(it.entity_id, "toggle"), "Toggle"));
    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);
  }

  // Populate dropdowns
  const options = ['<option value="">-- switch --</option>',
    ...state.switchItems.map((s) => `<option value="${s.entity_id}">${s.entity_id}</option>`)
  ].join("");
  setHTML("mirror-source", options);
  setHTML("mirror-target", options);
  setHTML("sensor-switch", options);
}

/* ---------- Mirror rules ---------- */
function renderMirrorRules(rules) {
  const host = $("rules-list");
  if (!host) return;
  host.innerHTML = "";
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.innerHTML = `<div class="entity-title"><i class="mdi mdi-link-variant"></i>${rule.source} ↔ ${rule.target}</div>
      <div class="entity-sub">${rule.bidirectional ? "Bidirectional" : "One-way"}</div>`;
    const del = makeBtn("Usuń", async () => {
      await api(`api/mirror-rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      await load();
    });
    row.appendChild(left);
    row.appendChild(del);
    host.appendChild(row);
  }
}

/* ---------- Sensor rules ---------- */
function renderSensorRules(rules) {
  const host = $("sensor-rules-list");
  if (!host) return;
  host.innerHTML = "";
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    left.innerHTML = `<div class="entity-title"><i class="mdi mdi-gauge"></i>${rule.sensor_entity} → ${rule.switch_entity}</div>
      <div class="entity-sub">[${rule.min_value ?? "-∞"}, ${rule.max_value ?? "+∞"}] in:${rule.action_in_range} out:${rule.action_out_of_range}</div>`;
    const del = makeBtn("Usuń", async () => {
      await api(`api/sensor-rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      await load();
    });
    row.appendChild(left);
    row.appendChild(del);
    host.appendChild(row);
  }
}

function renderSensorOptions() {
  const opts = ['<option value="">-- sensor --</option>',
    ...state.sensorItems.map((s) => `<option value="${s.entity_id}">${s.entity_id}</option>`)
  ].join("");
  setHTML("sensor-entity", opts);
}

/* ---------- Helpers ---------- */
function makeBadge(stateText) {
  const b = document.createElement("span");
  b.className = `badge ${stateText === "on" ? "on" : stateText === "off" ? "off" : "mid"}`;
  b.textContent = stateText ?? "-";
  return b;
}

function makeBtn(label, onClick, title) {
  const b = document.createElement("button");
  b.innerHTML = label;
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

/* ---------- Actions ---------- */
async function switchAction(entityId, action) {
  await api("api/switch-action", {
    method: "POST",
    body: JSON.stringify({ entity_id: entityId, action }),
  });
}

async function addMirrorRule() {
  const source = $("mirror-source")?.value;
  const target = $("mirror-target")?.value;
  const bi = $("mirror-bidirectional")?.checked ?? true;
  if (!source || !target || source === target) { alert("Wybierz dwa różne switche"); return; }
  await api("api/mirror-rules", { method: "POST", body: JSON.stringify({ source, target, bidirectional: bi }) });
  await load();
}

async function addSensorRule() {
  const sensor_entity  = $("sensor-entity")?.value;
  const switch_entity  = $("sensor-switch")?.value;
  const minRaw         = $("sensor-min")?.value ?? "";
  const maxRaw         = $("sensor-max")?.value ?? "";
  const action_in_range      = $("sensor-in-action")?.value;
  const action_out_of_range  = $("sensor-out-action")?.value;
  if (!sensor_entity || !switch_entity) { alert("Wybierz sensor i switch"); return; }
  const body = { sensor_entity, switch_entity, action_in_range, action_out_of_range, enabled: true };
  if (minRaw !== "") body.min_value = Number(minRaw);
  if (maxRaw !== "") body.max_value = Number(maxRaw);
  await api("api/sensor-rules", { method: "POST", body: JSON.stringify(body) });
  await load();
}

/* ---------- Main data load ---------- */
async function load() {
  if (state.loading) return;
  state.loading = true;
  try {
    const d = await api("api/dashboard");

    state.dashboard       = d;
    state.zhaItems        = d.zigbee_devices || [];
    state.switchItems     = d.switches || [];
    state.sensorItems     = d.sensors || [];
    state.telemetrySpikes = d.telemetry?.spikes || [];
    state.telemetryEvents = d.telemetry?.events || [];

    setSummary(d.summary || {});
    renderDelayChart(d.delay_samples || []);
    renderZhaList();
    renderSwitchList();
    renderMirrorRules(d.mirror_rules || []);
    renderSensorOptions();
    renderSensorRules(d.sensor_rules || []);
    renderTelemetryChart(state.telemetrySpikes);
    renderTelemetryLog(state.telemetryEvents);

    if (d.runtime?.last_error) {
      setStatus(`Błąd: ${d.runtime.last_error}`, true);
    } else {
      setStatus(
        `OK · token: ${d.runtime?.token_present ? "✓" : "✗"} · zigbee: ${d.summary?.zigbee_entities ?? 0} · switches: ${d.summary?.switches_total ?? 0}`,
        false
      );
    }

    setText("updated-at", new Date().toLocaleTimeString("pl-PL"));
  } finally {
    state.loading = false;
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // Refresh button
  $("refresh-btn")?.addEventListener("click", async () => {
    try { await api("api/refresh", { method: "POST" }); await load(); }
    catch (e) { setStatus(`Refresh: ${e.message}`, true); }
  });

  // Search inputs
  $("zha-search")?.addEventListener("input", renderZhaList);
  $("switch-search")?.addEventListener("input", renderSwitchList);

  // Form buttons
  $("add-rule-btn")?.addEventListener("click", async () => {
    try { await addMirrorRule(); } catch (e) { setStatus(`Mirror: ${e.message}`, true); }
  });
  $("add-sensor-rule-btn")?.addEventListener("click", async () => {
    try { await addSensorRule(); } catch (e) { setStatus(`Sensor: ${e.message}`, true); }
  });

  // Clock
  tickClock();
  setInterval(tickClock, 15000);

  // Initial load
  load().catch((e) => setStatus(`Load: ${e.message}`, true));

  // Auto-refresh every 5s
  state.refreshTimer = setInterval(() => {
    load().catch((e) => setStatus(`Auto-refresh: ${e.message}`, true));
  }, 5000);
});