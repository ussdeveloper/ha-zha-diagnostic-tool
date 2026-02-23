/* ===== ZHA Diagnostic Desktop — app.js (v0.5.0) ===== */
"use strict";

/* ---------- State ---------- */
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

function setText(id, val) {
  const e = $(id);
  if (e) e.textContent = val;
}

function setHTML(id, val) {
  const e = $(id);
  if (e) e.innerHTML = val;
}

function syncCanvas(canvas) {
  if (!canvas || canvas.offsetParent === null) return;
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
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

/* ---------- Status bar ---------- */
function setStatus(text, isError) {
  const el = $("taskbar-status-text");
  if (el) el.textContent = text;
  const dot = $("taskbar-dot");
  if (dot) dot.className = isError ? "dot err" : "dot";
}

/* ---------- Clock ---------- */
function tickClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const d = now.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  setHTML("taskbar-clock", `${h}:${m}<br>${d}`);
}

/* ========================================================
   WINDOW MANAGER — open, close, focus, drag, maximize
   ======================================================== */
const WM = {
  zIndex: 100,
  focusedId: null,

  /* Default size & position for each window */
  defaults: {
    "kpi-win":       { w: 860, h: 350, x: 120, y: 20  },
    "zha-win":       { w: 560, h: 480, x: 160, y: 70  },
    "switch-win":    { w: 600, h: 440, x: 240, y: 50  },
    "telemetry-win": { w: 700, h: 500, x: 320, y: 30  },
    "mirror-win":    { w: 620, h: 360, x: 280, y: 120 },
    "sensor-win":    { w: 660, h: 380, x: 360, y: 100 },
  },

  init() {
    /* Set initial size/position from defaults */
    for (const [id, d] of Object.entries(this.defaults)) {
      const win = $(id);
      if (!win) continue;
      win.style.width  = d.w + "px";
      win.style.height = d.h + "px";
      win.style.left   = d.x + "px";
      win.style.top    = d.y + "px";
      this._makeDraggable(win);
    }

    /* Close buttons */
    document.querySelectorAll(".win-ctrl.close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const win = e.target.closest(".window");
        if (win) this.close(win.id);
      });
    });

    /* Minimize buttons (same as close — hide window) */
    document.querySelectorAll(".win-ctrl.minimize").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const win = e.target.closest(".window");
        if (win) this.close(win.id);
      });
    });

    /* Maximize buttons */
    document.querySelectorAll(".win-ctrl.maximize").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const win = e.target.closest(".window");
        if (win) this.toggleMax(win.id);
      });
    });

    /* Click on window body → focus */
    document.querySelectorAll(".window").forEach((win) => {
      win.addEventListener("mousedown", () => this.focus(win.id));
    });

    /* Desktop shortcut icons → open window */
    document.querySelectorAll(".desktop-shortcut").forEach((btn) => {
      btn.addEventListener("click", () => {
        const winId = btn.dataset.win;
        if (winId) this.open(winId);
      });
    });

    /* Taskbar app buttons → toggle window */
    document.querySelectorAll(".taskbar-app[data-win]").forEach((btn) => {
      const winId = btn.dataset.win;
      if (!winId) return;
      btn.addEventListener("click", () => {
        const win = $(winId);
        if (!win) return;
        if (win.classList.contains("open")) {
          if (this.focusedId === winId) {
            this.close(winId);
          } else {
            this.focus(winId);
          }
        } else {
          this.open(winId);
        }
      });
    });
  },

  open(id) {
    const win = $(id);
    if (!win) return;
    if (win.classList.contains("open")) {
      this.focus(id);
      return;
    }
    win.classList.add("open");
    this.focus(id);
    /* Sync canvases after the element becomes visible */
    requestAnimationFrame(() => {
      win.querySelectorAll("canvas").forEach(syncCanvas);
      this._rerenderCharts(id);
    });
    this._updateTaskbar();
  },

  close(id) {
    const win = $(id);
    if (!win) return;
    win.classList.remove("open", "focused", "maximized");
    if (this.focusedId === id) this.focusedId = null;
    this._updateTaskbar();
  },

  focus(id) {
    const win = $(id);
    if (!win) return;
    document.querySelectorAll(".window.focused").forEach((w) =>
      w.classList.remove("focused")
    );
    win.classList.add("focused");
    win.style.zIndex = ++this.zIndex;
    this.focusedId = id;
    this._updateTaskbar();
  },

  toggleMax(id) {
    const win = $(id);
    if (!win) return;
    win.classList.toggle("maximized");
    this.focus(id);
    requestAnimationFrame(() => {
      win.querySelectorAll("canvas").forEach(syncCanvas);
      this._rerenderCharts(id);
    });
  },

  _rerenderCharts(id) {
    if (id === "kpi-win")
      renderDelayChart(state.dashboard?.delay_samples || []);
    if (id === "telemetry-win")
      renderTelemetryChart(state.telemetrySpikes);
  },

  _updateTaskbar() {
    document.querySelectorAll(".taskbar-app[data-win]").forEach((btn) => {
      const winId = btn.dataset.win;
      if (!winId) return;
      const win = $(winId);
      const isOpen = win?.classList.contains("open");
      btn.classList.toggle("open", !!isOpen);
      btn.classList.toggle("focused", this.focusedId === winId);
    });
  },

  _makeDraggable(win) {
    const tb = win.querySelector(".window-titlebar");
    if (!tb) return;
    let dragging = false, sx, sy, ox, oy;

    tb.addEventListener("mousedown", (e) => {
      if (e.target.closest(".window-controls")) return;
      if (win.classList.contains("maximized")) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      ox = win.offsetLeft;
      oy = win.offsetTop;
      win.style.zIndex = ++WM.zIndex;

      const onMove = (e) => {
        if (!dragging) return;
        win.style.left = ox + e.clientX - sx + "px";
        win.style.top  = oy + e.clientY - sy + "px";
      };
      const onUp = () => {
        dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  },
};

/* ========================================================
   UI RENDERING
   ======================================================== */

/* ----- KPI ----- */
function setSummary(s) {
  setText("kpi-entities", s.zigbee_entities ?? "-");
  setText("kpi-switches", s.switches_total ?? s.zigbee_switches ?? "-");
  setText("kpi-rules", s.mirror_rules ?? "-");
  setText("kpi-srules", s.sensor_rules ?? "-");
  setText("kpi-avg", s.delay_avg_ms == null ? "-" : `${s.delay_avg_ms} ms`);
  setText("kpi-p95", s.delay_p95_ms == null ? "-" : `${s.delay_p95_ms} ms`);
  setText("kpi-max", s.delay_max_ms == null ? "-" : `${s.delay_max_ms} ms`);
  setText("kpi-pending", s.pending_commands ?? "-");
}

/* ----- Delay chart ----- */
function renderDelayChart(samples) {
  const canvas = $("delay-chart");
  if (!canvas || canvas.offsetParent === null) return;
  syncCanvas(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, w, h);

  if (!samples || !samples.length) {
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${13 * dpr}px Segoe UI`;
    ctx.fillText("Brak pr\u00F3bek delay", 14 * dpr, 22 * dpr);
    return;
  }

  const values = samples.map((s) => Number(s.delay_ms) || 0);
  const max = Math.max(50, ...values);
  const pad = { x: 36 * dpr, y: 18 * dpr };
  const iw = w - pad.x * 2, ih = h - pad.y * 2;

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.y + (ih * i) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.x, y);
    ctx.lineTo(w - pad.x, y);
    ctx.stroke();
  }

  /* area fill */
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

  /* line */
  ctx.strokeStyle = "#60cdff";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.x + (i / Math.max(values.length - 1, 1)) * iw;
    const y = h - pad.y - (v / max) * ih;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#ffffffde";
  ctx.font = `${11 * dpr}px Segoe UI`;
  ctx.fillText(`max ${max.toFixed(0)} ms`, w - 110 * dpr, 14 * dpr);
}

/* ----- Telemetry chart ----- */
function renderTelemetryChart(spikes) {
  const canvas = $("telemetry-chart");
  if (!canvas || canvas.offsetParent === null) return;
  syncCanvas(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, w, h);

  const data = (spikes || []).slice(-120);
  if (!data.length) {
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${12 * dpr}px Segoe UI`;
    ctx.fillText("Brak event\u00F3w telemetrycznych", 14 * dpr, 22 * dpr);
    return;
  }

  const series = [
    { key: "zha", color: "#60cdff" },
    { key: "state", color: "#6ccb5f" },
    { key: "call", color: "#fce100" },
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
    ctx.beginPath();
    ctx.moveTo(pad.x, y);
    ctx.lineTo(w - pad.x, y);
    ctx.stroke();
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

/* ----- Telemetry log ----- */
function renderTelemetryLog(events) {
  const host = $("telemetry-log");
  if (!host) return;
  host.innerHTML = "";
  const rows = (events || []).slice(-200).reverse();
  for (const ev of rows) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = "mdi mdi-flash";
    title.appendChild(icon);
    title.appendChild(document.createTextNode(ev.type || "event"));
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = ev.summary || "-";
    left.appendChild(title);
    left.appendChild(sub);
    const ts = document.createElement("div");
    ts.className = "entity-sub";
    ts.textContent = ev.ts || "-";
    row.appendChild(left);
    row.appendChild(ts);
    host.appendChild(row);
  }
}

/* ----- ZHA list ----- */
function renderZhaList() {
  const host = $("zha-list");
  if (!host) return;
  const q = ($("zha-search")?.value || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.zhaItems.filter(
    (it) =>
      !q ||
      `${it.entity_id} ${it.friendly_name || ""} ${it.state || ""}`
        .toLowerCase()
        .includes(q)
  );

  for (const it of items) {
    const iconCls =
      it.icon?.startsWith("mdi:") ? it.icon.replace(":", "-") : "mdi-zigbee";
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = `mdi ${iconCls}`;
    title.appendChild(icon);
    title.appendChild(
      document.createTextNode(it.friendly_name || it.entity_id)
    );
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = `${it.entity_id} \u00B7 LQI: ${it.lqi ?? "-"} \u00B7 ${it.last_updated ?? "-"}`;
    left.appendChild(title);
    left.appendChild(sub);
    row.appendChild(left);
    row.appendChild(makeBadge(it.state));
    host.appendChild(row);
  }
}

/* ----- Switch list ----- */
function renderSwitchList() {
  const host = $("switch-list");
  if (!host) return;
  const q = ($("switch-search")?.value || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.switchItems.filter(
    (it) =>
      !q ||
      `${it.entity_id} ${it.friendly_name || ""} ${it.state || ""}`
        .toLowerCase()
        .includes(q)
  );

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = "mdi mdi-toggle-switch";
    title.appendChild(icon);
    title.appendChild(
      document.createTextNode(it.friendly_name || it.entity_id)
    );
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = it.entity_id;
    left.appendChild(title);
    left.appendChild(sub);

    const right = document.createElement("div");
    right.className = "right-actions";
    right.appendChild(makeBadge(it.state));
    right.appendChild(
      makeBtn("ON", () => switchAction(it.entity_id, "turn_on"))
    );
    right.appendChild(
      makeBtn("OFF", () => switchAction(it.entity_id, "turn_off"))
    );
    right.appendChild(
      makeBtn("Toggle", () => switchAction(it.entity_id, "toggle"), "Toggle")
    );

    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);
  }

  /* populate select dropdowns */
  const options = state.switchItems.map(
    (s) =>
      `<option value="${s.entity_id}">${s.entity_id}</option>`
  );
  const empty = '<option value="">-- switch --</option>';
  setHTML("mirror-source", empty + options.join(""));
  setHTML("mirror-target", empty + options.join(""));
  setHTML("sensor-switch", empty + options.join(""));
}

/* ----- Mirror rules ----- */
function renderMirrorRules(rules) {
  const host = $("rules-list");
  if (!host) return;
  host.innerHTML = "";
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = "mdi mdi-link-variant";
    title.appendChild(icon);
    title.appendChild(
      document.createTextNode(`${rule.source} \u2194 ${rule.target}`)
    );
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = rule.bidirectional ? "Bidirectional" : "One-way";
    left.appendChild(title);
    left.appendChild(sub);
    row.appendChild(left);
    row.appendChild(
      makeBtn("Usu\u0144", async () => {
        await api(
          `api/mirror-rules/${encodeURIComponent(rule.id)}`,
          { method: "DELETE" }
        );
        await load();
      })
    );
    host.appendChild(row);
  }
}

/* ----- Sensor rules ----- */
function renderSensorRules(rules) {
  const host = $("sensor-rules-list");
  if (!host) return;
  host.innerHTML = "";
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = "mdi mdi-gauge";
    title.appendChild(icon);
    title.appendChild(
      document.createTextNode(
        `${rule.sensor_entity} \u2192 ${rule.switch_entity}`
      )
    );
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = `[${rule.min_value ?? "-\u221E"}, ${rule.max_value ?? "+\u221E"}] in:${rule.action_in_range} out:${rule.action_out_of_range}`;
    left.appendChild(title);
    left.appendChild(sub);
    row.appendChild(left);
    row.appendChild(
      makeBtn("Usu\u0144", async () => {
        await api(
          `api/sensor-rules/${encodeURIComponent(rule.id)}`,
          { method: "DELETE" }
        );
        await load();
      })
    );
    host.appendChild(row);
  }
}

function renderSensorOptions() {
  const opts =
    '<option value="">-- sensor --</option>' +
    state.sensorItems
      .map((s) => `<option value="${s.entity_id}">${s.entity_id}</option>`)
      .join("");
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
  b.textContent = label;
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
  if (!source || !target || source === target) {
    alert("Wybierz dwa r\u00F3\u017Cne switche");
    return;
  }
  await api("api/mirror-rules", {
    method: "POST",
    body: JSON.stringify({ source, target, bidirectional: bi }),
  });
  await load();
}

async function addSensorRule() {
  const sensor_entity = $("sensor-entity")?.value;
  const switch_entity = $("sensor-switch")?.value;
  const minRaw = $("sensor-min")?.value ?? "";
  const maxRaw = $("sensor-max")?.value ?? "";
  const action_in_range = $("sensor-in-action")?.value;
  const action_out_of_range = $("sensor-out-action")?.value;
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

/* ---------- Main data load ---------- */
async function load() {
  if (state.loading) return;
  state.loading = true;
  try {
    const d = await api("api/dashboard");

    state.dashboard = d;
    state.zhaItems = d.zigbee_devices || [];
    state.switchItems = d.switches || [];
    state.sensorItems = d.sensors || [];
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
      setStatus(`B\u0142\u0105d: ${d.runtime.last_error}`, true);
    } else {
      setStatus(
        `OK \u00B7 zigbee: ${d.summary?.zigbee_entities ?? 0} \u00B7 switches: ${d.summary?.switches_total ?? 0}`,
        false
      );
    }

    setText("updated-at", new Date().toLocaleTimeString("pl-PL"));
  } catch (e) {
    setStatus(`B\u0142\u0105d: ${e.message}`, true);
  } finally {
    state.loading = false;
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  /* Boot window manager */
  WM.init();

  /* Refresh button */
  $("refresh-btn")?.addEventListener("click", async () => {
    try {
      await api("api/refresh", { method: "POST" });
      await load();
    } catch (e) {
      setStatus(`Refresh: ${e.message}`, true);
    }
  });

  /* Search inputs */
  $("zha-search")?.addEventListener("input", renderZhaList);
  $("switch-search")?.addEventListener("input", renderSwitchList);

  /* Form buttons */
  $("add-rule-btn")?.addEventListener("click", async () => {
    try {
      await addMirrorRule();
    } catch (e) {
      setStatus(`Mirror: ${e.message}`, true);
    }
  });
  $("add-sensor-rule-btn")?.addEventListener("click", async () => {
    try {
      await addSensorRule();
    } catch (e) {
      setStatus(`Sensor: ${e.message}`, true);
    }
  });

  /* Clock */
  tickClock();
  setInterval(tickClock, 15000);

  /* Auto-open KPI window on start */
  WM.open("kpi-win");

  /* Initial data load */
  load();

  /* Auto-refresh every 5 seconds */
  state.refreshTimer = setInterval(() => load(), 5000);
});
