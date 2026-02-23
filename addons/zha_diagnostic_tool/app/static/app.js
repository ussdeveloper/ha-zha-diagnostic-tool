/* ===== ZHA Diagnostic Desktop — app.js (v0.9.0) ===== */
"use strict";

/* ---------- State ---------- */
const state = {
  dashboard: null,
  zhaItems: [],
  switchItems: [],
  sensorItems: [],
  batteryItems: [],
  batteryAlerts: [],
  notifyEntities: [],
  telemetrySpikes: [],
  telemetryEvents: [],
  commandLog: [],
  refreshTimer: null,
  loading: false,
  folders: JSON.parse(localStorage.getItem("zha_desktop_folders") || "[]"),
  netMap: { zoom: 1, panX: 0, panY: 0 },
  deviceWinCount: 0,
  devHelperDevices: [],
  devHelperSelected: null,
  devHelperKeepAlive: [],
  zigbeeErrorLog: [],
  zigbeeLogsPaused: false,
  zhaDevicesFull: [],
  iconPositions: JSON.parse(localStorage.getItem("zha_icon_positions") || "{}"),
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
  const Y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, "0");
  const D = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  setHTML("taskbar-clock", `${h}:${m}:${s}<br>${Y}-${M}-${D}`);
}

/* ========================================================
   AUTOCOMPLETE — reusable searchable dropdown
   ======================================================== */
function initAutocomplete(inputId, listId, getItems) {
  const input = $(inputId);
  const listEl = $(listId);
  if (!input || !listEl) return;

  let activeIdx = -1;

  function render() {
    const q = input.value.trim().toLowerCase();
    const items = getItems();
    const filtered = q
      ? items.filter((it) => it.toLowerCase().includes(q))
      : items;

    listEl.innerHTML = "";
    activeIdx = -1;

    if (!filtered.length) {
      listEl.classList.remove("open");
      return;
    }

    for (let i = 0; i < filtered.length && i < 80; i++) {
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      if (q) {
        const idx = filtered[i].toLowerCase().indexOf(q);
        const before = filtered[i].slice(0, idx);
        const match = filtered[i].slice(idx, idx + q.length);
        const after = filtered[i].slice(idx + q.length);
        div.innerHTML =
          escapeHtml(before) +
          `<span class="ac-match">${escapeHtml(match)}</span>` +
          escapeHtml(after);
      } else {
        div.textContent = filtered[i];
      }
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = filtered[i];
        listEl.classList.remove("open");
      });
      listEl.appendChild(div);
    }
    listEl.classList.add("open");
  }

  input.addEventListener("focus", render);
  input.addEventListener("input", render);
  input.addEventListener("blur", () => {
    setTimeout(() => listEl.classList.remove("open"), 150);
  });

  input.addEventListener("keydown", (e) => {
    const items = listEl.querySelectorAll(".autocomplete-item");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      input.value = items[activeIdx].textContent;
      listEl.classList.remove("open");
      return;
    } else if (e.key === "Escape") {
      listEl.classList.remove("open");
      return;
    } else {
      return;
    }

    items.forEach((it, i) =>
      it.classList.toggle("active", i === activeIdx)
    );
    if (items[activeIdx]) {
      items[activeIdx].scrollIntoView({ block: "nearest" });
    }
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/* ---------- Date formatting YYYY-MM-DD HH:MM:SS ---------- */
function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, "0");
  const D = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

function fmtNow() {
  return fmtDate(new Date().toISOString());
}

/* ========================================================
   WINDOW MANAGER — open, close, focus, drag, maximize, resize
   ======================================================== */
