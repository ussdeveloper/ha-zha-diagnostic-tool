/* ===== ZHA Diagnostic Desktop — app.js (v0.9.13) ===== */
"use strict";

/* ---------- i18n helpers ---------- */
/** Returns the localised string for `key`; falls back to English, then the key itself. */
function t(key) {
  const lang = window.ZHA_LANG || "en";
  return ZHA_STRINGS?.[lang]?.[key] ?? ZHA_STRINGS?.en?.[key] ?? key;
}

/** Applies the active locale to all [data-i18n*] elements in the DOM. */
function applyLocale() {
  const dict = ZHA_STRINGS?.[window.ZHA_LANG || "en"] ?? ZHA_STRINGS?.en ?? {};
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const v = dict[el.dataset.i18n]; if (v != null) el.textContent = v;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const v = dict[el.dataset.i18nPlaceholder]; if (v != null) el.placeholder = v;
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const v = dict[el.dataset.i18nTitle]; if (v != null) el.title = v;
  });
}

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
  netMap: { zoom: 1, panX: 0, panY: 0, hoverNode: null },
  deviceWinCount: 0,
  devHelperDevices: [],
  devHelperSelected: null,
  devHelperKeepAlive: [],
  zigbeeErrorLog: [],
  zigbeeFullLog: [],
  zigbeeLogsPaused: false,
  zhaDevicesFull: [],
  zhaHealthIssues: [],
  unavailableDevices: [],
  deviceEntityMap: {},
  iconPositions: JSON.parse(localStorage.getItem("zha_icon_positions") || "{}"),
  batterySelected: new Set(),
  entityShortcuts: JSON.parse(localStorage.getItem("zha_entity_shortcuts") || "[]"),
  desktopSelected: new Set(),
  desktopClipboard: [],
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

  // Items may be plain strings OR {label, value} objects
  function _label(it) { return typeof it === "string" ? it : it.label; }
  function _value(it) { return typeof it === "string" ? it : it.value; }

  function render() {
    const q = input.value.trim().toLowerCase();
    const items = getItems();
    const filtered = q
      ? items.filter((it) => _label(it).toLowerCase().includes(q))
      : items;

    listEl.innerHTML = "";
    activeIdx = -1;

    if (!filtered.length) {
      listEl.classList.remove("open");
      return;
    }

    for (let i = 0; i < filtered.length && i < 80; i++) {
      const item = filtered[i];
      const label = _label(item);
      const value = _value(item);
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      div.dataset.value = value;
      if (q) {
        const idx = label.toLowerCase().indexOf(q);
        const before = label.slice(0, idx);
        const match = label.slice(idx, idx + q.length);
        const after = label.slice(idx + q.length);
        div.innerHTML =
          escapeHtml(before) +
          `<span class="ac-match">${escapeHtml(match)}</span>` +
          escapeHtml(after);
      } else {
        div.textContent = label;
      }
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = value;
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
      input.value = items[activeIdx].dataset.value || items[activeIdx].textContent;
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
    "lights-win":       { w: 520, h: 440, x: 250, y: 115 },
    "zigbeelogs-win":   { w: 780, h: 520, x: 180, y: 40  },
    "unavail-devs-win": { w: 600, h: 400, x: 220, y: 100 },
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

    /* Desktop shortcut icons -> open window on DOUBLE-click (single-click only selects) */
    document.querySelectorAll(".desktop-shortcut").forEach((btn) => {
      btn.addEventListener("dblclick", () => {
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
    if (id === "lights-win")
      renderLightsList();
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

      let _rafPending = false;
      const onMove = (e) => {
        const nw = Math.max(340, ow + e.clientX - sx);
        const nh = Math.max(180, oh + e.clientY - sy);
        win.style.width = nw + "px";
        win.style.height = nh + "px";
        if (!_rafPending) {
          _rafPending = true;
          requestAnimationFrame(() => {
            _rafPending = false;
            win.querySelectorAll("canvas").forEach(syncCanvas);
            WM._rerenderCharts(win.id);
          });
        }
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
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

/* ----- Entity drag helper (drag row → desktop/folder) ----- */
function _addEntityDrag(row, entity) {
  row.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "copy";
    const payload = {
      entity_id: entity.entity_id,
      friendly_name: entity.friendly_name || entity.entity_id,
      state: entity.state || "unknown",
      icon: entity.icon || "",
    };
    e.dataTransfer.setData("application/x-entity", JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", entity.entity_id);
    row.classList.add("row-dragging");
  });
  row.addEventListener("dragend", () => row.classList.remove("row-dragging"));
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
    row.draggable = true;
    _addEntityDrag(row, it);
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
    row.draggable = true;
    _addEntityDrag(row, it);
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

/* ----- Lights list ----- */
function renderLightsList() {
  const host = $("lights-list");
  if (!host) return;
  const q = ($("lights-search")?.value || "").trim().toLowerCase();
  host.innerHTML = "";

  const items = state.zhaItems
    .filter((it) => it.entity_id.startsWith("light."))
    .filter(
      (it) =>
        !q ||
        `${it.entity_id} ${it.friendly_name || ""} ${it.state || ""}`
          .toLowerCase()
          .includes(q)
    );

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "row";
    row.draggable = true;
    _addEntityDrag(row, it);
    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "entity-title";
    const icon = document.createElement("i");
    icon.className = "mdi mdi-lightbulb";
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
    right.appendChild(makeBtn("ON",  () => switchAction(it.entity_id, "turn_on")));
    right.appendChild(makeBtn("OFF", () => switchAction(it.entity_id, "turn_off")));
    right.appendChild(makeBtn("Toggle", () => switchAction(it.entity_id, "toggle"), "Toggle"));

    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);
  }

  if (!items.length) {
    host.innerHTML = '<div class="row"><div class="entity-sub">No light entities found</div></div>';
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
    const isSelected = state.batterySelected.has(it.entity_id);
    row.className = "row" + (isSelected ? " battery-selected" : "");
    row.style.cursor = "pointer";

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

    row.addEventListener("click", () => {
      if (state.batterySelected.has(it.entity_id)) {
        state.batterySelected.delete(it.entity_id);
      } else {
        state.batterySelected.add(it.entity_id);
      }
      renderBatteryList();
      renderBatteryChart(state.batteryItems);
    });

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

  /* If devices selected, show only those (with history); otherwise top 6 weakest */
  let withHistory;
  if (state.batterySelected.size > 0) {
    withHistory = items
      .filter((it) => state.batterySelected.has(it.entity_id) && it.battery_history && it.battery_history.length > 1)
      .sort((a, b) => (a.battery ?? 999) - (b.battery ?? 999));
  } else {
    withHistory = items
      .filter((it) => it.battery_history && it.battery_history.length > 1)
      .sort((a, b) => (a.battery ?? 999) - (b.battery ?? 999))
      .slice(0, 6);
  }

  if (!withHistory.length) {
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${12 * dpr}px Segoe UI`;
    if (state.batterySelected.size > 0) {
      ctx.fillText(t("bat.no_data_selected"), 14 * dpr, 22 * dpr);
    } else {
      ctx.fillText(t("bat.no_data"), 14 * dpr, 22 * dpr);
    }
    return;
  }

  const colors = ["#ff6b6b", "#fce100", "#60cdff", "#6ccb5f", "#da77f2", "#ff922b"];
  const legendH = 18 * dpr;
  const pad = { x: 36 * dpr, y: 24 * dpr, bottom: legendH + 10 * dpr };
  const iw = w - 2 * pad.x, ih = h - pad.y - pad.bottom;

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

  /* Legend at bottom */
  const legendY = h - 6 * dpr;
  let legendX = pad.x;
  ctx.font = `${9 * dpr}px Segoe UI`;
  withHistory.forEach((dev, di) => {
    const label = (dev.friendly_name || dev.entity_id).slice(0, 18);
    const textW = ctx.measureText(label).width;
    if (legendX + textW + 16 * dpr > w - pad.x) return; // skip if no room
    ctx.fillStyle = colors[di % colors.length];
    ctx.fillRect(legendX, legendY - 8 * dpr, 10 * dpr, 3 * dpr);
    ctx.fillStyle = "#ffffffde";
    ctx.fillText(label, legendX + 14 * dpr, legendY - 2 * dpr);
    legendX += textW + 24 * dpr;
  });
}

/* ----- Battery alerts list ----- */
function renderBatteryAlerts(alerts) {
  const host = $("battery-alerts-list");
  if (!host) return;
  host.innerHTML = "";
  if (!alerts || !alerts.length) {
    host.innerHTML = `<div class="row"><div class="entity-sub">${t("bat.no_alerts")}</div></div>`;
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
  const deviceIeee = entityItem.device_ieee || "";

  // Build a stable window key from device_ieee or entity slug
  const parts = eid.split(".", 2);
  const namePart = parts.length > 1 ? parts[1] : eid;
  let deviceKey = deviceIeee ? deviceIeee.replace(/:/g, "") : namePart;

  // Reuse existing window if device already open
  const existingId = `dev-${deviceKey.replace(/[^a-z0-9_]/gi, "_")}`;
  if ($(existingId)) { WM.open(existingId); WM.focus(existingId); return; }

  const winId = existingId;
  ++state.deviceWinCount;

  // All entities for this device — prefer device_ieee matching
  const allEntities = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
  let related;
  if (deviceIeee) {
    related = allEntities.filter(e => e.device_ieee && e.device_ieee === deviceIeee);
  } else {
    // Fallback: slug-based matching
    let slug = namePart;
    const suffixes = ["_temperature", "_humidity", "_battery", "_motion",
      "_occupancy", "_illuminance", "_power", "_energy", "_pressure",
      "_contact", "_vibration", "_rssi", "_lqi", "_linkquality",
      "_alarm", "_tamper", "_trigger", "_action", "_click", "_event",
      "_level", "_color_temp", "_brightness", "_voltage", "_current"];
    for (const sfx of suffixes) {
      if (namePart.endsWith(sfx)) { slug = namePart.slice(0, -sfx.length); break; }
    }
    related = allEntities.filter(e => {
      const ep = e.entity_id.split(".", 2);
      const en = ep.length > 1 ? ep[1] : ep[0];
      return en === slug || en.startsWith(slug + "_");
    });
  }
  const unique = [...new Map(related.map(e => [e.entity_id, e])).values()];
  if (!unique.find(e => e.entity_id === eid)) unique.unshift(entityItem);

  // Related telemetry — match by device_ieee or entity name part
  const matchKey = deviceIeee || namePart;
  const deviceEvents = state.telemetryEvents
    .filter(ev => (ev.summary || "").includes(matchKey) || (ev.entity_id || "").includes(matchKey))
    .slice(-30);
  const deviceCommands = state.commandLog
    .filter(cmd => cmd.entity_id && (cmd.entity_id.includes(matchKey) || (deviceIeee && unique.some(e => e.entity_id === cmd.entity_id))))
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
      // Sensor history chart button
      if (e.entity_id.startsWith("sensor.")) {
        const hBtn = document.createElement("button");
        hBtn.className = "sensor-history-btn";
        hBtn.title = "Show history chart";
        hBtn.innerHTML = '<i class="mdi mdi-chart-line"></i>';
        hBtn.addEventListener("click", (ev) => { ev.stopPropagation(); openSensorHistoryChart(e); });
        right.appendChild(hBtn);
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
   SENSOR HISTORY CHART
   ======================================================== */

const HISTORY_PERIODS = [
  { key: "24h", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "5mo", label: "5 months" },
];

function openSensorHistoryChart(entity) {
  const eid = entity.entity_id;
  const winId = `hist-${eid.replace(/[^a-z0-9_]/gi, "_")}`;
  if ($(winId)) { WM.open(winId); WM.focus(winId); return; }

  const friendly = entity.friendly_name || eid;
  const win = document.createElement("section");
  win.className = "window";
  win.id = winId;
  win.innerHTML = `
    <div class="window-titlebar">
      <i class="mdi mdi-chart-line win-icon"></i>
      <span class="win-title">${escapeHtml(friendly)} — History</span>
      <div class="window-controls">
        <span class="win-ctrl minimize"><i class="mdi mdi-minus"></i></span>
        <span class="win-ctrl maximize"><i class="mdi mdi-checkbox-blank-outline"></i></span>
        <span class="win-ctrl close"><i class="mdi mdi-close"></i></span>
      </div>
    </div>
    <div class="window-body history-chart-wrap">
      <div class="history-range-slider">
        <span id="${winId}-label">24h</span>
        <input type="range" id="${winId}-range" min="0" max="3" step="1" value="0">
      </div>
      <canvas id="${winId}-canvas" style="flex:1;width:100%;min-height:200px;border-radius:6px;background:#161b22"></canvas>
      <div id="${winId}-status" class="entity-sub" style="text-align:center"></div>
    </div>
    <div class="resize-handle"></div>`;

  $("desktop").appendChild(win);
  WM.defaults[winId] = { w: 560, h: 360, x: 200, y: 80 };
  win.style.width = "560px";
  win.style.height = "360px";
  win.style.left = "200px";
  win.style.top = "80px";
  WM._makeDraggable(win);
  WM._makeResizable(win);

  win.querySelector(".win-ctrl.close").addEventListener("click", () => {
    WM.close(winId);
    setTimeout(() => { win.remove(); delete WM.defaults[winId]; }, 200);
  });
  win.querySelector(".win-ctrl.minimize").addEventListener("click", () => WM.close(winId));
  win.querySelector(".win-ctrl.maximize").addEventListener("click", () => WM.toggleMax(winId));
  win.addEventListener("mousedown", () => WM.focus(winId));

  const rangeEl = $(`${winId}-range`);
  const labelEl = $(`${winId}-label`);
  const statusEl = $(`${winId}-status`);
  const canvas = $(`${winId}-canvas`);

  let currentPoints = [];

  const fetchAndDraw = async () => {
    const idx = parseInt(rangeEl.value, 10);
    const period = HISTORY_PERIODS[idx];
    labelEl.textContent = period.label;
    statusEl.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Loading...';
    try {
      const data = await api(`api/entity-history/${encodeURIComponent(eid)}?period=${period.key}`);
      currentPoints = data.points || [];
      statusEl.textContent = `${currentPoints.length} data points`;
      drawHistoryChart(canvas, currentPoints, friendly, entity.unit_of_measurement || "");
    } catch (e) {
      statusEl.textContent = `Error: ${e.message}`;
      currentPoints = [];
    }
  };

  rangeEl.addEventListener("input", fetchAndDraw);

  // Redraw on resize
  const ro = new ResizeObserver(() => {
    if (currentPoints.length) drawHistoryChart(canvas, currentPoints, friendly, entity.unit_of_measurement || "");
  });
  ro.observe(canvas);

  WM.open(winId);
  fetchAndDraw();
}

function drawHistoryChart(canvas, points, title, unit) {
  syncCanvas(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  if (w === 0 || h === 0) return;
  const dpr = window.devicePixelRatio || 1;

  ctx.clearRect(0, 0, w, h);
  // Background
  ctx.fillStyle = "#161b22";
  ctx.fillRect(0, 0, w, h);

  if (!points.length) {
    ctx.fillStyle = "#8b949e";
    ctx.font = `${12 * dpr}px Segoe UI, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("No data", w / 2, h / 2);
    return;
  }

  const pad = { top: 30 * dpr, right: 16 * dpr, bottom: 36 * dpr, left: 56 * dpr };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  // Parse timestamps and values
  const parsed = points.map(p => ({ t: new Date(p.ts).getTime(), v: p.v })).filter(p => !isNaN(p.t));
  if (!parsed.length) return;
  parsed.sort((a, b) => a.t - b.t);

  const tMin = parsed[0].t, tMax = parsed[parsed.length - 1].t;
  let vMin = Infinity, vMax = -Infinity;
  for (const p of parsed) { if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v; }
  if (vMin === vMax) { vMin -= 1; vMax += 1; }
  const vPad = (vMax - vMin) * 0.08;
  vMin -= vPad; vMax += vPad;
  const tRange = Math.max(tMax - tMin, 1);

  const toX = t => pad.left + ((t - tMin) / tRange) * plotW;
  const toY = v => pad.top + (1 - (v - vMin) / (vMax - vMin)) * plotH;

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const y = pad.top + (plotH / ySteps) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
  }

  // Y-axis labels
  ctx.fillStyle = "#8b949e";
  ctx.font = `${10 * dpr}px Segoe UI, sans-serif`;
  ctx.textAlign = "right";
  for (let i = 0; i <= ySteps; i++) {
    const y = pad.top + (plotH / ySteps) * i;
    const val = vMax - (i / ySteps) * (vMax - vMin);
    ctx.fillText(val.toFixed(1), pad.left - 6 * dpr, y + 3 * dpr);
  }

  // X-axis labels (time)
  ctx.textAlign = "center";
  const xSteps = Math.min(6, parsed.length);
  for (let i = 0; i <= xSteps; i++) {
    const t = tMin + (tRange / xSteps) * i;
    const x = toX(t);
    const d = new Date(t);
    const fmt = tRange > 86400000 * 2 ? `${d.getMonth() + 1}/${d.getDate()}` : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    ctx.fillText(fmt, x, h - pad.bottom + 16 * dpr);
  }

  // Gradient fill under curve
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  grad.addColorStop(0, "rgba(96,205,255,0.25)");
  grad.addColorStop(1, "rgba(96,205,255,0.02)");

  ctx.beginPath();
  ctx.moveTo(toX(parsed[0].t), pad.top + plotH);
  for (const p of parsed) ctx.lineTo(toX(p.t), toY(p.v));
  ctx.lineTo(toX(parsed[parsed.length - 1].t), pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  for (let i = 0; i < parsed.length; i++) {
    const x = toX(parsed[i].t), y = toY(parsed[i].v);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#60cdff";
  ctx.lineWidth = 2 * dpr;
  ctx.lineJoin = "round";
  ctx.stroke();

  // Dots for sparse data
  if (parsed.length < 60) {
    ctx.fillStyle = "#60cdff";
    for (const p of parsed) {
      ctx.beginPath();
      ctx.arc(toX(p.t), toY(p.v), 2.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Title + unit
  ctx.fillStyle = "#e6edf3";
  ctx.font = `bold ${12 * dpr}px Segoe UI, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(`${title}${unit ? " (" + unit + ")" : ""}`, pad.left, 18 * dpr);
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

  // Use full ZHA device list — filter coordinator (drawn as HUB at origin) and dedup by IEEE
  const _seenIeee = new Set();
  const devices = state.zhaDevicesFull
    .filter(d => !d.is_coordinator && d.device_type !== "Coordinator")
    .filter(d => {
      const k = d.ieee;
      if (!k || _seenIeee.has(k)) return false;
      _seenIeee.add(k);
      return true;
    });

  if (!devices.length) {
    ctx.restore();
    ctx.fillStyle = "#ffffff61";
    ctx.font = `${13 * dpr}px Segoe UI`;
    ctx.textAlign = "left";
    ctx.fillText(t("netmap.no_devices"), 20 * dpr, 30 * dpr);
    return;
  }

  // Build nodes with stable layout positions (force-directed seed)
  const _devIds = devices.map(d => d.ieee || "?").join(",");
  if (!nm.nodes || nm.nodesKey !== _devIds) {
    nm.nodesKey = _devIds;
    const count = devices.length;

    // Scale radii to available canvas area (world-space pixels)
    const canvasR = Math.min(w, h) * 0.42; // use 42% of smaller dimension for wider spread
    const baseR = Math.max(canvasR * 0.35, 100 * dpr);

    // Separate routers and end-devices for layered ring placement
    const routers = devices.filter(d => d.device_type === "Router" || (d.power_source_str || "").includes("Main"));
    const endDevices = devices.filter(d => !routers.includes(d));

    // Build neighbor lookup: ieee → set of neighbor ieee addresses
    const nbMap = new Map();
    for (const d of devices) {
      const nbs = (d.neighbors || []).map(nb => nb.ieee || nb.ieee_address).filter(Boolean);
      if (nbs.length) nbMap.set(d.ieee, nbs);
    }
    const hasTopology = nbMap.size > 0;

    // Simple seeded random for reproducible jitter
    let _seed = count * 7 + 31;
    const _srand = () => { _seed = (_seed * 16807 + 0) % 2147483647; return (_seed & 0xffff) / 0xffff; };

    const nodes = [];
    // Routers in inner ring
    const rCount = Math.max(routers.length, 1);
    const rAngleStep = (2 * Math.PI) / rCount;
    const rRadius = baseR + rCount * 12 * dpr;
    for (let i = 0; i < routers.length; i++) {
      const angle = i * rAngleStep - Math.PI / 2 + (_srand() - 0.5) * 0.25;
      const r = rRadius + (_srand() - 0.5) * 40 * dpr;
      nodes.push({ dev: routers[i], x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 });
    }

    // End-devices in outer ring — near parent router if topology available
    const eCount = Math.max(endDevices.length, 1);
    const eAngleStep = (2 * Math.PI) / eCount;
    const eRadius = rRadius + baseR * 0.9;
    for (let i = 0; i < endDevices.length; i++) {
      const dev = endDevices[i];
      const devNbs = nbMap.get(dev.ieee) || [];
      const parentNode = devNbs.length
        ? nodes.find(n => routers.includes(n.dev) && devNbs.includes(n.dev.ieee))
        : null;
      let x, y;
      if (parentNode && hasTopology) {
        const pAngle = Math.atan2(parentNode.y, parentNode.x) + (_srand() - 0.5) * 0.8;
        const pDist = Math.sqrt(parentNode.x ** 2 + parentNode.y ** 2) + (40 + _srand() * 50) * dpr;
        x = Math.cos(pAngle) * pDist;
        y = Math.sin(pAngle) * pDist;
      } else {
        const angle = i * eAngleStep - Math.PI / 2 + (_srand() - 0.5) * 0.3;
        const r = eRadius + (_srand() - 0.5) * 40 * dpr;
        x = Math.cos(angle) * r;
        y = Math.sin(angle) * r;
      }
      nodes.push({ dev, x, y, vx: 0, vy: 0 });
    }
    nm.nodes = nodes;
    nm._hasTopology = hasTopology;
    // Start animated force-directed settling
    nm.animFrame = 0;
    nm.settled = false;
    _startForceAnimation();
  }

  // Draw edges — coordinator lives at world-space (0,0); dedup symmetric pairs
  const _coordDev = state.zhaDevicesFull.find(d => d.is_coordinator || d.device_type === "Coordinator");
  // Viewport bounds for culling (world-space, generous margin for labels)
  const _vMinX = (-w/2 - nm.panX * dpr) / nm.zoom - 80*dpr;
  const _vMaxX = ( w/2 - nm.panX * dpr) / nm.zoom + 80*dpr;
  const _vMinY = (-h/2 - nm.panY * dpr) / nm.zoom - 80*dpr;
  const _vMaxY = ( h/2 - nm.panY * dpr) / nm.zoom + 80*dpr;
  // Edges fade when zoomed in — less noise, data in frame is more readable
  const _edgeAlpha = Math.max(0.18, Math.min(1.0, 1.0 / (nm.zoom * 0.7)));
  const _drawnEdges = new Set();
  for (const node of nm.nodes) {
    const lqi = _devLqi(node.dev);
    const lineColor = lqi > 180 ? "#6ccb5f" : lqi > 100 ? "#fce100" : "#ff6b6b";
    const neighbors = node.dev.neighbors || [];
    if (neighbors.length) {
      for (const nb of neighbors) {
        const nbIeee = nb.ieee || nb.ieee_address;
        if (!nbIeee) continue;
        const edgeKey = [node.dev.ieee, nbIeee].sort().join("|");
        if (_drawnEdges.has(edgeKey)) continue;
        _drawnEdges.add(edgeKey);
        const isCoordTarget = _coordDev?.ieee === nbIeee;
        const target = isCoordTarget ? null : nm.nodes.find(n => n.dev.ieee === nbIeee && n !== node);
        if (!target && !isCoordTarget) continue;
        const tx = isCoordTarget ? 0 : target.x;
        const ty = isCoordTarget ? 0 : target.y;
        const nbLqi = nb.lqi ?? 128;
        const edgeColor = nbLqi > 180 ? `rgba(108,203,95,${(0.45 * _edgeAlpha).toFixed(2)})`
          : nbLqi > 100 ? `rgba(252,225,0,${(0.35 * _edgeAlpha).toFixed(2)})`
          : `rgba(255,107,107,${(0.28 * _edgeAlpha).toFixed(2)})`;
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = (nbLqi > 180 ? 1.8 : nbLqi > 100 ? 1.2 : 0.8) * dpr;
        ctx.setLineDash(nbLqi > 180 ? [] : [4*dpr, 4*dpr]);
        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      // Fallback: line to coordinator (device has no neighbor data yet)
      ctx.globalAlpha = 0.35 * _edgeAlpha;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = (lqi > 180 ? 1.5 : 1) * dpr;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(node.x, node.y);
      ctx.stroke();
      ctx.globalAlpha = 1;
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
  ctx.fillText(t("netmap.hub"), 0, 3 * dpr);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = `${9 * dpr}px Segoe UI`;
  ctx.fillText(t("netmap.coord"), 0, -22 * dpr);

  // Draw device nodes
  for (const node of nm.nodes) {
    const dev = node.dev;
    // Viewport culling — skip nodes fully outside visible area
    if (node.x < _vMinX || node.x > _vMaxX || node.y < _vMinY || node.y > _vMaxY) continue;
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

    // Device name — dark pill background so label is readable over any edge/color
    const label = (dev.user_given_name || dev.name_by_user || dev.name || dev.ieee || "?").slice(0, 22);
    const labelY = node.y + radius + 12 * dpr;
    const _lPad = 3 * dpr;
    ctx.font = `${9.5 * dpr}px Segoe UI`;
    ctx.textAlign = "center";
    const _lW = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(13,17,23,0.72)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(node.x - _lW/2 - _lPad, labelY - 10*dpr, _lW + _lPad*2, 13*dpr, 3*dpr);
    else ctx.rect(node.x - _lW/2 - _lPad, labelY - 10*dpr, _lW + _lPad*2, 13*dpr);
    ctx.fill();
    ctx.fillStyle = "#ffffffde";
    ctx.fillText(label, node.x, labelY);

    // LQI badge — pill background
    if (lqi != null) {
      const lqiText = `LQI ${lqi}`;
      const lqiY = labelY + 11 * dpr;
      ctx.font = `bold ${8 * dpr}px Segoe UI`;
      const _lqiW = ctx.measureText(lqiText).width;
      ctx.fillStyle = "rgba(13,17,23,0.55)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(node.x - _lqiW/2 - _lPad, lqiY - 9*dpr, _lqiW + _lPad*2, 11*dpr, 3*dpr);
      else ctx.rect(node.x - _lqiW/2 - _lPad, lqiY - 9*dpr, _lqiW + _lPad*2, 11*dpr);
      ctx.fill();
      ctx.fillStyle = nodeColor;
      ctx.fillText(lqiText, node.x, lqiY);
    }

    // At high zoom: show model id below label
    if (nm.zoom > 2.5) {
      const model = (dev.model || dev.model_id || "").slice(0, 20);
      if (model) {
        const modelY = labelY + (lqi != null ? 22 : 12) * dpr;
        ctx.font = `${7.5 * dpr}px Segoe UI`;
        const _mW = ctx.measureText(model).width;
        ctx.fillStyle = "rgba(13,17,23,0.55)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(node.x - _mW/2 - _lPad, modelY - 8*dpr, _mW + _lPad*2, 10*dpr, 3*dpr);
        else ctx.rect(node.x - _mW/2 - _lPad, modelY - 8*dpr, _mW + _lPad*2, 10*dpr);
        ctx.fill();
        ctx.fillStyle = "rgba(96,205,255,0.8)";
        ctx.fillText(model, node.x, modelY);
      }
    }

    // Device type badge
    if (isRouter) {
      ctx.fillStyle = "rgba(96,205,255,0.7)";
      ctx.font = `${7.5 * dpr}px Segoe UI`;
      ctx.fillText("R", node.x, node.y + 3 * dpr);
    }

    // Hover highlight ring
    if (nm.hoverNode === node) {
      ctx.save();
      ctx.strokeStyle = "#60cdff";
      ctx.lineWidth = 2.5 * dpr;
      ctx.shadowColor = "#60cdff";
      ctx.shadowBlur = 12 * dpr;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 6 * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Hover tooltip (drawn in world space, after all nodes)
  if (nm.hoverNode) {
    const hn = nm.hoverNode;
    const dev = hn.dev;
    const tipLines = [
      dev.user_given_name || dev.name || dev.ieee || "?",
      `${dev.manufacturer || "?"} · ${dev.model || "?"}`,
      `IEEE: ${dev.ieee || "?"}  NWK: ${dev.nwk || "?"}`,
      `LQI: ${_devLqi(dev)}  Type: ${dev.device_type || "?"}`,
    ];
    const tipFont = 9.5 * dpr;
    ctx.font = `${tipFont}px Segoe UI`;
    const tipPad = 8 * dpr;
    const lineH = tipFont * 1.4;
    let maxW = 0;
    for (const l of tipLines) maxW = Math.max(maxW, ctx.measureText(l).width);
    const tipW = maxW + tipPad * 2;
    const tipH = tipLines.length * lineH + tipPad * 2;
    const tipX = hn.x + 18 * dpr;
    const tipY = hn.y - tipH / 2;
    ctx.fillStyle = "rgba(13,17,23,0.92)";
    ctx.strokeStyle = "rgba(96,205,255,0.4)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(tipX, tipY, tipW, tipH, 6 * dpr);
    else ctx.rect(tipX, tipY, tipW, tipH);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#ffffffdd";
    ctx.textAlign = "left";
    for (let i = 0; i < tipLines.length; i++) {
      ctx.fillStyle = i === 0 ? "#60cdff" : "#ffffffbb";
      if (i === 0) ctx.font = `bold ${tipFont}px Segoe UI`;
      else ctx.font = `${tipFont}px Segoe UI`;
      ctx.fillText(tipLines[i], tipX + tipPad, tipY + tipPad + lineH * (i + 0.8));
    }
  }

  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = `${9 * dpr}px Segoe UI`;
  ctx.textAlign = "left";
  const rCount = nm.nodes.filter(n => n.dev.device_type === "Router" || (n.dev.power_source_str || "").includes("Main")).length;
  const eCount = nm.nodes.length - rCount;
  ctx.fillText(`${nm.nodes.length} devices (${rCount} routers, ${eCount} end-devices)`, 12 * dpr, 42 * dpr);
  if (!nm._hasTopology) {
    ctx.fillStyle = "#fce100aa";
    ctx.fillText("⚠ No topology data — click Scan Network to read neighbor tables", 12 * dpr, 56 * dpr);
  }

  // Legend (top-right corner)
  const lx = w - 110 * dpr, ly = 16 * dpr;
  ctx.font = `${10 * dpr}px Segoe UI`;
  [["#6ccb5f", t("netmap.lqi_good")], ["#fce100", t("netmap.lqi_ok")], ["#ff6b6b", t("netmap.lqi_poor")]].forEach(([c, label], i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(lx, ly + i * 16 * dpr, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff99";
    ctx.textAlign = "left";
    ctx.fillText(label, lx + 8 * dpr, ly + 4 * dpr + i * 16 * dpr);
  });
  ctx.textAlign = "center";

  // ── Minimap (bottom-right overlay) ──────────────────
  if (nm.nodes && nm.nodes.length) {
    const dprMm = window.devicePixelRatio || 1;
    const mmW = Math.round(140 * dprMm), mmH = Math.round(90 * dprMm);
    const mmX = w - mmW - 8 * dprMm, mmY = h - mmH - 8 * dprMm;

    // Bounding box of all nodes in world space
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    for (const n of nm.nodes) {
      mnX = Math.min(mnX, n.x); mxX = Math.max(mxX, n.x);
      mnY = Math.min(mnY, n.y); mxY = Math.max(mxY, n.y);
    }
    // Ensure coordinator (0,0) in bounds
    mnX = Math.min(mnX, -20*dprMm); mxX = Math.max(mxX, 20*dprMm);
    mnY = Math.min(mnY, -20*dprMm); mxY = Math.max(mxY, 20*dprMm);
    const rangeX = mxX - mnX || 1, rangeY = mxY - mnY || 1;
    const mmPad = 8 * dprMm;
    const scaleX = (mmW - 2*mmPad) / rangeX;
    const scaleY = (mmH - 2*mmPad) / rangeY;
    const mmScale = Math.min(scaleX, scaleY);
    // Center of node bounding box maps to minimap center
    const cxWorld = (mnX + mxX) / 2, cyWorld = (mnY + mxY) / 2;
    const mmCX = mmX + mmW / 2, mmCY = mmY + mmH / 2;
    const toMmX = (wx) => mmCX + (wx - cxWorld) * mmScale;
    const toMmY = (wy) => mmCY + (wy - cyWorld) * mmScale;

    ctx.save();
    ctx.globalAlpha = 0.88;
    // Background
    ctx.fillStyle = "rgba(13,17,23,0.92)";
    ctx.strokeStyle = "rgba(96,205,255,0.25)";
    ctx.lineWidth = 1;
    if (ctx.roundRect) ctx.roundRect(mmX, mmY, mmW, mmH, 4 * dprMm);
    else ctx.rect(mmX, mmY, mmW, mmH);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mmX, mmY, mmW, mmH, 4 * dprMm);
    else ctx.rect(mmX, mmY, mmW, mmH);
    ctx.clip();

    // Edges
    for (const n of nm.nodes) {
      for (const nb of (n.dev.neighbors || [])) {
        const nbIeee = nb.ieee || nb.ieee_address;
        if (!nbIeee) continue;
        const isCoordNb = _coordDev?.ieee === nbIeee;
        const t = isCoordNb ? null : nm.nodes.find(x => x.dev.ieee === nbIeee && x !== n);
        if (!t && !isCoordNb) continue;
        const tX = isCoordNb ? 0 : t.x;
        const tY = isCoordNb ? 0 : t.y;
        ctx.strokeStyle = "rgba(96,205,255,0.22)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(toMmX(n.x), toMmY(n.y));
        ctx.lineTo(toMmX(tX), toMmY(tY));
        ctx.stroke();
      }
    }
    // Fallback: line to coordinator when no neighbor data
    const hasNeighbors = nm.nodes.some(n => (n.dev.neighbors || []).length > 0);
    if (!hasNeighbors) {
      for (const n of nm.nodes) {
        ctx.strokeStyle = "rgba(96,205,255,0.12)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(toMmX(0), toMmY(0));
        ctx.lineTo(toMmX(n.x), toMmY(n.y));
        ctx.stroke();
      }
    }
    // Nodes
    for (const n of nm.nodes) {
      const lqi = _devLqi(n.dev);
      ctx.fillStyle = lqi > 180 ? "#6ccb5f" : lqi > 100 ? "#fce100" : "#ff6b6b";
      ctx.beginPath();
      ctx.arc(toMmX(n.x), toMmY(n.y), 2 * dprMm, 0, Math.PI * 2);
      ctx.fill();
    }
    // Coordinator
    ctx.fillStyle = "#60cdff";
    ctx.beginPath();
    ctx.arc(toMmX(0), toMmY(0), 3 * dprMm, 0, Math.PI * 2);
    ctx.fill();

    // Viewport rect
    const dprV = window.devicePixelRatio || 1;
    const vpWorldLeft  = (-w/2 - nm.panX * dprV) / nm.zoom;
    const vpWorldRight = ( w/2 - nm.panX * dprV) / nm.zoom;
    const vpWorldTop   = (-h/2 - nm.panY * dprV) / nm.zoom;
    const vpWorldBot   = ( h/2 - nm.panY * dprV) / nm.zoom;
    ctx.strokeStyle = "rgba(96,205,255,0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(
      toMmX(vpWorldLeft), toMmY(vpWorldTop),
      (vpWorldRight - vpWorldLeft) * mmScale,
      (vpWorldBot - vpWorldTop) * mmScale
    );

    // Label
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = `${8 * dprMm}px Segoe UI`;
    ctx.textAlign = "left";
    ctx.fillText(t("netmap.minimap"), mmX + 3*dprMm, mmY + 9*dprMm);

    ctx.restore();
  }
  ctx.textAlign = "center";
}

function _startForceAnimation() {
  const nm = state.netMap;
  if (nm._animId) cancelAnimationFrame(nm._animId);
  nm.animFrame = 0;
  nm.settled = false;

  function tick() {
    if (!nm.nodes || nm.settled) return;
    const dpr = window.devicePixelRatio || 1;
    // Progressive damping: starts loose, tightens over time
    const progress = Math.min(nm.animFrame / 80, 1);
    const damping = 0.6 - progress * 0.25; // 0.6 → 0.35
    // Run iterations per frame (more early, fewer late)
    const iters = nm.animFrame < 30 ? 4 : 2;
    for (let i = 0; i < iters; i++) _forceStep(nm.nodes, dpr, damping);
    nm.animFrame++;
    renderNetworkMap();
    // Check convergence: total velocity
    let totalV = 0;
    for (const n of nm.nodes) totalV += Math.abs(n.vx) + Math.abs(n.vy);
    if (nm.animFrame > 200 || totalV < 0.3) {
      nm.settled = true;
      nm._animId = null;
      renderNetworkMap();
      return;
    }
    nm._animId = requestAnimationFrame(tick);
  }
  nm._animId = requestAnimationFrame(tick);
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

function _forceStep(nodes, dpr, damping) {
  const n = nodes.length;
  if (!n) return;
  // Minimum desired spacing — much wider to prevent label overlap
  const idealDist = Math.max(90, 160 - n * 0.6) * dpr;
  const repel = 5000 * dpr; // stronger repulsion
  const attractK = 0.012;
  const centerK = 0.0005; // very weak center gravity — just prevents infinite drift
  if (damping == null) damping = 0.5;

  for (const a of nodes) {
    a.vx *= damping; a.vy *= damping;
    // Very weak center gravity
    a.vx -= a.x * centerK;
    a.vy -= a.y * centerK;
    // Repulsion between all pairs
    for (const b of nodes) {
      if (a === b) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 1;
      const dist = Math.sqrt(d2);
      const nx = dx / dist, ny = dy / dist;
      // Coulomb-style repulsion
      a.vx += nx * repel / d2;
      a.vy += ny * repel / d2;
      // Hard push-apart if overlapping — very strong within idealDist
      if (dist < idealDist) {
        const push = (idealDist - dist) * 0.8;
        a.vx += nx * push;
        a.vy += ny * push;
      }
    }
    // Attraction to neighbors (only if topology data exists)
    const neighbors = a.dev.neighbors || [];
    for (const nb of neighbors) {
      const nbIeee = nb.ieee || nb.ieee_address;
      if (!nbIeee) continue;
      const target = nodes.find(t => t.dev.ieee === nbIeee && t !== a);
      if (!target) continue;
      const dx = target.x - a.x, dy = target.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy + 1);
      // Spring — attract when far from ideal distance
      if (dist > idealDist * 1.5) {
        const strength = attractK * (dist - idealDist);
        a.vx += (dx / dist) * strength;
        a.vy += (dy / dist) * strength;
      }
    }
  }
  const maxV = 20 * dpr;
  for (const a of nodes) {
    a.vx = Math.max(-maxV, Math.min(maxV, a.vx));
    a.vy = Math.max(-maxV, Math.min(maxV, a.vy));
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
    const rect = canvas.getBoundingClientRect();
    // Mouse position relative to canvas center (CSS pixels)
    const mx = e.clientX - rect.left - rect.width / 2;
    const my = e.clientY - rect.top - rect.height / 2;
    const oldZoom = nm.zoom;
    nm.zoom = Math.max(0.2, Math.min(8, nm.zoom * factor));
    const zRatio = nm.zoom / oldZoom;
    // Keep the world point under the cursor stationary
    nm.panX = mx * (1 - zRatio) + nm.panX * zRatio;
    nm.panY = my * (1 - zRatio) + nm.panY * zRatio;
    renderNetworkMap();
  }, { passive: false });

  let dragging = false, sx = 0, sy = 0, spx = 0, spy = 0;

  // Helper: convert CSS mouse coords → world space coords
  function _mouseToWorld(e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasX = (e.clientX - rect.left) * dpr;
    const canvasY = (e.clientY - rect.top) * dpr;
    const cw = canvas.width, ch = canvas.height;
    return {
      worldX: (canvasX - cw / 2 - nm.panX * dpr) / nm.zoom,
      worldY: (canvasY - ch / 2 - nm.panY * dpr) / nm.zoom,
      cssX: e.clientX - rect.left,
      cssY: e.clientY - rect.top,
      canvasW: rect.width,
      canvasH: rect.height,
      dpr,
    };
  }

  // Helper: check if click is on minimap area (bottom-right)
  function _isOnMinimap(cssX, cssY, canvasW, canvasH) {
    const mmW = 140, mmH = 90, mmPad = 8;
    return cssX >= canvasW - mmW - mmPad && cssY >= canvasH - mmH - mmPad;
  }

  // Helper: convert minimap CSS click → world coords, then pan there
  function _minimapClick(cssX, cssY, canvasW, canvasH) {
    if (!nm.nodes || !nm.nodes.length) return;
    const mmW = 140, mmH = 90, mmPad = 8;
    const mmX = canvasW - mmW - mmPad, mmY = canvasH - mmH - mmPad;
    // Normalized position within minimap (0..1)
    const nx = (cssX - mmX) / mmW;
    const ny = (cssY - mmY) / mmH;
    // Get world bounding box
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    const dpr = window.devicePixelRatio || 1;
    for (const n of nm.nodes) { mnX = Math.min(mnX, n.x); mxX = Math.max(mxX, n.x); mnY = Math.min(mnY, n.y); mxY = Math.max(mxY, n.y); }
    mnX = Math.min(mnX, -20*dpr); mxX = Math.max(mxX, 20*dpr);
    mnY = Math.min(mnY, -20*dpr); mxY = Math.max(mxY, 20*dpr);
    const cxW = (mnX + mxX) / 2, cyW = (mnY + mxY) / 2;
    const rangeX = mxX - mnX || 1, rangeY = mxY - mnY || 1;
    const mmInnerPad = 8;
    const scaleX = (mmW * dpr - 2*mmInnerPad*dpr) / rangeX;
    const scaleY = (mmH * dpr - 2*mmInnerPad*dpr) / rangeY;
    const mmScale = Math.min(scaleX, scaleY);
    // World coordinate that was clicked
    const targetWX = cxW + ((nx - 0.5) * mmW * dpr) / mmScale;
    const targetWY = cyW + ((ny - 0.5) * mmH * dpr) / mmScale;
    // Pan so that world point is at viewport center
    nm.panX = -targetWX * nm.zoom / dpr;
    nm.panY = -targetWY * nm.zoom / dpr;
    renderNetworkMap();
  }

  canvas.addEventListener("mousedown", (e) => {
    const m = _mouseToWorld(e);
    // If clicking on minimap, pan to that location
    if (_isOnMinimap(m.cssX, m.cssY, m.canvasW, m.canvasH)) {
      _minimapClick(m.cssX, m.cssY, m.canvasW, m.canvasH);
      return;
    }
    dragging = true;
    sx = e.clientX; sy = e.clientY;
    spx = nm.panX; spy = nm.panY;
    canvas.style.cursor = "grabbing";
  });
  document.addEventListener("mousemove", (e) => {
    if (dragging) {
      nm.panX = spx + (e.clientX - sx);
      nm.panY = spy + (e.clientY - sy);
      renderNetworkMap();
      return;
    }
    // Hover detection (only when not dragging)
    if (!nm.nodes || !nm.nodes.length) return;
    const rect = canvas.getBoundingClientRect();
    // Only handle if mouse is over the canvas
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
    const m = _mouseToWorld(e);
    const hitR = 20 * m.dpr / nm.zoom;
    let found = null;
    for (const node of nm.nodes) {
      const dx = node.x - m.worldX, dy = node.y - m.worldY;
      if (dx * dx + dy * dy < hitR * hitR) { found = node; break; }
    }
    if (found !== nm.hoverNode) {
      nm.hoverNode = found;
      canvas.style.cursor = found ? "pointer" : "grab";
      renderNetworkMap();
    }
  });
  document.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; canvas.style.cursor = nm.hoverNode ? "pointer" : "grab"; }
  });

  // Double-click: if on a node — open device window; otherwise reset view
  canvas.addEventListener("dblclick", (e) => {
    if (!nm.nodes || !nm.nodes.length) {
      nm.zoom = 1; nm.panX = 0; nm.panY = 0; nm.nodes = null;
      renderNetworkMap();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasX = (e.clientX - rect.left) * dpr;
    const canvasY = (e.clientY - rect.top)  * dpr;
    const cw = canvas.width, ch = canvas.height;
    // Convert canvas device pixels → world_dpr space
    const worldX = (canvasX - cw / 2 - nm.panX * dpr) / nm.zoom;
    const worldY = (canvasY - ch / 2 - nm.panY * dpr) / nm.zoom;
    // Hit radius: 24 CSS px converted to world_dpr space
    const hitR = 24 * dpr / nm.zoom;

    let hit = null;
    for (const node of nm.nodes) {
      const dx = node.x - worldX, dy = node.y - worldY;
      if (dx * dx + dy * dy < hitR * hitR) { hit = node; break; }
    }

    if (hit) {
      const dev = hit.dev;
      // Build a synthetic entity so openDeviceDetail can match related entities by name slug
      const rawName = dev.user_given_name || dev.name || dev.ieee || "device";
      const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      // Try to find an existing ZHA entity for this device
      const allItems = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
      let entity = allItems.find(e => {
        const n = (e.entity_id.split(".")[1] || "").toLowerCase();
        return n === slug || n.startsWith(slug + "_") || (slug.length >= 4 && n.startsWith(slug.slice(0, Math.max(4, slug.length - 2))));
      });
      if (!entity) {
        // Fallback: synthetic entity from device data
        const iconCls = dev.device_type === "Router" ? "mdi:router-wireless" : "mdi:zigbee";
        entity = {
          entity_id: `device.${slug}`,
          friendly_name: rawName,
          state: dev.available === false ? "unavailable" : "online",
          icon: iconCls,
          lqi: _devLqi(dev),
          _deviceRaw: dev,
        };
      }
      openDeviceDetail(entity);
    } else {
      nm.zoom = 1; nm.panX = 0; nm.panY = 0; nm.nodes = null; nm.nodesKey = null;
      renderNetworkMap();
    }
  });

  // Scan Network button — triggers ZHA topology scan (reads neighbor tables) then redraws
  const scanBtn = $("netmap-scan-btn");
  if (scanBtn) {
    scanBtn.addEventListener("click", async () => {
      scanBtn.disabled = true;
      scanBtn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Scanning topology\u2026';
      try {
        await api("api/network-scan", { method: "POST" });
        nm.nodes = null; nm.nodesKey = null;
        renderNetworkMap();
      } catch (_) { /* ignore */ }
      finally {
        scanBtn.disabled = false;
        scanBtn.innerHTML = '<i class="mdi mdi-radar"></i> Scan Network';
      }
    });
  }
}

/* ========================================================
   ZIGBEE LOGS WINDOW (Errors + Full Activity)
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
  // Mode: "all" shows full log, "errors" shows only error log
  const mode = state.zigbeeLogsMode || "all";

  let items;
  if (mode === "errors") {
    items = [...state.zigbeeErrorLog].reverse().filter(item => {
      const baseType = item.type?.startsWith("log_") ? "log_error" : item.type;
      if (!filters[baseType]) return false;
      if (q && !`${item.ieee || ""} ${item.type || ""} ${typeof item.raw === "string" ? item.raw : JSON.stringify(item.raw ?? "")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  } else {
    // Full log — show everything, apply search filter
    items = [...state.zigbeeFullLog].reverse().filter(item => {
      if (q && !`${item.ieee || ""} ${item.type || ""} ${item.subtype || ""} ${typeof item.raw === "string" ? item.raw : JSON.stringify(item.raw ?? "")}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  host.innerHTML = "";
  for (const item of items.slice(0, 500)) {
    const row = document.createElement("div");
    const isErr = ["timeout", "not_delivered", "lqi_critical"].includes(item.type) || item.type?.startsWith("log_");
    const typeKey = item.type || "unknown";
    row.className = `row ${isErr ? "zbl-" + (item.type?.startsWith("log_") ? "log_error" : item.type) : "zbl-event"}`;
    row.style.cursor = "pointer";

    const iconMap = {
      timeout: "mdi-timer-off",
      not_delivered: "mdi-message-off",
      lqi_critical: "mdi-signal-off",
      log_error: "mdi-alert",
      log_warning: "mdi-alert",
      log_critical: "mdi-alert-octagon",
      zha_event: "mdi-zigbee",
      state_changed: "mdi-swap-horizontal",
      system_log: "mdi-console-line",
    };
    const icon = iconMap[typeKey] || (isErr ? "mdi-bug" : "mdi-information");

    const labelParts = [typeKey];
    if (item.subtype && item.subtype !== typeKey) labelParts.push(item.subtype);

    row.innerHTML =
      `<div style="flex:1;min-width:0">` +
      `<div class="entity-title"><i class="mdi ${icon}"></i> ${escapeHtml(labelParts.join(" · "))}` +
      (item.ieee ? ` <span class="entity-sub" style="margin:0 0 0 6px">${escapeHtml(item.ieee)}</span>` : "") +
      `</div>` +
      `<div class="entity-sub">${escapeHtml(String(item.raw ?? "").slice(0, 120))}</div>` +
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
    const msg = mode === "errors"
      ? "No Zigbee errors logged yet. Errors appear when ZHA reports timeouts, delivery failures or LQI drops."
      : "No Zigbee activity logged yet. Events will appear as ZHA processes device communication.";
    host.innerHTML = `<div class="row"><div class="entity-sub">${msg}</div></div>`;
  }

  // Update mode toggle button states
  const allBtn = $("zbl-mode-all");
  const errBtn = $("zbl-mode-errors");
  if (allBtn) allBtn.classList.toggle("active", mode === "all");
  if (errBtn) errBtn.classList.toggle("active", mode === "errors");
}

function initZigbeeLogs() {
  state.zigbeeLogsMode = "all"; // default to full log
  $("zigbeelogs-search")?.addEventListener("input", renderZigbeeLogs);
  ["zbl-filter-timeout","zbl-filter-not_delivered","zbl-filter-lqi_critical","zbl-filter-log_error"]
    .forEach(id => $(id)?.addEventListener("change", renderZigbeeLogs));
  $("zigbeelogs-clear-btn")?.addEventListener("click", () => {
    state.zigbeeErrorLog = [];
    state.zigbeeFullLog = [];
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
  // Mode toggle buttons (All Activity / Errors Only)
  $("zbl-mode-all")?.addEventListener("click", () => {
    state.zigbeeLogsMode = "all";
    renderZigbeeLogs();
  });
  $("zbl-mode-errors")?.addEventListener("click", () => {
    state.zigbeeLogsMode = "errors";
    renderZigbeeLogs();
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
   HORIZONTAL SPLIT RESIZE BAR (DevHelper left/right panels)
   ======================================================== */
function initHResizeBar(barId, leftId, rightId) {
  const bar = $(barId);
  const left = $(leftId);
  const right = $(rightId);
  if (!bar || !left || !right) return;

  let dragging = false, startX = 0, startW = 0;

  bar.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startW = left.offsetWidth;
    bar.classList.add("dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const newW = Math.max(120, Math.min(500, startW + (e.clientX - startX)));
    left.style.width = newW + "px";
    left.style.flex = "none";
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
   ENTITY SHORTCUTS ON DESKTOP (drag from list → desktop/folder)
   ======================================================== */
function renderEntityShortcuts() {
  const desktop = $("desktop");
  if (!desktop) return;
  desktop.querySelectorAll(".desktop-entity-shortcut").forEach(el => el.remove());

  for (const sc of state.entityShortcuts) {
    const btn = document.createElement("button");
    btn.className = "desktop-shortcut desktop-entity-shortcut";
    btn.title = sc.entity_id;
    btn.dataset.win = "entity_" + sc.entity_id; // key for position save
    const iconCls = sc.icon?.startsWith("mdi:") ? sc.icon.replace(":", "-") : "mdi-zigbee";
    btn.innerHTML =
      `<div class="shortcut-icon"><i class="mdi ${iconCls}"></i></div>` +
      `<span>${escapeHtml((sc.friendly_name || sc.entity_id).slice(0, 18))}</span>`;
    btn.addEventListener("dblclick", () => {
      openDeviceDetail({
        entity_id: sc.entity_id,
        friendly_name: sc.friendly_name,
        state: sc.state,
        icon: sc.icon,
      });
    });
    // Restore saved position
    const savedPos = state.iconPositions["entity_" + sc.entity_id];
    if (savedPos) {
      btn.style.position = "fixed";
      btn.style.left = savedPos.x + "px";
      btn.style.top  = savedPos.y + "px";
    }
    desktop.appendChild(btn);
    window._makeIconDraggable?.(btn);
  }
}

function initEntityDropTargets() {
  const desktop = $("desktop");
  if (!desktop) return;

  // Helper: add entity shortcut
  function addEntityShortcut(payload, dropX, dropY) {
    const existing = state.entityShortcuts.findIndex(s => s.entity_id === payload.entity_id);
    const sc = { ...payload, position: { x: dropX - 41, y: dropY - 41 } };
    if (existing >= 0) {
      state.entityShortcuts[existing] = sc;
    } else {
      state.entityShortcuts.push(sc);
    }
    localStorage.setItem("zha_entity_shortcuts", JSON.stringify(state.entityShortcuts));
    // Also save position in iconPositions
    state.iconPositions["entity_" + payload.entity_id] = sc.position;
    localStorage.setItem("zha_icon_positions", JSON.stringify(state.iconPositions));
    renderEntityShortcuts();
  }

  desktop.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("application/x-entity")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    // Folder hover highlight
    const folder = e.target.closest(".desktop-folder");
    desktop.querySelectorAll(".desktop-folder.drag-over").forEach(f => {
      if (f !== folder) f.classList.remove("drag-over");
    });
    if (folder) folder.classList.add("drag-over");
  });

  desktop.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget || !e.relatedTarget.closest(".desktop-folder")) {
      desktop.querySelectorAll(".desktop-folder.drag-over").forEach(f => f.classList.remove("drag-over"));
    }
  });

  desktop.addEventListener("drop", (e) => {
    const raw = e.dataTransfer.getData("application/x-entity");
    if (!raw) return;
    // Remove folder hover highlights
    desktop.querySelectorAll(".desktop-folder.drag-over").forEach(f => f.classList.remove("drag-over"));

    let payload;
    try { payload = JSON.parse(raw); } catch { return; }

    e.preventDefault();

    // Check drop on folder
    const folder = e.target.closest(".desktop-folder");
    if (folder) {
      const folderId = folder.dataset.folderId;
      const folderData = state.folders.find(f => f.id == folderId);
      if (folderData) {
        if (!folderData.entities) folderData.entities = [];
        if (!folderData.entities.includes(payload.entity_id)) {
          folderData.entities.push(payload.entity_id);
          localStorage.setItem("zha_desktop_folders", JSON.stringify(state.folders));
          renderDesktopFolders();
          refreshFolderWindow(folderId);
        }
        return;
      }
    }

    // Drop anywhere on desktop → create entity shortcut at cursor position
    addEntityShortcut(payload, e.clientX, e.clientY);
  });
}

/* ========================================================
   DESKTOP ICON DRAG & SAVE POSITIONS
   ======================================================== */
function initDesktopIconDrag() {
  const desktop = $("desktop");
  if (!desktop) return;

  // Create lasso element
  let lassoEl = document.getElementById("desktop-lasso");
  if (!lassoEl) {
    lassoEl = document.createElement("div");
    lassoEl.id = "desktop-lasso";
    document.body.appendChild(lassoEl);
  }

  function getIconKey(btn) {
    return btn.dataset.win || btn.dataset.folderId || btn.textContent.trim().slice(0, 30);
  }

  function getAllIcons() {
    return Array.from(desktop.querySelectorAll(".desktop-shortcut, .desktop-folder"));
  }

  function setSelected(btn, on) {
    const key = getIconKey(btn);
    if (on) { btn.classList.add("icon-selected"); state.desktopSelected.add(key); }
    else     { btn.classList.remove("icon-selected"); state.desktopSelected.delete(key); }
  }

  function clearSelection() {
    getAllIcons().forEach(b => b.classList.remove("icon-selected"));
    state.desktopSelected.clear();
  }

  // Rubber-band lasso on the desktop background
  desktop.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".desktop-shortcut, .desktop-folder, .window, #taskbar")) return;

    const startX = e.clientX, startY = e.clientY;
    let lassoActive = false;
    if (!e.ctrlKey) clearSelection();

    const onMove = (e2) => {
      if (!lassoActive && Math.hypot(e2.clientX - startX, e2.clientY - startY) < 5) return;
      lassoActive = true;
      const x = Math.min(startX, e2.clientX);
      const y = Math.min(startY, e2.clientY);
      const w = Math.abs(e2.clientX - startX);
      const h = Math.abs(e2.clientY - startY);
      lassoEl.style.cssText = `display:block;left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
      const lr = { left: x, top: y, right: x + w, bottom: y + h };
      getAllIcons().forEach(icon => {
        const r = icon.getBoundingClientRect();
        const hit = !(r.right < lr.left || r.left > lr.right || r.bottom < lr.top || r.top > lr.bottom);
        if (e.ctrlKey) { if (hit) setSelected(icon, true); }
        else setSelected(icon, hit);
      });
    };

    const onUp = () => {
      lassoEl.style.display = "none";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });

  function makeIconDraggable(btn) {
    const key = getIconKey(btn);

    // Restore saved position
    const saved = state.iconPositions[key];
    if (saved) {
      btn.style.position = "fixed";
      btn.style.left = saved.x + "px";
      btn.style.top  = saved.y + "px";
    }

    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation(); // prevent lasso triggering

      const startX = e.clientX, startY = e.clientY;
      let moved = false;

      // Make sure this icon is included in selection
      if (!state.desktopSelected.has(key)) {
        if (!e.ctrlKey) clearSelection();
        setSelected(btn, true);
      }

      const onMove = (e2) => {
        if (!moved && Math.hypot(e2.clientX - startX, e2.clientY - startY) < 5) return;
        if (!moved) {
          moved = true;
          // Capture initial positions of all selected icons
          getAllIcons().filter(b => b.classList.contains("icon-selected")).forEach(b => {
            const r = b.getBoundingClientRect();
            b._ox = r.left; b._oy = r.top;
            b.style.position = "fixed";
            b.style.left = r.left + "px";
            b.style.top  = r.top  + "px";
            b.classList.add("dragging");
            b.style.zIndex = 10001;
          });
        }
        const dx = e2.clientX - startX;
        const dy = e2.clientY - startY;
        const dragging = getAllIcons().filter(b => b.classList.contains("dragging"));
        dragging.forEach(b => {
          b.style.left = Math.max(0, Math.min(window.innerWidth  - b.offsetWidth,  b._ox + dx)) + "px";
          b.style.top  = Math.max(0, Math.min(window.innerHeight - b.offsetHeight - 52, b._oy + dy)) + "px";
        });
        // Highlight folder under cursor — hide dragging icons first so elementFromPoint sees through them
        dragging.forEach(b => b.style.pointerEvents = "none");
        const hotEl = document.elementFromPoint(e2.clientX, e2.clientY);
        dragging.forEach(b => b.style.pointerEvents = "");
        const hoverFolder = hotEl?.closest(".desktop-folder");
        desktop.querySelectorAll(".desktop-folder.drag-over").forEach(f => {
          if (f !== hoverFolder) f.classList.remove("drag-over");
        });
        if (hoverFolder) hoverFolder.classList.add("drag-over");
      };

      const onUp = (e2) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        desktop.querySelectorAll(".desktop-folder.drag-over").forEach(f => f.classList.remove("drag-over"));

        if (!moved) {
          // Plain click — update selection only, suppress open
          if (e.ctrlKey) {
            if (state.desktopSelected.has(key) && state.desktopSelected.size > 1) setSelected(btn, false);
            else setSelected(btn, true);
          } else {
            clearSelection();
            setSelected(btn, true);
          }
          // Absorb the click event so WM.open doesn't fire on single-click
          document.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); }, { capture: true, once: true });
          return;
        }

        // We dragged — suppress the click the browser fires after mouseup
        document.addEventListener("click", (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); }, { capture: true, once: true });

        const draggingIcons = getAllIcons().filter(b => b.classList.contains("dragging"));

        // Hide dragging icons so elementFromPoint sees the folder below them
        draggingIcons.forEach(b => b.style.pointerEvents = "none");
        const hotEl = document.elementFromPoint(e2.clientX, e2.clientY);
        draggingIcons.forEach(b => b.style.pointerEvents = "");

        const targetFolder = hotEl?.closest(".desktop-folder");
        if (targetFolder) {
          const folderId = targetFolder.dataset.folderId;
          const folderData = state.folders.find(f => f.id == folderId);
          if (folderData) {
            if (!folderData.entities) folderData.entities = [];
            const removed = [];
            draggingIcons.forEach(b => {
              if (b.classList.contains("desktop-entity-shortcut")) {
                const eid = b.title;
                if (eid && !folderData.entities.includes(eid)) folderData.entities.push(eid);
                removed.push(eid);
              }
              b.classList.remove("dragging", "icon-selected");
              b.style.zIndex = "";
              b._ox = null; b._oy = null;
            });
            if (removed.length) {
              state.entityShortcuts = state.entityShortcuts.filter(s => !removed.includes(s.entity_id));
              removed.forEach(eid => delete state.iconPositions["entity_" + eid]);
              localStorage.setItem("zha_entity_shortcuts", JSON.stringify(state.entityShortcuts));
              localStorage.setItem("zha_icon_positions",   JSON.stringify(state.iconPositions));
              localStorage.setItem("zha_desktop_folders",  JSON.stringify(state.folders));
              state.desktopSelected.clear();
              renderEntityShortcuts();
              renderDesktopFolders();
              refreshFolderWindow(folderId);
            }
            return;
          }
        }

        // Save new positions for all dragged icons
        draggingIcons.forEach(b => {
          b.classList.remove("dragging");
          b.style.zIndex = "";
          const k = getIconKey(b);
          state.iconPositions[k] = { x: parseFloat(b.style.left), y: parseFloat(b.style.top) };
          b._ox = null; b._oy = null;
        });
        localStorage.setItem("zha_icon_positions", JSON.stringify(state.iconPositions));
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  getAllIcons().forEach(makeIconDraggable);
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

// Zigbee profile IDs → short name
const ZB_PROFILES = {
  260: "HA", 4: "IPMZ", 259: "SE", 263: "RS485", 264: "TA",
  49246: "ZLL", 41440: "GP", 49152: "GP",
};

// Zigbee device type IDs → description (ZHA profile 260 + common ZLL)
const ZB_DEVICE_TYPES = {
  // Switches / controls
  0x0000: "On/Off Switch", 0x0001: "Level Switch", 0x0002: "On/Off Output",
  0x0003: "Level Output", 0x0006: "Media Player", 0x0007: "Remote",
  0x000A: "Door Lock", 0x000B: "Door Lock Ctrl",
  // Lights
  0x0100: "On/Off Light", 0x0101: "Dimmable Light", 0x0102: "Color Light",
  0x0103: "Light Switch", 0x0104: "Dimmer Switch", 0x0105: "Color Dimmer",
  0x0110: "On/Off Plugin", 0x0111: "Dimmable Plugin", 0x0112: "Color Temp Plugin",
  // Shade / blind
  0x0200: "Shade", 0x0201: "Shade Controller", 0x0202: "Window Covering",
  0x0203: "Window Covering Ctrl",
  // HVAC
  0x0300: "Heating/Cooling", 0x0301: "Thermostat", 0x0302: "Temp Sensor",
  0x0303: "Pump", 0x0304: "Pump Ctrl", 0x0305: "Pressure Sensor",
  0x0306: "Flow Sensor",
  // IAS
  0x0400: "IAS Zone", 0x0401: "IAS Siren", 0x0402: "IAS Ancillary",
  0x0403: "IAS Control",
  // Generic
  0x0800: "Generic Controller", 0x0840: "Range Extender",
  0x0850: "Smart Plug", 0x0851: "Metering Device",
  // ZLL
  0xE000: "ZLL Non-Color Remote", 0xE001: "ZLL Non-Color Scene Remote",
  0xE002: "ZLL Color Remote", 0xE003: "ZLL Color Scene Remote",
  0xE004: "ZLL Non-Color Controller", 0xE005: "ZLL Non-Color Scene Ctrl",
  0xE006: "ZLL Color Controller", 0xE007: "ZLL Color Scene Ctrl",
};

function _zbDeviceTypeName(profile, devType) {
  if (devType == null) return null;
  const t = ZB_DEVICE_TYPES[devType];
  if (t) return t;
  return `0x${Number(devType).toString(16).padStart(4, "0")}`;
}

function _zbProfileName(profile) {
  if (profile == null) return null;
  return ZB_PROFILES[profile] || `0x${Number(profile).toString(16).padStart(4, "0")}`;
}

async function loadDevHelperDevices() {
  // Prefer already-fetched ZHA data (avoids extra WS round-trip)
  if (state.zhaDevicesFull.length) {
    state.devHelperDevices = state.zhaDevicesFull.filter(d => !d.is_coordinator && d.device_type !== "Coordinator");
    renderDevHelperDevices();
    return;
  }
  try {
    const data = await api("api/zha-helper/devices");
    state.devHelperDevices = (data.items || []).filter(d => !d.is_coordinator);
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
    const lqi = _devLqi(dev);
    const lqiColor = lqi > 180 ? "#6ccb5f" : lqi > 100 ? "#fce100" : "#ff6b6b";
    const avail = dev.available === false
      ? '<span style="color:#ff6b6b">● Unavailable</span>'
      : '<span style="color:#6ccb5f">● Available</span>';

    // Match related HA entities using device→entity registry map (most reliable),
    // then device_ieee field, then name slug fallback
    const allItems = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
    const registryEids = state.deviceEntityMap[dev.ieee] || [];
    let related = [];
    if (registryEids.length) {
      const eidSet = new Set(registryEids);
      related = allItems.filter(e => eidSet.has(e.entity_id));
      // Include any registry entity_ids not in our state lists (show as entity_id only)
      for (const eid of registryEids) {
        if (!related.some(e => e.entity_id === eid)) {
          related.push({ entity_id: eid, state: "?", icon: "mdi:zigbee", friendly_name: eid });
        }
      }
    }
    if (!related.length) {
      related = allItems.filter(e => e.device_ieee && e.device_ieee === dev.ieee);
    }
    if (!related.length) {
      const devName = (dev.user_given_name || dev.name || "").toLowerCase();
      const slug = devName.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (slug.length >= 3) {
        related = allItems.filter(e => {
          const n = (e.entity_id.split(".")[1] || "").toLowerCase();
          return n === slug || n.startsWith(slug + "_");
        });
      }
    }

    const entityRows = related.map(e => {
      const stateColor = e.state === "on" ? "#6ccb5f" : e.state === "unavailable" ? "#ff6b6b" : "#ffffff88";
      const icon = (e.icon || "mdi:zigbee").replace("mdi:", "");
      return `<div class="dev-entity-row" data-eid="${escapeHtml(e.entity_id)}" style="cursor:pointer">` +
        `<i class="mdi mdi-${escapeHtml(icon)}"></i> ` +
        `<span class="entity-sub">${escapeHtml(e.entity_id)}</span>` +
        `<span style="margin-left:auto;font-size:11px;color:${stateColor}">${escapeHtml(e.state || "?")}</span>` +
        `</div>`;
    }).join("");

    const quirk = dev.quirk_applied
      ? `<div class="dev-detail" style="color:#60cdff"><i class="mdi mdi-puzzle"></i> Quirk: ${escapeHtml(dev.quirk_class || "applied")}</div>`
      : "";

    info.innerHTML =
      `<div class="dev-name">${escapeHtml(dev.user_given_name || dev.name || dev.ieee)}</div>` +
      `<div class="dev-detail">${escapeHtml(dev.manufacturer || "?")} · ${escapeHtml(dev.model || "?")} · ${avail}</div>` +
      `<div class="dev-detail">IEEE: <code style="font-size:10px">${escapeHtml(dev.ieee || "")}</code> · NWK: ${escapeHtml(String(dev.nwk || "?"))} · LQI: <span style="color:${lqiColor};font-weight:bold">${lqi}</span></div>` +
      quirk +
      (entityRows ? `<div class="dev-detail" style="margin-top:6px;font-weight:600;color:#60cdff">HA Entities</div>${entityRows}` : `<div class="dev-detail" style="opacity:.5">No linked entities found</div>`);

    info.querySelectorAll(".dev-entity-row[data-eid]").forEach(row => {
      row.addEventListener("click", () => {
        const entity = allItems.find(e => e.entity_id === row.dataset.eid);
        if (entity) openDeviceDetail(entity);
      });
    });
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
  host.innerHTML = `<div class="row"><div class="entity-sub">${t("dh.loading_clusters")}</div></div>`;

  // Use embedded endpoint/cluster data from zha/devices (already fetched)
  // ZHA WS returns input_clusters/output_clusters (sometimes as hex strings)
  const fullDev = state.zhaDevicesFull.find(d => d.ieee === ieee);
  if (fullDev && fullDev.endpoints) {
    const _parseId = v => typeof v === "string" ? parseInt(v, v.startsWith("0x") ? 16 : 10) : Number(v);
    const epMap = {};
    for (const [epId, ep] of Object.entries(fullDev.endpoints)) {
      const rawIn = ep.input_clusters || ep.in_clusters || [];
      const rawOut = ep.output_clusters || ep.out_clusters || [];
      const inClusters = rawIn.map(c => {
        const cId = typeof c === "object" ? _parseId(c.id ?? c.cluster_id ?? 0) : _parseId(c);
        return { id: cId, name: (typeof c === "object" && c.name) || ZCL_HELP[cId]?.name || `Cluster 0x${cId.toString(16).padStart(4, "0")}`, cluster_type: "in" };
      });
      const outClusters = rawOut.map(c => {
        const cId = typeof c === "object" ? _parseId(c.id ?? c.cluster_id ?? 0) : _parseId(c);
        return { id: cId, name: (typeof c === "object" && c.name) || ZCL_HELP[cId]?.name || `Cluster 0x${cId.toString(16).padStart(4, "0")}`, cluster_type: "out" };
      });
      epMap[epId] = {
        endpoint_id: parseInt(epId, 10) || 1,
        in_clusters: inClusters,
        out_clusters: outClusters,
        profile_id: _parseId(ep.profile_id ?? 0),
        device_type: _parseId(ep.device_type ?? 0),
      };
    }
    renderDevHelperClusters(ieee, epMap);
    return;
  }

  // Fallback: fetch from API (uses zha/devices/clusters WS command)
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
    host.innerHTML = `<div class="row"><div class="entity-sub">${t("dh.no_clusters")}</div></div>`;
    return;
  }

  const _pid = v => {
    if (v == null) return null;
    if (typeof v === "number") return v;
    const s = String(v);
    return s.startsWith("0x") ? parseInt(s, 16) : parseInt(s, 10);
  };

  for (let epIdx = 0; epIdx < endpoints.length; epIdx++) {
    const ep = endpoints[epIdx];
    const epId = ep.endpoint_id ?? ep.id ?? 1;
    const inClusters = ep.clusters?.in || ep.in_clusters || ep.input_clusters || [];
    const outClusters = ep.clusters?.out || ep.out_clusters || ep.output_clusters || [];
    const allClusters = [
      ...inClusters.map(c => ({ ...c, cluster_type: c.cluster_type || "in" })),
      ...outClusters.map(c => ({ ...c, cluster_type: c.cluster_type || "out" })),
    ];

    // Endpoint header with profile/device type info
    const profileId = _pid(ep.profile_id);
    const devTypeId = _pid(ep.device_type);
    const profileName = _zbProfileName(profileId);
    const devTypeName = _zbDeviceTypeName(profileId, devTypeId);
    const inCount = inClusters.length;
    const outCount = outClusters.length;
    const badges = [profileName, devTypeName].filter(Boolean)
      .map(b => `<span class="ep-badge">${escapeHtml(b)}</span>`).join("");

    const epHeader = document.createElement("div");
    epHeader.className = "ep-header";
    epHeader.innerHTML =
      `<i class="mdi mdi-chip" style="color:var(--accent)"></i> ` +
      `<strong>Endpoint ${epId}</strong> ${badges} ` +
      `<span class="entity-sub" style="margin-left:6px">${inCount} in · ${outCount} out</span>`;
    host.appendChild(epHeader);

    if (!allClusters.length) {
      const noC = document.createElement("div");
      noC.className = "entity-sub";
      noC.style.padding = "6px 12px";
      noC.textContent = "No clusters on this endpoint";
      host.appendChild(noC);
      continue;
    }

    for (const cluster of allClusters) {
      const cId = _pid(cluster.id ?? cluster.cluster_id ?? 0) || 0;
      const cName = cluster.name || ZCL_HELP[cId]?.name || `Cluster 0x${cId.toString(16).padStart(4, "0")}`;
      const cType = cluster.cluster_type || "in";
      const cTypeIcon = cType === "in" ? "mdi-arrow-down-bold" : "mdi-arrow-up-bold";

      const wrapper = document.createElement("div");
      wrapper.className = "dh-cluster-wrap";

      const header = document.createElement("div");
      header.className = "cluster-header";
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.innerHTML =
        `<i class="mdi mdi-chevron-right"></i>` +
        `<span style="flex:1">${escapeHtml(cName)}</span>` +
        `<span class="entity-sub"><i class="mdi ${cTypeIcon}" style="font-size:11px"></i> ${cType} · 0x${cId.toString(16).padStart(4, "0")}</span>`;

      const content = document.createElement("div");
      content.className = "cluster-content";
      content.style.display = "none";

      let loaded = false;

      const doExpand = async () => {
        const isOpen = content.style.display !== "none";
        if (isOpen) {
          content.style.display = "none";
          header.querySelector(".mdi-chevron-right")?.style?.setProperty("transform", "rotate(0deg)");
          return;
        }
        content.style.display = "block";
        header.querySelector(".mdi-chevron-right")?.style?.setProperty("transform", "rotate(90deg)");

        if (!loaded) {
          loaded = true;
          content.innerHTML = '<div class="entity-sub" style="padding:8px 12px"><i class="mdi mdi-loading mdi-spin"></i> Loading attributes & commands...</div>';
          try {
            const reqBody = JSON.stringify({ ieee, endpoint_id: epId, cluster_id: cId, cluster_type: cType });
            const [attrData, cmdData] = await Promise.all([
              api("api/zha-helper/attributes", { method: "POST", body: reqBody }),
              api("api/zha-helper/commands", { method: "POST", body: reqBody }).catch(() => ({ commands: [] })),
            ]);
            content.innerHTML = "";
            _renderClusterContent(content, ieee, epId, cId, cType, attrData.attributes || [], cmdData.commands || []);
          } catch (e) {
            content.innerHTML = `<div class="entity-sub" style="padding:8px 12px;color:#ff6b6b"><i class="mdi mdi-alert"></i> Error: ${escapeHtml(e.message)}</div>`;
          }
        }
      };

      header.addEventListener("click", doExpand);
      header.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); doExpand(); } });

      wrapper.appendChild(header);
      wrapper.appendChild(content);
      host.appendChild(wrapper);
    }
  }
}

// Internal: render cluster content (commands + attributes) inside expanded section
function _renderClusterContent(container, ieee, endpointId, clusterId, clusterType, attributes, commands) {
  const zclCluster = ZCL_HELP[clusterId];

  // ── Commands Section ──
  let serverCmds = {};
  let clientCmds = {};
  if (Array.isArray(commands)) {
    for (const c of commands) {
      const ct = (c.type || "server").toLowerCase();
      const target = ct === "client" ? clientCmds : serverCmds;
      target[c.id ?? c.command_id ?? 0] = c.name || `cmd_${c.id}`;
    }
  } else if (commands && typeof commands === "object") {
    serverCmds = commands.server_commands || commands.server || {};
    clientCmds = commands.client_commands || commands.client || {};
  }
  const hasCommands = Object.keys(serverCmds).length + Object.keys(clientCmds).length > 0;

  if (hasCommands) {
    const cmdSection = document.createElement("div");
    cmdSection.className = "dh-cmd-section";

    const cmdTitle = document.createElement("div");
    cmdTitle.className = "dh-section-title";
    cmdTitle.innerHTML = '<i class="mdi mdi-console"></i> Commands';
    cmdSection.appendChild(cmdTitle);

    const renderCmdGroup = (cmds, cmdType) => {
      for (const [cmdId, cmdName] of Object.entries(cmds)) {
        const row = document.createElement("div");
        row.className = "dh-cmd-row";
        const label = document.createElement("span");
        label.className = "dh-cmd-label";
        label.innerHTML = `<code>${escapeHtml(String(cmdName))}</code> <span class="entity-sub">[${cmdId}] ${cmdType}</span>`;
        row.appendChild(label);
        const argsInput = document.createElement("input");
        argsInput.placeholder = "args JSON []";
        argsInput.className = "dh-cmd-input";
        row.appendChild(argsInput);
        const execBtn = document.createElement("button");
        execBtn.className = "accent dh-cmd-btn";
        execBtn.innerHTML = '<i class="mdi mdi-play"></i> Run';
        execBtn.addEventListener("click", async () => {
          execBtn.disabled = true;
          execBtn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i>';
          let args = [];
          const raw = argsInput.value.trim();
          if (raw) {
            try { args = JSON.parse(raw); } catch { args = [raw]; }
          }
          try {
            await api("api/zha-helper/command", {
              method: "POST",
              body: JSON.stringify({
                ieee, endpoint_id: endpointId, cluster_id: clusterId,
                cluster_type: clusterType, command: parseInt(cmdId, 10),
                command_type: cmdType, args,
              }),
            });
            execBtn.innerHTML = '<i class="mdi mdi-check"></i> OK';
            setTimeout(() => { execBtn.innerHTML = '<i class="mdi mdi-play"></i> Run'; }, 2000);
          } catch (e) {
            execBtn.innerHTML = '<i class="mdi mdi-alert"></i> Err';
            execBtn.title = e.message;
            setTimeout(() => { execBtn.innerHTML = '<i class="mdi mdi-play"></i> Run'; execBtn.title = ""; }, 3000);
          }
          execBtn.disabled = false;
        });
        row.appendChild(execBtn);
        cmdSection.appendChild(row);
      }
    };

    if (Object.keys(serverCmds).length) renderCmdGroup(serverCmds, "server");
    if (Object.keys(clientCmds).length) renderCmdGroup(clientCmds, "client");
    container.appendChild(cmdSection);
  }

  // ── Attributes Section ──
  const attrSection = document.createElement("div");
  attrSection.className = "dh-attr-section";

  const attrTitle = document.createElement("div");
  attrTitle.className = "dh-section-title";
  attrTitle.innerHTML = `<i class="mdi mdi-format-list-bulleted"></i> Attributes (${attributes.length})`;

  const readAllBtn = document.createElement("button");
  readAllBtn.innerHTML = '<i class="mdi mdi-download"></i> Read All';
  readAllBtn.className = "dh-read-all-btn";
  readAllBtn.addEventListener("click", async () => {
    readAllBtn.disabled = true;
    readAllBtn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i> Reading...';
    const rows = attrSection.querySelectorAll(".dh-attr-row");
    for (const row of rows) {
      const rb = row.querySelector(".dh-attr-read");
      if (rb) rb.click();
      await new Promise(r => setTimeout(r, 150)); // stagger reads
    }
    readAllBtn.disabled = false;
    readAllBtn.innerHTML = '<i class="mdi mdi-download"></i> Read All';
  });
  attrTitle.appendChild(readAllBtn);
  attrSection.appendChild(attrTitle);

  if (!attributes.length) {
    const noA = document.createElement("div");
    noA.className = "entity-sub";
    noA.style.padding = "4px 0";
    noA.textContent = "No attributes reported for this cluster";
    attrSection.appendChild(noA);
  }

  for (const attr of attributes) {
    const attrId = attr.id ?? attr.attribute ?? 0;
    const attrName = attr.name || zclCluster?.attrs?.[attrId]?.n || `attr_${attrId}`;
    const helpText = zclCluster?.attrs?.[attrId]?.h || "";

    const row = document.createElement("div");
    row.className = "dh-attr-row";

    const nameEl = document.createElement("div");
    nameEl.className = "dh-attr-name";
    nameEl.innerHTML = `<code>${escapeHtml(attrName)}</code> <span class="entity-sub">[${attrId}]</span>`;
    if (helpText) nameEl.title = helpText;

    const valInput = document.createElement("input");
    valInput.className = "dh-attr-val";
    valInput.placeholder = "—";

    const readBtn = document.createElement("button");
    readBtn.className = "dh-attr-read";
    readBtn.innerHTML = '<i class="mdi mdi-eye"></i>';
    readBtn.title = "Read attribute";
    readBtn.addEventListener("click", async () => {
      readBtn.disabled = true;
      readBtn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i>';
      try {
        const res = await api("api/zha-helper/read-attribute", {
          method: "POST",
          body: JSON.stringify({ ieee, endpoint_id: endpointId, cluster_id: clusterId, cluster_type: clusterType, attribute: attrId }),
        });
        const keys = Object.keys(res);
        valInput.value = keys.length ? String(res[keys[0]]) : JSON.stringify(res);
        valInput.style.color = "#6ccb5f";
        setTimeout(() => { valInput.style.color = ""; }, 2000);
      } catch (e) {
        valInput.value = "ERR";
        valInput.title = e.message;
        valInput.style.color = "#ff6b6b";
      }
      readBtn.disabled = false;
      readBtn.innerHTML = '<i class="mdi mdi-eye"></i>';
    });

    const writeBtn = document.createElement("button");
    writeBtn.className = "dh-attr-write";
    writeBtn.innerHTML = '<i class="mdi mdi-pencil"></i>';
    writeBtn.title = "Write attribute";
    writeBtn.addEventListener("click", async () => {
      const raw = valInput.value.trim();
      if (raw === "" || raw === "ERR") return;
      let value = isNaN(Number(raw)) ? raw : Number(raw);
      writeBtn.disabled = true;
      writeBtn.innerHTML = '<i class="mdi mdi-loading mdi-spin"></i>';
      try {
        await api("api/zha-helper/write-attribute", {
          method: "POST",
          body: JSON.stringify({ ieee, endpoint_id: endpointId, cluster_id: clusterId, cluster_type: clusterType, attribute: attrId, value }),
        });
        writeBtn.innerHTML = '<i class="mdi mdi-check"></i>';
        setTimeout(() => { writeBtn.innerHTML = '<i class="mdi mdi-pencil"></i>'; }, 2000);
      } catch (e) {
        writeBtn.innerHTML = '<i class="mdi mdi-alert"></i>';
        writeBtn.title = `Write error: ${e.message}`;
        setTimeout(() => { writeBtn.innerHTML = '<i class="mdi mdi-pencil"></i>'; writeBtn.title = "Write attribute"; }, 3000);
      }
      writeBtn.disabled = false;
    });

    row.appendChild(nameEl);
    row.appendChild(valInput);
    row.appendChild(readBtn);
    row.appendChild(writeBtn);
    attrSection.appendChild(row);
  }

  container.appendChild(attrSection);
}

async function devHelperIdentify() {
  const dev = state.devHelperSelected;
  if (!dev) return;
  // Find the first endpoint that has Identify cluster (3) in input_clusters
  let epId = 1;
  if (dev.endpoints) {
    const _pid = v => typeof v === "string" ? parseInt(v, v.startsWith("0x") ? 16 : 10) : Number(v);
    for (const [eid, ep] of Object.entries(dev.endpoints)) {
      const inIds = (ep.input_clusters || ep.in_clusters || []).map(c => typeof c === "object" ? _pid(c.id ?? c.cluster_id ?? 0) : _pid(c));
      if (inIds.includes(3)) { epId = parseInt(eid, 10) || 1; break; }
    }
  }
  try {
    await api("api/zha-helper/command", {
      method: "POST",
      body: JSON.stringify({
        ieee: dev.ieee,
        endpoint_id: epId,
        cluster_id: 3,
        cluster_type: "in",
        command: 0,
        command_type: "server",
      }),
    });
    setStatus(`Identify sent to ${dev.name || dev.ieee} (EP ${epId})`, false);
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
    // Allow context menu inside folder windows, block other windows
    const closestWin = e.target.closest(".window");
    const folderWin = e.target.closest("[id^='folder-win-']");
    if (closestWin && !folderWin) return;
    e.preventDefault();

    const clickedFolder        = e.target.closest(".desktop-folder");
    const clickedEntityShortcut = e.target.closest(".desktop-entity-shortcut");
    // Detect if right-click is inside a folder window
    const clickedFolderItem    = folderWin ? e.target.closest(".folder-icon-item") : null;
    const insideFolderWin      = !!folderWin;
    const folderWinId          = folderWin ? folderWin.id.replace("folder-win-", "") : null;

    const hasSel = state.desktopSelected.size > 0;
    const hasClip = state.desktopClipboard.length > 0;

    const selLabel = hasSel ? ` (${state.desktopSelected.size})` : "";
    const pasteDisabled = hasClip ? "" : " ctx-item-disabled";

    const copyPaste =
      `<div class="ctx-divider"></div>` +
      `<div class="ctx-item" data-action="copy-selected"><i class="mdi mdi-content-copy"></i> Copy${selLabel}</div>` +
      `<div class="ctx-item${pasteDisabled}" data-action="paste" ${folderWinId ? `data-target-folder="${escapeHtml(folderWinId)}"` : ""}><i class="mdi mdi-content-paste"></i> Paste${insideFolderWin ? " here" : ""}</div>`;

    menu.innerHTML = "";
    if (insideFolderWin && clickedFolderItem) {
      // Right-clicked an entity inside a folder window
      const eid = clickedFolderItem.title;
      menu.innerHTML =
        `<div class="ctx-item" data-action="folder-entity-open" data-eid="${escapeHtml(eid)}"><i class="mdi mdi-open-in-app"></i> Open</div>` +
        `<div class="ctx-item" data-action="folder-entity-remove" data-eid="${escapeHtml(eid)}" data-fid="${escapeHtml(folderWinId)}"><i class="mdi mdi-minus-circle"></i> Remove from folder</div>` +
        copyPaste;
    } else if (insideFolderWin) {
      // Right-clicked empty space inside a folder window
      menu.innerHTML =
        `<div class="ctx-item" data-action="folder-props" data-fid="${escapeHtml(folderWinId)}"><i class="mdi mdi-cog"></i> Properties</div>` +
        copyPaste;
    } else if (clickedFolder) {
      const fid = clickedFolder.dataset.folderId;
      menu.innerHTML =
        `<div class="ctx-item" data-action="folder-open"   data-fid="${escapeHtml(fid)}"><i class="mdi mdi-folder-open"></i> Open</div>` +
        `<div class="ctx-item" data-action="folder-props"  data-fid="${escapeHtml(fid)}"><i class="mdi mdi-cog"></i> Properties</div>` +
        `<div class="ctx-divider"></div>` +
        `<div class="ctx-item" data-action="folder-delete" data-fid="${escapeHtml(fid)}"><i class="mdi mdi-delete"></i> Delete</div>` +
        copyPaste;
    } else if (clickedEntityShortcut) {
      const eid = clickedEntityShortcut.title;
      menu.innerHTML =
        `<div class="ctx-item" data-action="entity-open"   data-eid="${escapeHtml(eid)}"><i class="mdi mdi-open-in-app"></i> Open</div>` +
        `<div class="ctx-item" data-action="entity-remove" data-eid="${escapeHtml(eid)}"><i class="mdi mdi-link-off"></i> Remove Shortcut</div>` +
        copyPaste;
    } else {
      menu.innerHTML =
        `<div class="ctx-item" data-action="new-folder"><i class="mdi mdi-folder-plus"></i> New Folder</div>` +
        `<div class="ctx-divider"></div>` +
        `<div class="ctx-item" data-action="refresh"><i class="mdi mdi-refresh"></i> Refresh</div>` +
        copyPaste;
    }

    // Clamp menu inside viewport
    const menuX = Math.min(e.clientX, window.innerWidth  - 190);
    const menuY = Math.min(e.clientY, window.innerHeight - 200);
    menu.style.left = menuX + "px";
    menu.style.top  = menuY + "px";
    menu.dataset.dropX = e.clientX;
    menu.dataset.dropY = e.clientY;
    menu.classList.add("open");

    menu.querySelectorAll(".ctx-item:not(.ctx-item-disabled)").forEach((item) => {
      item.addEventListener("click", () => {
        const action = item.dataset.action;
        const fid    = item.dataset.fid;
        const eid    = item.dataset.eid;
        const targetFolder = item.dataset.targetFolder;
        menu.classList.remove("open");

        if (action === "new-folder")     createFolder();
        else if (action === "refresh")   load();
        else if (action === "folder-open")   openFolderWindow(fid);
        else if (action === "folder-props")  openFolderDialog(fid);
        else if (action === "folder-delete") deleteFolder(fid);
        else if (action === "folder-entity-open") {
          const allItems = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
          const entity = allItems.find(e => e.entity_id === eid);
          if (entity) openDeviceDetail(entity);
        }
        else if (action === "folder-entity-remove") {
          const folder = state.folders.find(f => f.id === fid);
          if (folder) {
            folder.entities = folder.entities.filter(e => e !== eid);
            saveFolders();
            refreshFolderWindow(fid);
          }
        }
        else if (action === "entity-open") {
          const sc = state.entityShortcuts.find(s => s.entity_id === eid);
          if (sc) openDeviceDetail(sc);
        }
        else if (action === "entity-remove") {
          state.entityShortcuts = state.entityShortcuts.filter(s => s.entity_id !== eid);
          delete state.iconPositions["entity_" + eid];
          localStorage.setItem("zha_entity_shortcuts", JSON.stringify(state.entityShortcuts));
          localStorage.setItem("zha_icon_positions",   JSON.stringify(state.iconPositions));
          renderEntityShortcuts();
        }
        else if (action === "copy-selected") {
          state.desktopClipboard = [];
          // Copy from desktop icons
          const d = $("desktop");
          d?.querySelectorAll(".desktop-shortcut.icon-selected, .desktop-folder.icon-selected").forEach(b => {
            if (b.classList.contains("desktop-entity-shortcut")) {
              const sc = state.entityShortcuts.find(s => s.entity_id === b.title);
              if (sc) state.desktopClipboard.push({ type: "entity", data: { ...sc } });
            } else if (!b.classList.contains("desktop-folder")) {
              state.desktopClipboard.push({ type: "window", key: b.dataset.win });
            }
          });
          // Also copy entities from inside folder windows (folder-icon-item with .icon-selected or all if none selected)
          if (folderWin) {
            const selectedInFolder = folderWin.querySelectorAll(".folder-icon-item.icon-selected");
            const items = selectedInFolder.length ? selectedInFolder : (clickedFolderItem ? [clickedFolderItem] : []);
            items.forEach(fi => {
              const eId = fi.title;
              if (eId && !state.desktopClipboard.some(c => c.type === "entity" && c.data.entity_id === eId)) {
                const allItems = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
                const entity = allItems.find(e => e.entity_id === eId);
                state.desktopClipboard.push({ type: "entity", data: entity ? { ...entity } : { entity_id: eId } });
              }
            });
          }
        }
        else if (action === "paste") {
          if (targetFolder) {
            // Paste into a folder
            const folder = state.folders.find(f => f.id === targetFolder);
            if (folder) {
              state.desktopClipboard.forEach(item => {
                const eid = item.type === "entity" ? item.data.entity_id : null;
                if (eid && !folder.entities.includes(eid)) {
                  folder.entities.push(eid);
                }
              });
              saveFolders();
              refreshFolderWindow(targetFolder);
            }
          } else {
            // Paste on desktop
            const px = parseInt(menu.dataset.dropX) || 200;
            const py = parseInt(menu.dataset.dropY) || 200;
            state.desktopClipboard.forEach((item, i) => {
              if (item.type === "entity") {
                const sc  = { ...item.data, position: { x: px + i * 14, y: py + i * 14 } };
                const idx = state.entityShortcuts.findIndex(s => s.entity_id === sc.entity_id);
                if (idx >= 0) state.entityShortcuts[idx] = sc;
                else state.entityShortcuts.push(sc);
                state.iconPositions["entity_" + sc.entity_id] = sc.position;
              }
            });
            localStorage.setItem("zha_entity_shortcuts", JSON.stringify(state.entityShortcuts));
            localStorage.setItem("zha_icon_positions",   JSON.stringify(state.iconPositions));
            renderEntityShortcuts();
          }
        }
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

function _buildFolderIconGrid(folder) {
  const allEntities = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
  const grid = document.createElement("div");
  grid.className = "folder-icons-grid";

  if (!folder.entities || !folder.entities.length) {
    grid.innerHTML = '<div style="color:var(--text-tert);font-size:12px;padding:8px">Empty folder. Drag entity shortcuts here.</div>';
    return grid;
  }

  for (const eid of folder.entities) {
    const entity = allEntities.find(e => e.entity_id === eid);
    const btn = document.createElement("button");
    btn.className = "folder-icon-item";
    btn.title = eid;
    if (entity) {
      const ic = entity.icon?.startsWith("mdi:") ? entity.icon.replace(":", "-") : "mdi-zigbee";
      const label = (entity.friendly_name || eid).slice(0, 18);
      const st = entity.state || "?";
      btn.innerHTML =
        `<div class="fi-icon"><i class="mdi ${ic}"></i></div>` +
        `<span>${escapeHtml(label)}</span>` +
        `<div class="fi-state">${escapeHtml(st)}</div>`;
      btn.addEventListener("dblclick", () => openDeviceDetail(entity));
    } else {
      btn.innerHTML =
        `<div class="fi-icon"><i class="mdi mdi-help-circle"></i></div>` +
        `<span>${escapeHtml(eid.slice(0, 18))}</span>` +
        `<div class="fi-state">?</div>`;
    }
    grid.appendChild(btn);
  }
  return grid;
}

function refreshFolderWindow(folderId) {
  const winId = `folder-win-${folderId}`;
  const win = $(winId);
  if (!win) return;
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  const oldGrid = win.querySelector(".folder-icons-grid");
  if (oldGrid) oldGrid.replaceWith(_buildFolderIconGrid(folder));
}

function openFolderWindow(folderId) {
  const folder = state.folders.find(f => f.id === folderId);
  if (!folder) return;
  const winId = `folder-win-${folderId}`;
  if ($(winId)) { WM.open(winId); WM.focus(winId); return; }

  const win = document.createElement("section");
  win.className = "window";
  win.id = winId;

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
    <div class="window-body" style="padding:0;gap:0"></div>
    <div class="resize-handle"></div>`;

  win.querySelector(".window-body").appendChild(_buildFolderIconGrid(folder));

  $("desktop").appendChild(win);
  const offset = 20 + (state.deviceWinCount % 5) * 24;
  WM.defaults[winId] = { w: 500, h: 400, x: 200 + offset, y: 60 + offset };
  win.style.width = "500px";
  win.style.height = "400px";
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
    alert(t("msg.please_notify"));
    return;
  }
  await api("api/battery-alerts", {
    method: "POST",
    body: JSON.stringify({ threshold, notify_entity }),
  });
  await load();
}

/* ---------- ZHA Health Banner ---------- */
function renderZhaHealth() {
  const banner = $("zha-health-banner");
  if (!banner) return;
  const issues = state.zhaHealthIssues || [];
  if (!issues.length) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  banner.innerHTML =
    `<i class="mdi mdi-alert" style="color:var(--accent);margin-right:8px;flex-shrink:0"></i>` +
    `<div><strong style="color:var(--accent)">ZHA Configuration Issues detected:</strong>` +
    `<ul style="margin:2px 0 0 16px;padding:0">` +
    issues.map(i => {
      if (/\d+ Zigbee device\(s\) are currently unavailable/.test(i)) {
        return `<li><a href="#" onclick="event.preventDefault();openUnavailDevicesWin()" class="banner-link">${escapeHtml(i)}</a></li>`;
      }
      return `<li>${escapeHtml(i)}</li>`;
    }).join("") +
    `</ul></div>` +
    `<button style="margin-left:auto;flex-shrink:0" onclick="this.parentElement.style.display='none'" title="Dismiss">\u00D7</button>`;
}

function openUnavailDevicesWin() {
  const devs = state.unavailableDevices || [];
  const body = $("unavail-devs-body");
  if (body) {
    body.innerHTML = "";
    if (!devs.length) {
      body.innerHTML = `<div class="entity-sub" style="padding:12px">${t("dh.no_unavail")}</div>`;
    } else {
      for (const d of devs) {
        const row = document.createElement("div");
        row.className = "row";
        row.style.cssText = "padding:5px 10px;gap:8px;align-items:start;cursor:pointer";
        const lqiHtml = d.lqi != null
          ? `<span class="entity-sub" style="white-space:nowrap"> \u00B7 LQI ${d.lqi}</span>` : "";
        const modelHtml = d.model ? ` \u00B7 <span class="entity-sub">${escapeHtml(d.model)}</span>` : "";
        row.innerHTML =
          `<i class="mdi mdi-wifi-off" style="color:#ff6b6b;flex-shrink:0;margin-top:2px"></i>` +
          `<div style="flex:1;min-width:0">` +
            `<div class="entity-title">${escapeHtml(d.name)}</div>` +
            `<div class="entity-sub">${escapeHtml(d.ieee)}${modelHtml}</div>` +
          `</div>` +
          `<div style="text-align:right;flex-shrink:0;white-space:nowrap">` +
            `<span class="entity-sub">${escapeHtml(d.device_type || "")}</span>${lqiHtml}` +
          `</div>`;
        row.addEventListener("click", () => {
          // Find a matching entity by device_ieee, or build a synthetic entity item
          const allEntities = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
          const match = allEntities.find(e => e.device_ieee && e.device_ieee === d.ieee);
          if (match) {
            openDeviceDetail(match);
          } else {
            // Synthetic entity for this device
            openDeviceDetail({
              entity_id: `zha.${(d.name || d.ieee).replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
              friendly_name: d.name || d.ieee,
              device_ieee: d.ieee,
              state: "unavailable",
              icon: "mdi:wifi-off",
            });
          }
        });
        body.appendChild(row);
      }
    }
  }
  WM.open("unavail-devs-win");
}

function populateNotifySelect() {
  const sel = $("battery-notify-entity");
  if (!sel || sel.tagName !== "SELECT") return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">${t("bat.select_notify")}</option>` +
    (state.notifyEntities || []).map(e => {
      const label = e.friendly_name && e.friendly_name !== e.entity_id
        ? `${escapeHtml(e.friendly_name)} (${escapeHtml(e.entity_id)})`
        : escapeHtml(e.entity_id);
      return `<option value="${escapeHtml(e.entity_id)}">${label}</option>`;
    }).join("");
  if (prev) sel.value = prev;
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
    state.zhaHealthIssues = d.zha_health_issues || [];
    state.unavailableDevices = d.unavailable_devices || [];
    state.deviceEntityMap = d.device_entity_map || {};
    // Merge new errors; deduplicate by ts+type+ieee
    const prevKeys = new Set(state.zigbeeErrorLog.map(e => `${e.ts}|${e.type}|${e.ieee}`));
    for (const e of (d.zigbee_error_log || [])) {
      const k = `${e.ts}|${e.type}|${e.ieee}`;
      if (!prevKeys.has(k)) { state.zigbeeErrorLog.push(e); prevKeys.add(k); }
    }
    if (state.zigbeeErrorLog.length > 500) state.zigbeeErrorLog = state.zigbeeErrorLog.slice(-500);

    // Merge full zigbee log
    const prevFullKeys = new Set(state.zigbeeFullLog.map(e => `${e.ts}|${e.type}|${e.subtype}`));
    for (const e of (d.zigbee_full_log || [])) {
      const k = `${e.ts}|${e.type}|${e.subtype}`;
      if (!prevFullKeys.has(k)) { state.zigbeeFullLog.push(e); prevFullKeys.add(k); }
    }
    if (state.zigbeeFullLog.length > 2000) state.zigbeeFullLog = state.zigbeeFullLog.slice(-2000);

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
    renderLightsList();
    renderNetworkMap();
    // Refresh any open folder windows with current entity states
    state.folders.forEach(f => refreshFolderWindow(f.id));
    renderZigbeeLogs();
    renderZhaHealth();
    populateNotifySelect();

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
  applyLocale();

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
  $("lights-search")?.addEventListener("input", renderLightsList);
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

  /* DevHelper horizontal split resize bar */
  initHResizeBar("devhelper-resize-bar", "devhelper-left", "devhelper-right");

  /* Desktop icon drag & drop */
  initDesktopIconDrag();

  /* Entity shortcuts from localStorage — render on startup */
  renderEntityShortcuts();

  /* Entity drag-to-desktop/folder drop targets */
  initEntityDropTargets();

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