const WM = {
  zIndex: 100,
  focusedId: null,

  /* Default size & position — cascade from top-left */
  defaults: {
    "kpi-win":          { w: 840, h: 320, x: 130, y: 15  },
    "zha-win":          { w: 520, h: 440, x: 170, y: 55  },
    "switch-win":       { w: 580, h: 400, x: 210, y: 95  },
    "telemetry-win":    { w: 680, h: 480, x: 250, y: 35  },
    "mirror-win":       { w: 580, h: 340, x: 290, y: 135 },
    "sensor-win":       { w: 620, h: 360, x: 330, y: 75  },
    "battery-win":      { w: 720, h: 520, x: 160, y: 45  },
    "netmap-win":       { w: 820, h: 600, x: 160, y: 20  },
    "devhelper-win":    { w: 820, h: 560, x: 140, y: 30  },
    "zigbeelogs-win":   { w: 780, h: 520, x: 180, y: 40  },
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
      this._makeResizable(win);
    }

    /* Close buttons */
    document.querySelectorAll(".win-ctrl.close").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const win = e.target.closest(".window");
        if (win) this.close(win.id);
      });
    });

    /* Minimize buttons */
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

    /* Click on window body -> focus */
    document.querySelectorAll(".window").forEach((win) => {
      win.addEventListener("mousedown", () => this.focus(win.id));
    });

    /* Desktop shortcut icons -> open window */
    document.querySelectorAll(".desktop-shortcut").forEach((btn) => {
      btn.addEventListener("click", () => {
        const winId = btn.dataset.win;
        if (winId) this.open(winId);
      });
    });

    /* Taskbar app buttons -> toggle window */
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
    if (id === "battery-win")
      renderBatteryChart(state.batteryItems);
    if (id === "netmap-win")
      renderNetworkMap();
    if (id === "devhelper-win" && !state.devHelperDevices.length) {
      loadDevHelperDevices();
      loadDevHelperKeepAlive();
    }
    if (id === "zigbeelogs-win")
      renderZigbeeLogs();
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

  _makeResizable(win) {
    const handle = win.querySelector(".resize-handle");
    if (!handle) return;

    handle.addEventListener("mousedown", (e) => {
      if (win.classList.contains("maximized")) return;
      e.preventDefault();
      e.stopPropagation();

      const sx = e.clientX;
      const sy = e.clientY;
      const ow = win.offsetWidth;
      const oh = win.offsetHeight;

      const onMove = (e) => {
        const nw = Math.max(340, ow + e.clientX - sx);
        const nh = Math.max(180, oh + e.clientY - sy);
        win.style.width = nw + "px";
        win.style.height = nh + "px";
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        /* Sync canvases after resize */
        win.querySelectorAll("canvas").forEach(syncCanvas);
        WM._rerenderCharts(win.id);
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

  const pendEl = $("kpi-pending");
  if (pendEl) {
    pendEl.textContent = s.pending_commands ?? "-";
    pendEl.className = (s.pending_commands > 0) ? "val-warn" : "";
  }
  const errEl = $("kpi-errors");
  if (errEl) {
    const errs = s.command_errors ?? 0;
    errEl.textContent = errs;
    errEl.className = errs > 0 ? "val-bad" : "";
  }
  const succEl = $("kpi-success");
  if (succEl) {
    const rate = s.command_success_rate;
    succEl.textContent = rate != null ? `${rate}%` : "-";
    if (rate != null) succEl.className = rate < 90 ? "val-bad" : rate < 99 ? "val-warn" : "val-good";
  }
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
    ctx.fillText("No delay samples yet", 14 * dpr, 22 * dpr);
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

  /* Area fill */
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

  /* Line */
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
    ctx.fillText("No telemetry events yet", 14 * dpr, 22 * dpr);
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

/* ----- Telemetry log (merged events + command log) ----- */
function renderTelemetryLog(events, commandLog) {
  const host = $("telemetry-log");
  if (!host) return;
  host.innerHTML = "";

  const merged = [];
  for (const ev of (events || [])) {
    merged.push({ ...ev, _src: "event" });
  }
  for (const cmd of (commandLog || [])) {
    merged.push({
      type: "command",
      summary: `${cmd.action} \u2192 ${cmd.entity_id}${cmd.status === "confirmed" ? ` (${cmd.delay_ms}ms)` : cmd.status === "timeout" ? " TIMEOUT" : ""}`,
      ts: cmd.ts,
      _src: "cmd",
      _status: cmd.status,
    });
  }
  merged.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));

  const rows = merged.slice(0, 300);
  for (const ev of rows) {
    const row = document.createElement("div");
    if (ev._src === "cmd") {
      row.className = `row cmd-${ev._status || "sent"}`;
    } else {
      row.className = "row";
    }
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    if (ev._src === "cmd") {
      icon.className = ev._status === "confirmed" ? "mdi mdi-check-circle"
        : ev._status === "timeout" ? "mdi mdi-alert-circle"
        : "mdi mdi-send";
    } else {
      icon.className = "mdi mdi-flash";
    }
    title.appendChild(icon);
    title.appendChild(document.createTextNode(ev.type || "event"));
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = ev.summary || "-";
    left.appendChild(title);
    left.appendChild(sub);
    const ts = document.createElement("div");
    ts.className = "entity-sub";
    ts.textContent = fmtDate(ev.ts);
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
    sub.textContent = `${it.entity_id}${it.lqi != null ? " \u00B7 LQI: " + it.lqi : ""} \u00B7 ${fmtDate(it.last_updated)}`;
    left.appendChild(title);
    left.appendChild(sub);
    row.appendChild(left);
    row.appendChild(makeBadge(it.state));
    row.addEventListener("click", () => openDeviceDetail(it));
    row.style.cursor = "pointer";
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
      makeBtn("Delete", async () => {
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
      makeBtn("Delete", async () => {
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

/* ----- Battery list (sorted weakest first) ----- */
function renderBatteryList() {
  const host = $("battery-list");
  if (!host) return;
  const q = ($("battery-search")?.value || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.batteryItems
    .filter(
      (it) =>
        !q ||
        `${it.entity_id} ${it.friendly_name || ""}`
          .toLowerCase()
          .includes(q)
    )
    .sort((a, b) => (a.battery ?? 999) - (b.battery ?? 999));

  for (const it of items) {
    const lvl = it.battery;
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = `mdi ${batteryIcon(lvl)}`;
    icon.style.color = batteryColor(lvl);
    title.appendChild(icon);
    title.appendChild(
      document.createTextNode(it.friendly_name || it.entity_id)
    );
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = `${it.entity_id} \u00B7 Last: ${it.last_updated ?? "-"}`;
    left.appendChild(title);
    left.appendChild(sub);

    const badge = document.createElement("span");
    badge.className = `badge ${batteryBadgeClass(lvl)}`;
    badge.textContent = lvl != null ? `${lvl}%` : "N/A";

    row.appendChild(left);
    row.appendChild(badge);
    host.appendChild(row);
  }
}

function batteryIcon(lvl) {
  if (lvl == null) return "mdi-battery-unknown";
  if (lvl <= 10) return "mdi-battery-10";
  if (lvl <= 20) return "mdi-battery-20";
  if (lvl <= 30) return "mdi-battery-30";
  if (lvl <= 50) return "mdi-battery-50";
  if (lvl <= 70) return "mdi-battery-70";
  if (lvl <= 90) return "mdi-battery-90";
  return "mdi-battery";
}

function batteryColor(lvl) {
  if (lvl == null) return "#ffffff61";
  if (lvl <= 10) return "#ff4444";
  if (lvl <= 20) return "#ff6b6b";
  if (lvl <= 50) return "#fce100";
  return "#6ccb5f";
}

function batteryBadgeClass(lvl) {
  if (lvl == null) return "mid";
  if (lvl <= 10) return "batt-crit";
  if (lvl <= 20) return "batt-low";
  if (lvl <= 50) return "batt-med";
  return "batt-ok";
}

/* ----- Battery drain chart ----- */
function renderBatteryChart(items) {
  const canvas = $("battery-chart");
  if (!canvas || canvas.offsetParent === null) return;
  syncCanvas(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, w, h);

  /* Show top 6 weakest devices with battery history */
  const withHistory = items
    .filter((it) => it.battery_history && it.battery_history.length > 1)
    .sort((a, b) => (a.battery ?? 999) - (b.battery ?? 999))
    .slice(0, 6);

  if (!withHistory.length) {
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${12 * dpr}px Segoe UI`;
    ctx.fillText("No battery history data available", 14 * dpr, 22 * dpr);
    return;
  }

  const colors = ["#ff6b6b", "#fce100", "#60cdff", "#6ccb5f", "#da77f2", "#ff922b"];
  const pad = { x: 36 * dpr, y: 24 * dpr };
  const iw = w - 2 * pad.x, ih = h - 2 * pad.y;

  /* Grid lines */
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#ffffff61";
  ctx.font = `${10 * dpr}px Segoe UI`;
  for (let i = 0; i <= 4; i++) {
    const y = pad.y + (ih * i) / 4;
    const val = 100 - (i * 25);
    ctx.beginPath();
    ctx.moveTo(pad.x, y);
    ctx.lineTo(w - pad.x, y);
    ctx.stroke();
    ctx.fillText(`${val}%`, 4 * dpr, y + 4 * dpr);
  }

  /* Draw lines for each device */
  withHistory.forEach((dev, di) => {
    const hist = dev.battery_history;
    ctx.strokeStyle = colors[di % colors.length];
    ctx.lineWidth = 1.6 * dpr;
    ctx.beginPath();
    hist.forEach((pt, i) => {
      const x = pad.x + (i / Math.max(hist.length - 1, 1)) * iw;
      const y = pad.y + ih - (pt.value / 100) * ih;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  /* Legend */
  const legendY = h - 6 * dpr;
  let legendX = pad.x;
  ctx.font = `${10 * dpr}px Segoe UI`;
  withHistory.forEach((dev, di) => {
    ctx.fillStyle = colors[di % colors.length];
    ctx.fillRect(legendX, legendY - 8 * dpr, 10 * dpr, 3 * dpr);
    ctx.fillStyle = "#ffffffde";
    const label = (dev.friendly_name || dev.entity_id).slice(0, 20);
    ctx.fillText(label, legendX + 14 * dpr, legendY - 2 * dpr);
    legendX += ctx.measureText(label).width + 24 * dpr;
  });
}

/* ----- Battery alerts list ----- */
function renderBatteryAlerts(alerts) {
  const host = $("battery-alerts-list");
  if (!host) return;
  host.innerHTML = "";
  if (!alerts || !alerts.length) {
    host.innerHTML = '<div class="row"><div class="entity-sub">No battery alerts configured</div></div>';
    return;
  }
  for (const alert of alerts) {
    const row = document.createElement("div");
    row.className = "row";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = "mdi mdi-bell";
    icon.style.color = "#fce100";
    title.appendChild(icon);
    title.appendChild(
      document.createTextNode(`Threshold: ${alert.threshold}% → ${alert.notify_entity}`)
    );
    left.appendChild(title);
    row.appendChild(left);
    row.appendChild(
      makeBtn("Delete", async () => {
        await api(
          `api/battery-alerts/${encodeURIComponent(alert.id)}`,
          { method: "DELETE" }
        );
        await load();
      })
    );
    host.appendChild(row);
  }
}

/* ========================================================
   DEVICE DETAIL (Dynamic Window on click — shows ALL entities for the device)
   ======================================================== */
function openDeviceDetail(entityItem) {
  const eid = entityItem.entity_id;

  // Find device key from entity_id (strip domain and known suffixes)
  const parts = eid.split(".", 2);
  const namePart = parts.length > 1 ? parts[1] : eid;
  let deviceKey = namePart;
  const suffixes = ["_temperature", "_humidity", "_battery", "_motion",
    "_occupancy", "_illuminance", "_power", "_energy", "_pressure",
    "_contact", "_vibration", "_rssi", "_lqi", "_linkquality",
    "_alarm", "_tamper", "_trigger", "_action", "_click", "_event",
    "_level", "_color_temp", "_brightness", "_voltage", "_current"];
  for (const sfx of suffixes) {
    if (namePart.endsWith(sfx)) { deviceKey = namePart.slice(0, -sfx.length); break; }
  }

  // Reuse existing window if device already open
  const existingId = `dev-${deviceKey.replace(/[^a-z0-9_]/gi, "_")}`;
  if ($(existingId)) { WM.open(existingId); WM.focus(existingId); return; }

  const winId = existingId;
  ++state.deviceWinCount;

  // All entities for this device
  const allEntities = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
  const related = allEntities.filter(e => {
    const ep = e.entity_id.split(".", 2);
    const en = ep.length > 1 ? ep[1] : ep[0];
    return en === deviceKey || en.startsWith(deviceKey + "_");
  });
  const unique = [...new Map(related.map(e => [e.entity_id, e])).values()];
  if (!unique.find(e => e.entity_id === eid)) unique.unshift(entityItem);

  // Related telemetry
  const deviceEvents = state.telemetryEvents
    .filter(ev => (ev.summary || "").includes(deviceKey))
    .slice(-30);
  const deviceCommands = state.commandLog
    .filter(cmd => cmd.entity_id && cmd.entity_id.includes(deviceKey))
    .slice(-30);

  const iconCls = entityItem.icon?.startsWith("mdi:") ? entityItem.icon.replace(":", "-") : "mdi-zigbee";
  const deviceName = entityItem.friendly_name
    ? entityItem.friendly_name.replace(/\s+(temperature|humidity|battery|motion|power|energy|level|contact|vibration|lqi|rssi)$/i, "").trim()
    : deviceKey;

  const win = document.createElement("section");
  win.className = "window";
  win.id = winId;

  win.innerHTML = `
    <div class="window-titlebar">
      <i class="mdi ${iconCls} win-icon"></i>
      <span class="win-title">${escapeHtml(deviceName)}</span>
      <div class="window-controls">
        <span class="win-ctrl minimize"><i class="mdi mdi-minus"></i></span>
        <span class="win-ctrl maximize"><i class="mdi mdi-checkbox-blank-outline"></i></span>
        <span class="win-ctrl close"><i class="mdi mdi-close"></i></span>
      </div>
    </div>
    <div class="window-body device-detail-body">
      <div class="device-header">
        <i class="mdi ${iconCls} dev-icon"></i>
        <div class="dev-info">
          <div class="dev-name">${escapeHtml(deviceName)}</div>
          <div class="dev-id">${escapeHtml(eid)}${entityItem.lqi != null ? " · LQI: " + entityItem.lqi : ""}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-sec);padding:2px 0 2px 2px;flex-shrink:0">
        <i class="mdi mdi-format-list-bulleted" style="color:var(--accent)"></i>
        All entities for this device (${unique.length})
      </div>
      <div id="${winId}-entities" class="list" style="flex:1;min-height:80px"></div>
      <div style="font-size:11px;color:var(--text-sec);padding:2px 0 2px 2px;flex-shrink:0">
        <i class="mdi mdi-history" style="color:var(--accent)"></i> Activity Log
      </div>
      <div id="${winId}-log" class="list" style="flex:1;min-height:60px;max-height:160px"></div>
    </div>
    <div class="resize-handle"></div>`;

  $("desktop").appendChild(win);
  const offset = state.deviceWinCount * 22;
  WM.defaults[winId] = { w: 520, h: 520, x: 180 + offset % 200, y: 50 + offset % 120 };
  win.style.width = "520px";
  win.style.height = "520px";
  win.style.left = (180 + offset % 200) + "px";
  win.style.top = (50 + offset % 120) + "px";
  WM._makeDraggable(win);
  WM._makeResizable(win);

  win.querySelector(".win-ctrl.close").addEventListener("click", () => {
    WM.close(winId);
    setTimeout(() => { win.remove(); delete WM.defaults[winId]; }, 200);
  });
  win.querySelector(".win-ctrl.minimize").addEventListener("click", () => WM.close(winId));
  win.querySelector(".win-ctrl.maximize").addEventListener("click", () => WM.toggleMax(winId));
  win.addEventListener("mousedown", () => WM.focus(winId));

  // Render entities list
  const entHost = $(`${winId}-entities`);
  if (entHost) {
    for (const e of unique) {
      const row = document.createElement("div");
      row.className = "row";
      const ic = e.icon?.startsWith("mdi:") ? e.icon.replace(":", "-") : "mdi-zigbee";
      const lqiStr = e.lqi != null ? ` · LQI: ${e.lqi}` : "";
      const left = document.createElement("div");
      left.innerHTML = `<div class="entity-title"><i class="mdi ${ic}"></i> ${escapeHtml(e.friendly_name || e.entity_id)}</div>` +
        `<div class="entity-sub">${escapeHtml(e.entity_id)}${lqiStr} · ${fmtDate(e.last_updated)}</div>`;
      row.appendChild(left);
      const right = document.createElement("div");
      right.className = "right-actions";
      right.appendChild(makeBadge(e.state));
      // Switch controls
      if (e.entity_id.startsWith("switch.")) {
        right.appendChild(makeBtn("ON", () => switchAction(e.entity_id, "turn_on")));
        right.appendChild(makeBtn("OFF", () => switchAction(e.entity_id, "turn_off")));
      }
      row.appendChild(right);
      entHost.appendChild(row);
    }
    if (!unique.length) entHost.innerHTML = '<div class="row"><div class="entity-sub">No related entities found</div></div>';
  }

  // Render activity log, auto-scroll to bottom
  const logHost = $(`${winId}-log`);
  if (logHost) {
    const logItems = [
      ...deviceEvents.map(ev => ({ ...ev, _src: "event" })),
      ...deviceCommands.map(cmd => ({
        type: "command",
        summary: `${cmd.action} → ${cmd.entity_id} ${cmd.status === "confirmed" ? `(${cmd.delay_ms}ms)` : cmd.status === "timeout" ? "TIMEOUT" : ""}`,
        ts: cmd.ts, _src: "cmd", _status: cmd.status,
      }))
    ].sort((a, b) => (a.ts || "").localeCompare(b.ts || "")).slice(-30);

    for (const ev of logItems) {
      const row = document.createElement("div");
      row.className = `row${ev._src === "cmd" ? " cmd-" + (ev._status || "sent") : ""}`;
      const ic2 = ev._src === "cmd"
        ? (ev._status === "confirmed" ? "mdi-check-circle" : ev._status === "timeout" ? "mdi-alert-circle" : "mdi-send")
        : "mdi-flash";
      row.innerHTML = `<div><div class="entity-title"><i class="mdi ${ic2}"></i> ${escapeHtml(ev.type || "event")}</div>` +
        `<div class="entity-sub">${escapeHtml(ev.summary || "-")}</div></div>` +
        `<div class="entity-sub">${fmtDate(ev.ts)}</div>`;
      logHost.appendChild(row);
    }
    if (!logItems.length) logHost.innerHTML = '<div class="row"><div class="entity-sub">No activity recorded</div></div>';
    // Auto-scroll to bottom
    requestAnimationFrame(() => { logHost.scrollTop = logHost.scrollHeight; });
  }

  WM.open(winId);
}

/* ========================================================
   NETWORK MAP — true ZHA force-directed topology
   ======================================================== */

function renderNetworkMap() {
  const canvas = $("netmap-canvas");
  if (!canvas || canvas.offsetParent === null) return;
  syncCanvas(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;
  const nm = state.netMap;

  ctx.clearRect(0, 0, w, h);

  // Background dark
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, w, h);
  // Subtle radial glow in center
  const bg = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, Math.max(w,h)*0.6);
  bg.addColorStop(0, "rgba(0,60,120,0.18)");
  bg.addColorStop(1, "transparent");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2 + nm.panX * dpr, h / 2 + nm.panY * dpr);
  ctx.scale(nm.zoom, nm.zoom);

  // Use full ZHA device list if available, else group from entities
  const devices = state.zhaDevicesFull.length
    ? state.zhaDevicesFull
    : groupDevicesForMap(state.zhaItems);

  if (!devices.length) {
    ctx.restore();
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${13 * dpr}px Segoe UI`;
    ctx.textAlign = "left";
    ctx.fillText("No ZHA devices — open Network Map to load", 20 * dpr, 30 * dpr);
    return;
  }

  // Build nodes with stable layout positions (force-directed seed)
  if (!nm.nodes || nm.nodes.length !== devices.length) {
    const count = devices.length;
    const angleStep = (2 * Math.PI) / Math.max(count, 1);
    nm.nodes = devices.map((dev, i) => {
      const lqi = _devLqi(dev);
      // Devices with better LQI placed closer to center
      const minR = 80, maxR = 280;
      const r = (maxR - (lqi / 255) * (maxR - minR)) * dpr;
      const angle = i * angleStep - Math.PI / 2;
      return {
        dev,
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: 0, vy: 0,
      };
    });
    // Run force-directed iterations for better layout
    for (let iter = 0; iter < 80; iter++) {
      _forceStep(nm.nodes, dpr);
    }
  }

  // Draw edges (lines between devices and coordinator / using neighbours if available)
  for (const node of nm.nodes) {
    const lqi = _devLqi(node.dev);
    const lineColor = lqi > 180 ? "#6ccb5f" : lqi > 100 ? "#fce100" : "#ff6b6b";
    const neighbors = node.dev.neighbors || [];
    if (neighbors.length) {
      for (const nb of neighbors) {
        const target = nm.nodes.find(n =>
          (n.dev.ieee === nb.ieee) || (n.dev.device_ieee === nb.device_ieee)
        );
        if (!target) continue;
        const nbLqi = nb.lqi ?? 128;
        const edgeColor = nbLqi > 180 ? "rgba(108,203,95,0.35)"
          : nbLqi > 100 ? "rgba(252,225,0,0.3)"
          : "rgba(255,107,107,0.25)";
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = (nbLqi > 180 ? 1.5 : 0.8) * dpr;
        ctx.setLineDash(nbLqi > 180 ? [] : [4*dpr, 4*dpr]);
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      // Fallback: line to coordinator
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = (lqi > 180 ? 1.8 : 1) * dpr;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // LQI label on line midpoint
      if (lqi != null) {
        ctx.fillStyle = lineColor;
        ctx.font = `${8.5 * dpr}px Segoe UI`;
        ctx.textAlign = "center";
        ctx.fillText(String(lqi), node.x * 0.48, node.y * 0.48 - 4 * dpr);
      }
    }
  }

  ctx.globalAlpha = 1;
  ctx.setLineDash([]);

  // Coordinator node (center)
  const coordGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 18*dpr);
  coordGrad.addColorStop(0, "#60cdff");
  coordGrad.addColorStop(1, "#0078d4");
  ctx.fillStyle = coordGrad;
  ctx.shadowColor = "#60cdff";
  ctx.shadowBlur = 12 * dpr;
  ctx.beginPath();
  ctx.arc(0, 0, 16 * dpr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${10 * dpr}px Segoe UI`;
  ctx.textAlign = "center";
  ctx.fillText("HUB", 0, 3 * dpr);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `${9 * dpr}px Segoe UI`;
  ctx.fillText("Coordinator", 0, -22 * dpr);

  // Draw device nodes
  for (const node of nm.nodes) {
    const dev = node.dev;
    const lqi = _devLqi(dev);
    const nodeColor = lqi > 180 ? "#6ccb5f" : lqi > 100 ? "#fce100" : "#ff6b6b";
    const isRouter = dev.device_type === "Router" || dev.power_source_str?.includes("Main");
    const radius = isRouter ? 11 * dpr : 8 * dpr;

    // Node glow
    if (lqi > 180) {
      ctx.shadowColor = nodeColor;
      ctx.shadowBlur = 6 * dpr;
    }

    // Node fill
    const nodeGrad = ctx.createRadialGradient(node.x - 2*dpr, node.y - 2*dpr, 0, node.x, node.y, radius);
    nodeGrad.addColorStop(0, nodeColor + "ff");
    nodeGrad.addColorStop(1, nodeColor + "88");
    ctx.fillStyle = nodeGrad;
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Router ring
    if (isRouter) {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 3*dpr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Device name
    const label = (dev.user_given_name || dev.name_by_user || dev.name || dev.ieee || "?").slice(0, 22);
    ctx.fillStyle = "#ffffffde";
    ctx.font = `${9.5 * dpr}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.fillText(label, node.x, node.y + radius + 12 * dpr);

    // LQI badge
    if (lqi != null) {
      ctx.fillStyle = nodeColor;
      ctx.font = `bold ${8 * dpr}px Segoe UI`;
      ctx.fillText(`LQI ${lqi}`, node.x, node.y + radius + 21 * dpr);
    }

    // Device type badge
    if (isRouter) {
      ctx.fillStyle = "rgba(96,205,255,0.7)";
      ctx.font = `${7.5 * dpr}px Segoe UI`;
      ctx.fillText("R", node.x, node.y + 3 * dpr);
    }
  }

  ctx.restore();

  // Legend (top-right corner)
  const lx = w - 110 * dpr, ly = 16 * dpr;
  ctx.font = `${10 * dpr}px Segoe UI`;
  [["#6ccb5f", "LQI > 180 (good)"], ["#fce100", "LQI 100-180 (ok)"], ["#ff6b6b", "LQI < 100 (poor)"]].forEach(([c, label], i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(lx, ly + i * 16 * dpr, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff99";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 8 * dpr, ly + 4 * dpr + i * 16 * dpr);
  });
  ctx.textAlign = "center";
}

function _devLqi(dev) {
  if (dev.lqi != null) return dev.lqi;
  if (dev.link_quality != null) return dev.link_quality;
  // Try from neighbors list
  if (dev.neighbors && dev.neighbors.length) {
    const lqis = dev.neighbors.map(n => n.lqi).filter(v => v != null);
    if (lqis.length) return Math.max(...lqis);
  }
  return 128;
}

function _forceStep(nodes, dpr) {
  const repel = 3200 * dpr * dpr;
  const attract = 0.03;
  const center = 0.005;

  for (const a of nodes) {
    a.vx *= 0.7; a.vy *= 0.7;
    // Center gravity
    a.vx -= a.x * center;
    a.vy -= a.y * center;
    // Repulsion between nodes
    for (const b of nodes) {
      if (a === b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx*dx + dy*dy + 1;
      const f = repel / d2;
      a.vx += (dx / Math.sqrt(d2)) * f;
      a.vy += (dy / Math.sqrt(d2)) * f;
    }
    // Attraction to neighbors
    const neighbors = a.dev.neighbors || [];
    for (const nb of neighbors) {
      const target = nodes.find(n => n.dev.ieee === nb.ieee || n.dev.device_ieee === nb.device_ieee);
      if (!target) continue;
      const dx = target.x - a.x, dy = target.y - a.y;
      a.vx += dx * attract;
      a.vy += dy * attract;
    }
  }
  for (const a of nodes) {
    a.x += a.vx;
    a.y += a.vy;
  }
}

function initNetworkMap() {
  const canvas = $("netmap-canvas");
  if (!canvas) return;
  const nm = state.netMap;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    nm.zoom = Math.max(0.2, Math.min(8, nm.zoom * factor));
    renderNetworkMap();
  }, { passive: false });

  let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;
  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    spx = nm.panX; spy = nm.panY;
    canvas.style.cursor = "grabbing";
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    nm.panX = spx + (e.clientX - sx);
    nm.panY = spy + (e.clientY - sy);
    renderNetworkMap();
  });
  document.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; canvas.style.cursor = "grab"; }
  });

  // Double-click to reset view
  canvas.addEventListener("dblclick", () => {
    nm.zoom = 1; nm.panX = 0; nm.panY = 0; nm.nodes = null;
    renderNetworkMap();
  });
}

/* ========================================================
   ZIGBEE ERROR LOGS WINDOW
   ======================================================== */
function renderZigbeeLogs() {
  if (state.zigbeeLogsPaused) return;
  const host = $("zigbeelogs-list");
  if (!host) return;
  const q = ($("zigbeelogs-search")?.value || "").trim().toLowerCase();
  const filters = {
    timeout: $("zbl-filter-timeout")?.checked !== false,
    not_delivered: $("zbl-filter-not_delivered")?.checked !== false,
    lqi_critical: $("zbl-filter-lqi_critical")?.checked !== false,
    log_error: $("zbl-filter-log_error")?.checked !== false,
  };

  const items = [...state.zigbeeErrorLog].reverse().filter(item => {
    if (!filters[item.type] && !filters[item.type?.replace(/^log_/, "log_error")]) {
      const baseType = item.type?.startsWith("log_") ? "log_error" : item.type;
      if (!filters[baseType]) return false;
    }
    if (q && !`${item.ieee || ""} ${item.type || ""} ${item.raw || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  host.innerHTML = "";
  for (const item of items.slice(0, 300)) {
    const row = document.createElement("div");
    const baseType = item.type?.startsWith("log_") ? "log_error" : item.type;
    row.className = `row zbl-${baseType}`;
    row.style.cursor = "pointer";

    const iconMap = {
      timeout: "mdi-timer-off",
      not_delivered: "mdi-message-off",
      lqi_critical: "mdi-signal-off",
      log_error: "mdi-alert",
    };
    const icon = iconMap[baseType] || "mdi-bug";

    row.innerHTML =
      `<div style="flex:1;min-width:0">` +
      `<div class="entity-title"><i class="mdi ${icon}"></i> ${escapeHtml(item.type || "unknown")}` +
      (item.ieee ? ` <span class="entity-sub" style="margin:0 0 0 6px">${escapeHtml(item.ieee)}</span>` : "") +
      `</div>` +
      `<div class="entity-sub">${escapeHtml((item.raw || "").slice(0, 100))}</div>` +
      `</div>` +
      `<div class="entity-sub" style="flex-shrink:0">${fmtDate(item.ts)}</div>`;

    row.addEventListener("click", () => {
      document.querySelectorAll("#zigbeelogs-list .row").forEach(r => r.classList.remove("zbl-selected"));
      row.classList.add("zbl-selected");
      const ta = $("zigbeelogs-raw");
      if (ta) {
        ta.value = JSON.stringify(item, null, 2);
        ta.scrollTop = 0;
      }
    });
    host.appendChild(row);
  }

  if (!items.length) {
    host.innerHTML = '<div class="row"><div class="entity-sub">No Zigbee errors logged yet. Errors appear when ZHA reports timeouts, delivery failures or LQI drops.</div></div>';
  }
}

function initZigbeeLogs() {
  $("zigbeelogs-search")?.addEventListener("input", renderZigbeeLogs);
  ["zbl-filter-timeout","zbl-filter-not_delivered","zbl-filter-lqi_critical","zbl-filter-log_error"]
    .forEach(id => $(id)?.addEventListener("change", renderZigbeeLogs));
  $("zigbeelogs-clear-btn")?.addEventListener("click", () => {
    state.zigbeeErrorLog = [];
    renderZigbeeLogs();
  });
  $("zigbeelogs-pause-btn")?.addEventListener("click", (e) => {
    state.zigbeeLogsPaused = !state.zigbeeLogsPaused;
    const btn = e.currentTarget;
    btn.innerHTML = state.zigbeeLogsPaused
      ? `<i class="mdi mdi-play"></i>`
      : `<i class="mdi mdi-pause"></i>`;
    btn.title = state.zigbeeLogsPaused ? "Resume" : "Pause";
  });
}

/* ========================================================
   SPLIT RESIZE BAR (for telemetry top/bottom panels)
   ======================================================== */
function initSplitResizeBar(barId, topId, bottomId) {
  const bar = $(barId);
  const top = $(topId);
  const bottom = $(bottomId);
  if (!bar || !top || !bottom) return;

  let dragging = false, startY = 0, startTopH = 0;

  bar.addEventListener("mousedown", (e) => {
    dragging = true;
    startY = e.clientY;
    startTopH = top.offsetHeight;
    bar.classList.add("dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const delta = e.clientY - startY;
    const newH = Math.max(60, startTopH + delta);
    top.style.flex = "none";
    top.style.height = newH + "px";
    bottom.style.flex = "1";
    bottom.style.height = "0";
    // Redraw telemetry chart
    const canvas = top.querySelector("canvas");
    if (canvas) { syncCanvas(canvas); renderTelemetryChart(state.telemetrySpikes); }
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove("dragging");
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  });
}

/* ========================================================
   DESKTOP ICON DRAG & SAVE POSITIONS
   ======================================================== */
function initDesktopIconDrag() {
  const desktop = $("desktop");
  if (!desktop) return;

  function makeIconDraggable(btn) {
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    const key = btn.dataset.win || btn.dataset.folderId || btn.textContent.trim().slice(0, 30);

    // Restore saved position
    const saved = state.iconPositions[key];
    if (saved) {
      btn.style.position = "fixed";
      btn.style.left = saved.x + "px";
      btn.style.top = saved.y + "px";
    }

    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      // Distinguish click vs drag: start drag only after 5px movement
      const startX = e.clientX, startY2 = e.clientY;
      let moved = false;

      const onMove = (e2) => {
        if (!moved && Math.hypot(e2.clientX - startX, e2.clientY - startY2) < 5) return;
        if (!moved) {
          moved = true;
          dragging = true;
          sx = startX; sy = startY2;
          const rect = btn.getBoundingClientRect();
          ox = rect.left; oy = rect.top;
          btn.style.position = "fixed";
          btn.style.left = ox + "px";
          btn.style.top = oy + "px";
          btn.classList.add("dragging");
        }
        if (!dragging) return;
        const nx = Math.max(0, Math.min(window.innerWidth - btn.offsetWidth, ox + e2.clientX - sx));
        const ny = Math.max(0, Math.min(window.innerHeight - btn.offsetHeight - 52, oy + e2.clientY - sy));
        btn.style.left = nx + "px";
        btn.style.top = ny + "px";
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        if (dragging) {
          dragging = false;
          btn.classList.remove("dragging");
          const pos = { x: parseFloat(btn.style.left), y: parseFloat(btn.style.top) };
          state.iconPositions[key] = pos;
          localStorage.setItem("zha_icon_positions", JSON.stringify(state.iconPositions));
        }
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  document.querySelectorAll(".desktop-shortcut, .desktop-folder").forEach(makeIconDraggable);
  // Re-apply when folders are re-rendered
  window._makeIconDraggable = makeIconDraggable;
}

const _origRenderDesktopFolders = typeof renderDesktopFolders === "function" ? renderDesktopFolders : null;

/* ========================================================
   DEVICE HELPER EXPLORER
   ======================================================== */

const ZCL_HELP = {
  0: { name: "Basic", attrs: {
    0: { n: "zcl_version", h: "ZCL version" },
    3: { n: "hw_version", h: "Hardware version" },
    4: { n: "manufacturer_name", h: "Manufacturer name" },
    5: { n: "model_identifier", h: "Model ID" },
    7: { n: "power_source", h: "Power source: 1=Mains, 3=Battery" },
    16384: { n: "sw_build_id", h: "Software build" },
  }},
  1: { name: "Power Config", attrs: {
    32: { n: "battery_voltage", h: "Battery voltage (100mV units)" },
    33: { n: "battery_%_remaining", h: "Battery % (0-200, /2 for %)" },
  }},
  3: { name: "Identify", attrs: {
    0: { n: "identify_time", h: "Write >0 to blink device (seconds)" },
  }},
  6: { name: "On/Off", attrs: {
    0: { n: "on_off", h: "0=Off, 1=On" },
    16387: { n: "start_up_on_off", h: "Startup: 0=Off, 1=On, 2=Toggle, 255=Previous" },
  }},
  8: { name: "Level Control", attrs: {
    0: { n: "current_level", h: "Brightness (0-254)" },
    16: { n: "on_off_transition_time", h: "Transition 1/10s" },
    16384: { n: "start_up_current_level", h: "Startup level: 0=min, 255=prev" },
  }},
  32: { name: "Poll Control", attrs: {
    0: { n: "check_in_interval", h: "Check-in (quarter-sec). Lower = responsive, more battery" },
    1: { n: "long_poll_interval", h: "Long poll (quarter-sec)" },
    2: { n: "short_poll_interval", h: "Short poll (quarter-sec)" },
    3: { n: "fast_poll_timeout", h: "Fast poll timeout (quarter-sec)" },
  }},
  768: { name: "Color Control", attrs: {
    0: { n: "current_hue", h: "Hue (0-254)" },
    1: { n: "current_saturation", h: "Saturation (0-254)" },
    7: { n: "color_temperature", h: "Color temp (mireds)" },
    8: { n: "color_mode", h: "0=HS, 1=XY, 2=CT" },
  }},
  1026: { name: "Temperature", attrs: {
    0: { n: "measured_value", h: "Temp in 0.01\u00B0C" },
  }},
  1029: { name: "Humidity", attrs: {
    0: { n: "measured_value", h: "Humidity in 0.01%" },
  }},
  1030: { name: "Occupancy", attrs: {
    0: { n: "occupancy", h: "0=Unoccupied, 1=Occupied" },
    1: { n: "occupancy_sensor_type", h: "0=PIR, 1=Ultrasonic, 2=Both" },
    16: { n: "pir_o_to_u_delay", h: "Occ\u2192Unocc delay (sec). Increase for longer hold." },
    17: { n: "pir_u_to_o_delay", h: "Unocc\u2192Occ delay (sec)" },
    18: { n: "pir_u_to_o_threshold", h: "Sensitivity. Lower = more sensitive." },
  }},
  1280: { name: "IAS Zone", attrs: {
    0: { n: "zone_state", h: "0=Not enrolled, 1=Enrolled" },
    1: { n: "zone_type", h: "Zone type (motion, contact, fire...)" },
    2: { n: "zone_status", h: "Zone status bitmap" },
  }},
  2820: { name: "Electrical", attrs: {
    1285: { n: "rms_voltage", h: "RMS voltage (V)" },
    1288: { n: "rms_current", h: "RMS current (mA)" },
    1291: { n: "active_power", h: "Active power (W)" },
  }},
};

async function loadDevHelperDevices() {
  try {
    const data = await api("api/zha-helper/devices");
    state.devHelperDevices = data.items || [];
    renderDevHelperDevices();
  } catch (e) {
    const host = $("devhelper-device-list");
    if (host) host.innerHTML = `<div class="row"><div class="entity-sub">Error: ${escapeHtml(e.message)}</div></div>`;
  }
}

function renderDevHelperDevices() {
  const host = $("devhelper-device-list");
  if (!host) return;
  const q = ($("devhelper-search")?.value || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.devHelperDevices.filter(dev =>
    !q || `${dev.name || ""} ${dev.manufacturer || ""} ${dev.model || ""} ${dev.ieee || ""} ${dev.user_given_name || ""}`.toLowerCase().includes(q)
  );

  if (!items.length) {
    host.innerHTML = '<div class="row"><div class="entity-sub">No devices found</div></div>';
    return;
  }

  for (const dev of items) {
    const row = document.createElement("div");
    row.className = "row" + (state.devHelperSelected?.ieee === dev.ieee ? " selected" : "");
    row.style.cursor = "pointer";
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = "mdi mdi-zigbee";
    title.appendChild(icon);
    title.appendChild(document.createTextNode(dev.user_given_name || dev.name || dev.ieee));
    const sub = document.createElement("div");
    sub.className = "entity-sub";
    sub.textContent = `${dev.manufacturer || "?"} \u00B7 ${dev.model || "?"} \u00B7 ${dev.ieee || ""}`;
    left.appendChild(title);
    left.appendChild(sub);
    row.appendChild(left);
    row.addEventListener("click", () => selectDevHelperDevice(dev));
    host.appendChild(row);
  }
}

async function selectDevHelperDevice(dev) {
  state.devHelperSelected = dev;
  renderDevHelperDevices();

  const info = $("devhelper-device-info");
  if (info) {
    info.innerHTML =
      `<div class="dev-name">${escapeHtml(dev.user_given_name || dev.name || dev.ieee)}</div>` +
      `<div class="dev-detail">${escapeHtml(dev.manufacturer || "?")} \u00B7 ${escapeHtml(dev.model || "?")} \u00B7 IEEE: ${escapeHtml(dev.ieee || "")}</div>` +
      `<div class="dev-detail">NWK: ${dev.nwk || "?"} \u00B7 Quirk: ${dev.quirk_applied ? "Yes" : "No"}</div>`;
  }

  const identBtn = $("devhelper-identify-btn");
  if (identBtn) identBtn.disabled = false;
  const saveBtn = $("devhelper-save-keepalive-btn");
  if (saveBtn) saveBtn.disabled = false;

  const kaCfg = state.devHelperKeepAlive.find(c => c.ieee === dev.ieee);
  const kaChk = $("devhelper-keepalive-chk");
  const kaInt = $("devhelper-keepalive-interval");
  if (kaChk) kaChk.checked = kaCfg?.enabled || false;
  if (kaInt) kaInt.value = kaCfg?.interval_seconds || 60;

  await loadDevHelperClusters(dev.ieee);
}

async function loadDevHelperClusters(ieee) {
  const host = $("devhelper-clusters");
  if (!host) return;
  host.innerHTML = '<div class="row"><div class="entity-sub">Loading clusters...</div></div>';

  try {
    const data = await api(`api/zha-helper/clusters/${encodeURIComponent(ieee)}`);
    renderDevHelperClusters(ieee, data);
  } catch (e) {
    host.innerHTML = `<div class="row"><div class="entity-sub">Error: ${escapeHtml(e.message)}</div></div>`;
  }
}

function renderDevHelperClusters(ieee, clusterData) {
  const host = $("devhelper-clusters");
  if (!host) return;
  host.innerHTML = "";

  let endpoints = [];
  if (Array.isArray(clusterData)) {
    endpoints = clusterData;
  } else if (clusterData && typeof clusterData === "object") {
    for (const [epId, epData] of Object.entries(clusterData)) {
      if (typeof epData === "object" && epData !== null) {
        endpoints.push({ endpoint_id: parseInt(epId, 10) || 1, ...epData });
      }
    }
  }

  if (!endpoints.length) {
    host.innerHTML = '<div class="row"><div class="entity-sub">No clusters found</div></div>';
    return;
  }

  for (const ep of endpoints) {
    const epId = ep.endpoint_id ?? ep.id ?? 1;
    const inClusters = ep.clusters?.in || ep.in_clusters || [];
    const outClusters = ep.clusters?.out || ep.out_clusters || [];
    const allClusters = [
      ...inClusters.map(c => ({ ...c, cluster_type: "in" })),
      ...outClusters.map(c => ({ ...c, cluster_type: "out" })),
    ];

    if (endpoints.length > 1 || epId !== 1) {
      const epHeader = document.createElement("div");
      epHeader.className = "row";
      epHeader.style.background = "var(--surface)";
      epHeader.innerHTML = `<div class="entity-title"><i class="mdi mdi-chip"></i> Endpoint ${epId}</div>`;
      host.appendChild(epHeader);
    }

    for (const cluster of allClusters) {
      const cId = cluster.id ?? cluster.cluster_id ?? 0;
      const cName = cluster.name || ZCL_HELP[cId]?.name || `Cluster ${cId}`;
      const cType = cluster.cluster_type || "in";

      const header = document.createElement("div");
      header.className = "cluster-header";
      header.innerHTML =
        `<i class="mdi mdi-chevron-right"></i>` +
        `<span>${escapeHtml(cName)}</span>` +
        `<span class="entity-sub" style="margin-left:auto">0x${cId.toString(16).padStart(4, "0")} (${cType})</span>`;

      const attrs = document.createElement("div");
      attrs.className = "cluster-attrs";

      header.addEventListener("click", async () => {
        const wasOpen = attrs.classList.contains("open");
        attrs.classList.toggle("open");
        header.classList.toggle("open");
        if (!wasOpen && !attrs.dataset.loaded) {
          attrs.dataset.loaded = "1";
          attrs.innerHTML = '<div class="entity-sub">Loading attributes...</div>';
          try {
            const attrData = await api("api/zha-helper/attributes", {
              method: "POST",
              body: JSON.stringify({ ieee, endpoint_id: epId, cluster_id: cId, cluster_type: cType }),
            });
            renderClusterAttributes(attrs, ieee, epId, cId, cType, attrData.attributes || []);
          } catch (e) {
            attrs.innerHTML = `<div class="entity-sub">Error: ${escapeHtml(e.message)}</div>`;
          }
        }
      });

      host.appendChild(header);
      host.appendChild(attrs);
    }
  }
}

function renderClusterAttributes(container, ieee, endpointId, clusterId, clusterType, attributes) {
  container.innerHTML = "";
  const zclCluster = ZCL_HELP[clusterId];

  if (!attributes.length) {
    container.innerHTML = '<div class="entity-sub">No attributes</div>';
    return;
  }

  for (const attr of attributes) {
    const attrId = attr.id ?? attr.attribute ?? 0;
    const attrName = attr.name || zclCluster?.attrs?.[attrId]?.n || `attr_${attrId}`;
    const helpText = zclCluster?.attrs?.[attrId]?.h || "";

    const row = document.createElement("div");
    row.className = "attr-row";

    const nameEl = document.createElement("div");
    nameEl.className = "attr-name";
    nameEl.innerHTML = `<code>${escapeHtml(attrName)}</code> <span class="entity-sub">[${attrId}]</span>`;

    const valInput = document.createElement("input");
    valInput.className = "attr-val";
    valInput.placeholder = "\u2014";
    valInput.title = "Attribute value";

    const readBtn = document.createElement("button");
    readBtn.textContent = "Read";
    readBtn.addEventListener("click", async () => {
      readBtn.disabled = true;
      try {
        const res = await api("api/zha-helper/read-attribute", {
          method: "POST",
          body: JSON.stringify({ ieee, endpoint_id: endpointId, cluster_id: clusterId, cluster_type: clusterType, attribute: attrId }),
        });
        const keys = Object.keys(res);
        valInput.value = keys.length ? String(res[keys[0]]) : JSON.stringify(res);
      } catch (e) {
        valInput.value = "ERR";
        valInput.title = e.message;
      }
      readBtn.disabled = false;
    });

    const writeBtn = document.createElement("button");
    writeBtn.textContent = "Write";
    writeBtn.addEventListener("click", async () => {
      const raw = valInput.value.trim();
      if (raw === "") return;
      let value = isNaN(Number(raw)) ? raw : Number(raw);
      writeBtn.disabled = true;
      try {
        await api("api/zha-helper/write-attribute", {
          method: "POST",
          body: JSON.stringify({ ieee, endpoint_id: endpointId, cluster_id: clusterId, cluster_type: clusterType, attribute: attrId, value }),
        });
        writeBtn.textContent = "\u2713";
        setTimeout(() => { writeBtn.textContent = "Write"; }, 1500);
      } catch (e) {
        alert(`Write error: ${e.message}`);
      }
      writeBtn.disabled = false;
    });

    row.appendChild(nameEl);
    if (helpText) {
      const helpEl = document.createElement("span");
      helpEl.className = "attr-help";
      helpEl.textContent = helpText;
      helpEl.title = helpText;
      row.appendChild(helpEl);
    }
    row.appendChild(valInput);
    row.appendChild(readBtn);
    row.appendChild(writeBtn);
    container.appendChild(row);
  }
}

async function devHelperIdentify() {
  const dev = state.devHelperSelected;
  if (!dev) return;
  try {
    await api("api/zha-helper/command", {
      method: "POST",
      body: JSON.stringify({
        ieee: dev.ieee,
        endpoint_id: 1,
        cluster_id: 3,
        cluster_type: "in",
        command: 0,
        command_type: "server",
      }),
    });
    setStatus(`Identify sent to ${dev.name || dev.ieee}`, false);
  } catch (e) {
    setStatus(`Identify error: ${e.message}`, true);
  }
}

async function devHelperSaveKeepAlive() {
  const dev = state.devHelperSelected;
  if (!dev) return;
  const enabled = $("devhelper-keepalive-chk")?.checked || false;
  const interval = parseInt($("devhelper-keepalive-interval")?.value || "60", 10);
  try {
    await api("api/keepalive", {
      method: "POST",
      body: JSON.stringify({
        ieee: dev.ieee,
        endpoint_id: 1,
        interval_seconds: interval,
        enabled,
      }),
    });
    await loadDevHelperKeepAlive();
    setStatus(`Keep-alive ${enabled ? "enabled" : "disabled"} for ${dev.user_given_name || dev.name || dev.ieee}`, false);
  } catch (e) {
    setStatus(`Keep-alive error: ${e.message}`, true);
  }
}

async function loadDevHelperKeepAlive() {
  try {
    const data = await api("api/keepalive");
    state.devHelperKeepAlive = data.items || [];
  } catch (e) {
    state.devHelperKeepAlive = [];
  }
}

/* ========================================================
   CONTEXT MENU
   ======================================================== */
function initContextMenu() {
  const menu = $("ctx-menu");
  if (!menu) return;

  $("desktop").addEventListener("contextmenu", (e) => {
    if (e.target.closest(".window")) return;
    e.preventDefault();

    const clickedFolder = e.target.closest(".desktop-folder");
    menu.innerHTML = "";

    if (clickedFolder) {
      const fid = clickedFolder.dataset.folderId;
      menu.innerHTML =
        `<div class="ctx-item" data-action="folder-open" data-fid="${escapeHtml(fid)}"><i class="mdi mdi-folder-open"></i> Open</div>` +
        `<div class="ctx-item" data-action="folder-props" data-fid="${escapeHtml(fid)}"><i class="mdi mdi-cog"></i> Properties</div>` +
        `<div class="ctx-divider"></div>` +
        `<div class="ctx-item" data-action="folder-delete" data-fid="${escapeHtml(fid)}"><i class="mdi mdi-delete"></i> Delete</div>`;
    } else {
      menu.innerHTML =
        `<div class="ctx-item" data-action="new-folder"><i class="mdi mdi-folder-plus"></i> New Folder</div>` +
        `<div class="ctx-divider"></div>` +
        `<div class="ctx-item" data-action="refresh"><i class="mdi mdi-refresh"></i> Refresh</div>`;
    }

    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.classList.add("open");

    menu.querySelectorAll(".ctx-item").forEach((item) => {
      item.addEventListener("click", () => {
        const action = item.dataset.action;
        const fid = item.dataset.fid;
        menu.classList.remove("open");
        if (action === "new-folder") createFolder();
        else if (action === "refresh") load();
        else if (action === "folder-open") openFolderWindow(fid);
        else if (action === "folder-props") openFolderDialog(fid);
        else if (action === "folder-delete") { deleteFolder(fid); }
      }, { once: true });
    });
  });

  document.addEventListener("click", () => menu.classList.remove("open"));
}

/* ========================================================
   DESKTOP FOLDERS (localStorage)
   ======================================================== */
const FOLDER_ICONS = [
  "mdi-folder", "mdi-folder-star", "mdi-home", "mdi-lightbulb",
  "mdi-thermometer", "mdi-water-percent", "mdi-power-plug",
  "mdi-toggle-switch", "mdi-motion-sensor", "mdi-door",
  "mdi-window-open", "mdi-garage", "mdi-sofa", "mdi-bed",
  "mdi-silverware-fork-knife", "mdi-shower", "mdi-car",
  "mdi-tree", "mdi-cctv", "mdi-speaker", "mdi-desk-lamp",
  "mdi-fan", "mdi-fire", "mdi-snowflake",
];

function saveFolders() {
  localStorage.setItem("zha_desktop_folders", JSON.stringify(state.folders));
}

function createFolder() {
  const id = "folder-" + Date.now();
  state.folders.push({ id, name: "New Folder", icon: "mdi-folder", entities: [] });
  saveFolders();
  renderDesktopFolders();
  openFolderDialog(id);
}

function deleteFolder(folderId) {
  state.folders = state.folders.filter(f => f.id !== folderId);
  saveFolders();
  renderDesktopFolders();
}

function renderDesktopFolders() {
  document.querySelectorAll(".desktop-folder").forEach(el => el.remove());
  const container = $("desktop")?.querySelector(".desktop-icons");
  if (!container) return;

  for (const folder of state.folders) {
    const btn = document.createElement("button");
    btn.className = "desktop-folder";
    btn.dataset.folderId = folder.id;
    btn.innerHTML =
      `<div class="shortcut-icon"><i class="mdi ${folder.icon || "mdi-folder"}"></i></div>` +
      `<span>${escapeHtml(folder.name)}</span>`;
    btn.addEventListener("dblclick", () => openFolderWindow(folder.id));
    container.appendChild(btn);
    if (window._makeIconDraggable) window._makeIconDraggable(btn);
  }
}

function openFolderDialog(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  const dialog = $("folder-dialog");
  if (!dialog) return;

  $("folder-name-input").value = folder.name;

  /* Icon picker */
  const picker = $("icon-picker");
  picker.innerHTML = "";
  for (const ic of FOLDER_ICONS) {
    const item = document.createElement("div");
    item.className = `icon-picker-item${folder.icon === ic ? " selected" : ""}`;
    item.innerHTML = `<i class="mdi ${ic}"></i>`;
    item.addEventListener("click", () => {
      picker.querySelectorAll(".icon-picker-item").forEach(el => el.classList.remove("selected"));
      item.classList.add("selected");
    });
    picker.appendChild(item);
  }

  renderFolderEntities(folder);
  dialog.classList.add("open");

  $("folder-save-btn").onclick = () => {
    folder.name = $("folder-name-input").value.trim() || "Folder";
    const sel = picker.querySelector(".icon-picker-item.selected .mdi");
    if (sel) folder.icon = sel.className.replace("mdi ", "").trim();
    saveFolders();
    renderDesktopFolders();
    dialog.classList.remove("open");
  };
  $("folder-cancel-btn").onclick = () => dialog.classList.remove("open");
  $("folder-delete-btn").onclick = () => {
    deleteFolder(folderId);
    dialog.classList.remove("open");
  };
  $("folder-add-entity-btn").onclick = () => {
    const input = $("folder-entity-search");
    const val = input?.value?.trim();
    if (val && !folder.entities.includes(val)) {
      folder.entities.push(val);
      saveFolders();
      renderFolderEntities(folder);
      input.value = "";
    }
  };
}

function renderFolderEntities(folder) {
  const host = $("folder-entity-list");
  if (!host) return;
  host.innerHTML = "";
  for (const eid of folder.entities) {
    const row = document.createElement("div");
    row.className = "row";
    const title = document.createElement("div");
    title.className = "entity-sub";
    title.textContent = eid;
    row.appendChild(title);
    row.appendChild(makeBtn("\u00D7", () => {
      folder.entities = folder.entities.filter(e => e !== eid);
      saveFolders();
      renderFolderEntities(folder);
    }));
    host.appendChild(row);
  }
}

function openFolderWindow(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  const winId = `folder-win-${folderId}`;
  if ($(winId)) { WM.open(winId); return; }

  const allEntities = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
  const win = document.createElement("section");
  win.className = "window";
  win.id = winId;

  let entitiesHtml = "";
  for (const eid of folder.entities) {
    const entity = allEntities.find(e => e.entity_id === eid);
    if (entity) {
      const ic = entity.icon?.startsWith("mdi:") ? entity.icon.replace(":", "-") : "mdi-zigbee";
      const lqiStr = entity.lqi != null ? ` \u00B7 LQI: ${entity.lqi}` : "";
      entitiesHtml += `<div class="row"><div>` +
        `<div class="entity-title"><i class="mdi ${ic}"></i> ${escapeHtml(entity.friendly_name || eid)}</div>` +
        `<div class="entity-sub">${escapeHtml(eid)}${lqiStr}</div>` +
        `</div><span class="badge ${entity.state === "on" ? "on" : entity.state === "off" ? "off" : "mid"}">${escapeHtml(entity.state || "-")}</span></div>`;
    } else {
      entitiesHtml += `<div class="row"><div class="entity-sub">${escapeHtml(eid)} (not found)</div></div>`;
    }
  }

  win.innerHTML = `
    <div class="window-titlebar">
      <i class="mdi ${folder.icon || "mdi-folder"} win-icon"></i>
      <span class="win-title">${escapeHtml(folder.name)}</span>
      <div class="window-controls">
        <span class="win-ctrl minimize"><i class="mdi mdi-minus"></i></span>
        <span class="win-ctrl maximize"><i class="mdi mdi-checkbox-blank-outline"></i></span>
        <span class="win-ctrl close"><i class="mdi mdi-close"></i></span>
      </div>
    </div>
    <div class="window-body">
      <div class="list" style="flex:1;min-height:0">${entitiesHtml || '<div class="row"><div class="entity-sub">Empty folder. Right-click \u2192 Properties to add entities.</div></div>'}</div>
    </div>
    <div class="resize-handle"></div>`;

  $("desktop").appendChild(win);
  const offset = 20 + (state.deviceWinCount % 5) * 24;
  WM.defaults[winId] = { w: 480, h: 380, x: 200 + offset, y: 60 + offset };
  win.style.width = "480px";
  win.style.height = "380px";
  win.style.left = (200 + offset) + "px";
  win.style.top = (60 + offset) + "px";
  WM._makeDraggable(win);
  WM._makeResizable(win);

  win.querySelector(".win-ctrl.close").addEventListener("click", () => {
    WM.close(winId);
    setTimeout(() => { win.remove(); delete WM.defaults[winId]; }, 200);
  });
  win.querySelector(".win-ctrl.minimize").addEventListener("click", () => WM.close(winId));
  win.querySelector(".win-ctrl.maximize").addEventListener("click", () => WM.toggleMax(winId));
  win.addEventListener("mousedown", () => WM.focus(winId));

  WM.open(winId);
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
    alert("Please select two different switches");
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
    alert("Please select a sensor and a switch");
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

async function addBatteryAlert() {
  const threshold = parseInt($("battery-threshold")?.value || "20", 10);
  const notify_entity = $("battery-notify-entity")?.value || "";
  if (!notify_entity) {
    alert("Please select a notify entity (phone)");
    return;
  }
  await api("api/battery-alerts", {
    method: "POST",
    body: JSON.stringify({ threshold, notify_entity }),
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
    state.batteryItems = d.battery_devices || [];
    state.batteryAlerts = d.battery_alerts || [];
    state.notifyEntities = d.notify_entities || [];
    state.telemetrySpikes = d.telemetry?.spikes || [];
    state.telemetryEvents = d.telemetry?.events || [];
    state.commandLog = d.command_log || [];
    state.zhaDevicesFull = d.zha_devices_full || [];
    // Merge new errors; deduplicate by ts+type+ieee
    const prevKeys = new Set(state.zigbeeErrorLog.map(e => `${e.ts}|${e.type}|${e.ieee}`));
    for (const e of (d.zigbee_error_log || [])) {
      const k = `${e.ts}|${e.type}|${e.ieee}`;
      if (!prevKeys.has(k)) { state.zigbeeErrorLog.push(e); prevKeys.add(k); }
    }
    if (state.zigbeeErrorLog.length > 500) state.zigbeeErrorLog = state.zigbeeErrorLog.slice(-500);

    setSummary(d.summary || {});
    renderDelayChart(d.delay_samples || []);
    renderZhaList();
    renderSwitchList();
    renderMirrorRules(d.mirror_rules || []);
    renderSensorRules(d.sensor_rules || []);
    renderTelemetryChart(state.telemetrySpikes);
    renderTelemetryLog(state.telemetryEvents, state.commandLog);
    renderBatteryList();
    renderBatteryChart(state.batteryItems);
    renderBatteryAlerts(state.batteryAlerts);
    renderNetworkMap();
    renderZigbeeLogs();

    if (d.runtime?.last_error) {
      setStatus(`Error: ${d.runtime.last_error}`, true);
    } else {
      const errs = d.summary?.command_errors ?? 0;
      const statusText = `OK \u00B7 zigbee: ${d.summary?.zigbee_entities ?? 0} \u00B7 switches: ${d.summary?.switches_total ?? 0}${errs > 0 ? " \u00B7 errors: " + errs : ""}`;
      setStatus(statusText, errs > 0);
    }

    setText("updated-at", fmtNow());
  } catch (e) {
    setStatus(`Error: ${e.message}`, true);
  } finally {
    state.loading = false;
  }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  /* Boot window manager */
  WM.init();

  /* Init autocomplete fields */
  initAutocomplete("mirror-source", "mirror-source-list", () =>
    state.switchItems.map((s) => s.entity_id)
  );
  initAutocomplete("mirror-target", "mirror-target-list", () =>
    state.switchItems.map((s) => s.entity_id)
  );
  initAutocomplete("sensor-entity", "sensor-entity-list", () =>
    state.sensorItems.map((s) => s.entity_id)
  );
  initAutocomplete("sensor-switch", "sensor-switch-list", () =>
    state.switchItems.map((s) => s.entity_id)
  );
  initAutocomplete("battery-notify-entity", "battery-notify-entity-list", () =>
    state.notifyEntities.map((e) => e.entity_id)
  );

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
  $("battery-search")?.addEventListener("input", renderBatteryList);

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
  $("save-battery-alert-btn")?.addEventListener("click", async () => {
    try {
      await addBatteryAlert();
    } catch (e) {
      setStatus(`Battery alert: ${e.message}`, true);
    }
  });

  /* Clock */
  tickClock();
  setInterval(tickClock, 1000);

  /* Desktop context menu */
  initContextMenu();

  /* Desktop folders */
  renderDesktopFolders();

  /* Folder dialog autocomplete */
  initAutocomplete("folder-entity-search", "folder-entity-search-list", () =>
    [...state.zhaItems, ...state.switchItems, ...state.sensorItems]
      .map((e) => e.entity_id)
  );

  /* Network map mouse events */
  initNetworkMap();

  /* Zigbee Logs window */
  initZigbeeLogs();

  /* Telemetry split resize bar */
  initSplitResizeBar("telemetry-split-bar", "telemetry-top", "telemetry-bottom");

  /* Desktop icon drag & drop */
  initDesktopIconDrag();

  /* Device Helper */
  $("devhelper-search")?.addEventListener("input", renderDevHelperDevices);
  $("devhelper-identify-btn")?.addEventListener("click", devHelperIdentify);
  $("devhelper-save-keepalive-btn")?.addEventListener("click", devHelperSaveKeepAlive);

  /* Auto-open KPI window on start */
  WM.open("kpi-win");

  /* Initial data load */
  load();

  /* Auto-refresh every 5 seconds */
  state.refreshTimer = setInterval(() => load(), 5000);
});
