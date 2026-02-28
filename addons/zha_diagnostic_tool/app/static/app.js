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
    "devhelper-win":    { w: 1100, h: 600, x: 80, y: 20  },
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

  // All entities for this device — prefer deviceEntityMap, then device_ieee, then slug
  const allEntities = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
  let related = [];
  // 1st priority: deviceEntityMap (ieee → [entity_id, ...]) from backend registries
  if (deviceIeee && state.deviceEntityMap && state.deviceEntityMap[deviceIeee]) {
    const mapIds = new Set(state.deviceEntityMap[deviceIeee]);
    related = allEntities.filter(e => mapIds.has(e.entity_id));
  }
  // 2nd priority: match by device_ieee field on entities
  if (!related.length && deviceIeee) {
    related = allEntities.filter(e => e.device_ieee && e.device_ieee === deviceIeee);
  }
  // 3rd fallback: slug-based matching
  if (!related.length) {
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
    const canvasR = Math.min(w, h) * 0.45; // use 45% of smaller dimension for wider spread
    const baseR = Math.max(canvasR * 0.4, 120 * dpr);

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
    const rRadius = baseR + rCount * 16 * dpr;
    for (let i = 0; i < routers.length; i++) {
      const angle = i * rAngleStep - Math.PI / 2 + (_srand() - 0.5) * 0.25;
      const r = rRadius + (_srand() - 0.5) * 40 * dpr;
      nodes.push({ dev: routers[i], x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0 });
    }

    // End-devices in outer ring — near parent router if topology available
    const eCount = Math.max(endDevices.length, 1);
    const eAngleStep = (2 * Math.PI) / eCount;
    const eRadius = rRadius + baseR * 1.1;
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
    const progress = Math.min(nm.animFrame / 120, 1);
    const damping = 0.65 - progress * 0.3; // 0.65 → 0.35
    // Run iterations per frame (more early, fewer late)
    const iters = nm.animFrame < 40 ? 5 : nm.animFrame < 80 ? 3 : 2;
    for (let i = 0; i < iters; i++) _forceStep(nm.nodes, dpr, damping);
    nm.animFrame++;
    renderNetworkMap();
    // Check convergence: total velocity
    let totalV = 0;
    for (const n of nm.nodes) totalV += Math.abs(n.vx) + Math.abs(n.vy);
    if (nm.animFrame > 300 || totalV < 0.2) {
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
  // Collision radius scales with node count — more nodes → more spacing needed
  const idealDist = Math.max(110, 200 - n * 0.5) * dpr;
  const repel = 8000 * dpr; // strong repulsion for readability
  const attractK = 0.008;
  const centerK = 0.0003; // very weak center gravity
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
      // Coulomb-style repulsion — falls off with distance squared
      a.vx += nx * repel / d2;
      a.vy += ny * repel / d2;
      // Hard collision boundary — strong push when overlapping idealDist
      if (dist < idealDist) {
        const overlap = idealDist - dist;
        const push = overlap * 1.2; // strong push-apart
        a.vx += nx * push;
        a.vy += ny * push;
      }
      // Soft separation for label readability — weaker push in 1x-2x idealDist range
      else if (dist < idealDist * 2) {
        const softPush = (idealDist * 2 - dist) * 0.15;
        a.vx += nx * softPush;
        a.vy += ny * softPush;
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
      // Spring — attract when far from ideal distance, repel when too close
      if (dist > idealDist * 1.8) {
        const strength = attractK * (dist - idealDist * 1.5);
        a.vx += (dx / dist) * strength;
        a.vy += (dy / dist) * strength;
      }
    }
  }
  const maxV = 25 * dpr;
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
      const ieee = dev.ieee || "";
      // Try to find a real entity for this device via deviceEntityMap (most reliable)
      const allItems = [...state.zhaItems, ...state.switchItems, ...state.sensorItems];
      let entity = null;

      // 1st: deviceEntityMap lookup
      if (ieee && state.deviceEntityMap && state.deviceEntityMap[ieee]) {
        const mapIds = state.deviceEntityMap[ieee];
        if (mapIds.length) entity = allItems.find(e => e.entity_id === mapIds[0]);
      }
      // 2nd: match by device_ieee field on entities
      if (!entity && ieee) {
        entity = allItems.find(e => e.device_ieee === ieee);
      }
      // 3rd: slug-based fallback
      if (!entity) {
        const rawName = dev.user_given_name || dev.name || dev.ieee || "device";
        const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        entity = allItems.find(e => {
          const n = (e.entity_id.split(".")[1] || "").toLowerCase();
          return n === slug || n.startsWith(slug + "_") || (slug.length >= 4 && n.startsWith(slug.slice(0, Math.max(4, slug.length - 2))));
        });
      }
      if (!entity) {
        // Fallback: synthetic entity from device data
        const rawName = dev.user_given_name || dev.name || dev.ieee || "device";
        const slug = rawName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        const iconCls = dev.device_type === "Router" ? "mdi:router-wireless" : "mdi:zigbee";
        entity = {
          entity_id: `device.${slug}`,
          friendly_name: rawName,
          state: dev.available === false ? "unavailable" : "online",
          icon: iconCls,
          lqi: _devLqi(dev),
          device_ieee: ieee,
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
   HORIZONTAL SPLIT RESIZE BAR (DevHelper columns)
   ======================================================== */
function initHResizeBar(barId, targetId, minW, maxW) {
  const bar = $(barId);
  const target = $(targetId);
  if (!bar || !target) return;

  let dragging = false, startX = 0, startW = 0;

  bar.addEventListener("mousedown", (e) => {
    dragging = true;
    startX = e.clientX;
    startW = target.offsetWidth;
    bar.classList.add("dragging");
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const newW = Math.max(minW, Math.min(maxW, startW + (e.clientX - startX)));
    target.style.width = newW + "px";
    target.style.flex = "none";
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
  // ── General clusters ──
  0: { name: "Basic", attrs: {
    0: { n: "zcl_version", h: "ZCL version" },
    1: { n: "application_version", h: "Application version" },
    2: { n: "stack_version", h: "Stack version" },
    3: { n: "hw_version", h: "Hardware version" },
    4: { n: "manufacturer_name", h: "Manufacturer name" },
    5: { n: "model_identifier", h: "Model ID" },
    6: { n: "date_code", h: "Date code" },
    7: { n: "power_source", h: "Power source: 0=Unknown, 1=Mains(single), 2=Mains(3-phase), 3=Battery, 4=DC, 5=EmergencyMains, 6=EmergencyMains+Batt" },
    8: { n: "generic_device_class", h: "Generic device class" },
    9: { n: "generic_device_type", h: "Generic device type" },
    10: { n: "product_code", h: "Product code" },
    11: { n: "product_url", h: "Product URL" },
    16: { n: "location_desc", h: "Location description (max 16 chars)" },
    17: { n: "physical_env", h: "Physical environment enum" },
    18: { n: "device_enabled", h: "0=Disabled, 1=Enabled" },
    19: { n: "alarm_mask", h: "Alarm mask bitmap" },
    20: { n: "disable_local_config", h: "Disable local config bitmap" },
    16384: { n: "sw_build_id", h: "Software build" },
  }},
  1: { name: "Power Configuration", attrs: {
    0: { n: "mains_voltage", h: "Mains voltage (100mV)" },
    1: { n: "mains_frequency", h: "Mains frequency (Hz/2)" },
    16: { n: "mains_alarm_mask", h: "Mains alarm mask" },
    17: { n: "mains_voltage_min_threshold", h: "Min voltage threshold (100mV)" },
    18: { n: "mains_voltage_max_threshold", h: "Max voltage threshold (100mV)" },
    19: { n: "mains_voltage_dwell_trip_point", h: "Dwell trip point" },
    32: { n: "battery_voltage", h: "Battery voltage (100mV units)" },
    33: { n: "battery_percentage_remaining", h: "Battery % (0-200, /2 for %)" },
    48: { n: "battery_manufacturer", h: "Battery manufacturer" },
    49: { n: "battery_size", h: "0=None, 1=Built-in, 2=Other, 3=AA, 4=AAA, 5=C, 6=D, 7=CR2, 8=CR123A, 255=Unknown" },
    50: { n: "battery_a_hr_rating", h: "Battery rating (mAh)" },
    51: { n: "battery_quantity", h: "Number of batteries" },
    52: { n: "battery_rated_voltage", h: "Rated voltage (100mV)" },
    53: { n: "battery_alarm_mask", h: "Battery alarm mask" },
    54: { n: "battery_voltage_min_threshold", h: "Min battery voltage (100mV)" },
    55: { n: "battery_voltage_threshold1", h: "Battery voltage threshold 1 (100mV)" },
    56: { n: "battery_voltage_threshold2", h: "Battery voltage threshold 2 (100mV)" },
    57: { n: "battery_voltage_threshold3", h: "Battery voltage threshold 3 (100mV)" },
    58: { n: "battery_percentage_min_threshold", h: "Min battery % threshold" },
    59: { n: "battery_percentage_threshold1", h: "Battery % threshold 1" },
    60: { n: "battery_percentage_threshold2", h: "Battery % threshold 2" },
    61: { n: "battery_percentage_threshold3", h: "Battery % threshold 3" },
    62: { n: "battery_alarm_state", h: "Battery alarm state bitmap" },
  }},
  2: { name: "Device Temperature", attrs: {
    0: { n: "current_temperature", h: "Current device temperature (\u00B0C)" },
    1: { n: "min_temp_experienced", h: "Min temp experienced (\u00B0C)" },
    2: { n: "max_temp_experienced", h: "Max temp experienced (\u00B0C)" },
    16: { n: "over_temp_total_dwell", h: "Over-temp total dwell time" },
    17: { n: "device_temp_alarm_mask", h: "Alarm mask bitmap" },
    18: { n: "low_temp_threshold", h: "Low temp threshold (\u00B0C)" },
    19: { n: "high_temp_threshold", h: "High temp threshold (\u00B0C)" },
    20: { n: "low_temp_dwell_trip_point", h: "Low temp dwell trip point" },
    21: { n: "high_temp_dwell_trip_point", h: "High temp dwell trip point" },
  }},
  3: { name: "Identify", attrs: {
    0: { n: "identify_time", h: "Write >0 to blink device (seconds)" },
  }},
  4: { name: "Groups", attrs: {
    0: { n: "name_support", h: "Group name support bitmap" },
  }},
  5: { name: "Scenes", attrs: {
    0: { n: "scene_count", h: "Number of scenes in table" },
    1: { n: "current_scene", h: "Currently active scene ID" },
    2: { n: "current_group", h: "Group ID of current scene" },
    3: { n: "scene_valid", h: "0=Invalid, 1=Valid" },
    4: { n: "name_support", h: "Scene name support bitmap" },
    5: { n: "last_configured_by", h: "IEEE of last configuring device" },
  }},
  6: { name: "On/Off", attrs: {
    0: { n: "on_off", h: "0=Off, 1=On" },
    16384: { n: "global_scene_control", h: "Global scene control" },
    16385: { n: "on_time", h: "On time (1/10 sec)" },
    16386: { n: "off_wait_time", h: "Off wait time (1/10 sec)" },
    16387: { n: "start_up_on_off", h: "Startup: 0=Off, 1=On, 2=Toggle, 255=Previous" },
  }},
  7: { name: "On/Off Switch Config", attrs: {
    0: { n: "switch_type", h: "0=Toggle, 1=Momentary, 2=Multifunction" },
    16: { n: "switch_actions", h: "0=On/Off, 1=Off/On, 2=Toggle" },
  }},
  8: { name: "Level Control", attrs: {
    0: { n: "current_level", h: "Brightness (0-254)" },
    1: { n: "remaining_time", h: "Remaining transition time (1/10 sec)" },
    2: { n: "min_level", h: "Minimum level" },
    3: { n: "max_level", h: "Maximum level" },
    15: { n: "options", h: "Level options bitmap" },
    16: { n: "on_off_transition_time", h: "Transition 1/10s" },
    17: { n: "on_level", h: "Level when turned on (0-254, 255=prev)" },
    18: { n: "on_transition_time", h: "On transition time (1/10 sec)" },
    19: { n: "off_transition_time", h: "Off transition time (1/10 sec)" },
    16384: { n: "start_up_current_level", h: "Startup level: 0=min, 255=prev" },
  }},
  9: { name: "Alarms", attrs: {
    0: { n: "alarm_count", h: "Number of active alarms" },
  }},
  10: { name: "Time", attrs: {
    0: { n: "time", h: "UTC time (seconds since 2000-01-01)" },
    1: { n: "time_status", h: "Time status bitmap" },
    2: { n: "time_zone", h: "Timezone offset (seconds from UTC)" },
    3: { n: "dst_start", h: "DST start time" },
    4: { n: "dst_end", h: "DST end time" },
    5: { n: "dst_shift", h: "DST shift (seconds)" },
    6: { n: "standard_time", h: "Standard time" },
    7: { n: "local_time", h: "Local time" },
    8: { n: "last_set_time", h: "Last set time" },
    9: { n: "valid_until_time", h: "Valid until time" },
  }},
  11: { name: "RSSI Location", attrs: {
    0: { n: "location_type", h: "Location type" },
    1: { n: "location_method", h: "Location method" },
    2: { n: "location_age", h: "Age of location data (sec)" },
    3: { n: "quality_measure", h: "Location quality measure" },
    4: { n: "number_of_devices", h: "Number of devices for location" },
  }},
  12: { name: "Analog Input", attrs: {
    28: { n: "description", h: "Description text" },
    55: { n: "max_present_value", h: "Maximum value" },
    69: { n: "min_present_value", h: "Minimum value" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    85: { n: "present_value", h: "Current value" },
    103: { n: "reliability", h: "Reliability enum" },
    106: { n: "resolution", h: "Resolution" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    117: { n: "engineering_units", h: "Engineering units enum" },
    256: { n: "application_type", h: "Application type" },
  }},
  13: { name: "Analog Output", attrs: {
    28: { n: "description", h: "Description text" },
    55: { n: "max_present_value", h: "Maximum value" },
    69: { n: "min_present_value", h: "Minimum value" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    85: { n: "present_value", h: "Current output value" },
    87: { n: "priority_array", h: "Priority array" },
    103: { n: "reliability", h: "Reliability enum" },
    104: { n: "relinquish_default", h: "Relinquish default value" },
    106: { n: "resolution", h: "Resolution" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    117: { n: "engineering_units", h: "Engineering units enum" },
    256: { n: "application_type", h: "Application type" },
  }},
  14: { name: "Analog Value", attrs: {
    28: { n: "description", h: "Description" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    85: { n: "present_value", h: "Current analog value" },
    87: { n: "priority_array", h: "Priority array" },
    103: { n: "reliability", h: "Reliability enum" },
    104: { n: "relinquish_default", h: "Relinquish default" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    117: { n: "engineering_units", h: "Engineering units" },
    256: { n: "application_type", h: "Application type" },
  }},
  15: { name: "Binary Input", attrs: {
    4: { n: "active_text", h: "Text for active state" },
    28: { n: "description", h: "Description" },
    46: { n: "inactive_text", h: "Text for inactive state" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    84: { n: "polarity", h: "0=Normal, 1=Reversed" },
    85: { n: "present_value", h: "0=Inactive, 1=Active" },
    103: { n: "reliability", h: "Reliability enum" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    256: { n: "application_type", h: "Application type" },
  }},
  16: { name: "Binary Output", attrs: {
    4: { n: "active_text", h: "Text for active state" },
    28: { n: "description", h: "Description" },
    46: { n: "inactive_text", h: "Text for inactive state" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    84: { n: "polarity", h: "0=Normal, 1=Reversed" },
    85: { n: "present_value", h: "0=Inactive, 1=Active" },
    87: { n: "priority_array", h: "Priority array" },
    103: { n: "reliability", h: "Reliability enum" },
    104: { n: "relinquish_default", h: "Relinquish default" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    256: { n: "application_type", h: "Application type" },
  }},
  17: { name: "Binary Value", attrs: {
    4: { n: "active_text", h: "Active state text" },
    28: { n: "description", h: "Description" },
    46: { n: "inactive_text", h: "Inactive state text" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    85: { n: "present_value", h: "0=Inactive, 1=Active" },
    87: { n: "priority_array", h: "Priority array" },
    103: { n: "reliability", h: "Reliability enum" },
    104: { n: "relinquish_default", h: "Relinquish default" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    256: { n: "application_type", h: "Application type" },
  }},
  18: { name: "Multistate Input", attrs: {
    14: { n: "state_text", h: "Array of state descriptions" },
    28: { n: "description", h: "Description" },
    74: { n: "number_of_states", h: "Number of states" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    85: { n: "present_value", h: "Current state (1-based)" },
    103: { n: "reliability", h: "Reliability enum" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    256: { n: "application_type", h: "Application type" },
  }},
  19: { name: "Multistate Output", attrs: {
    14: { n: "state_text", h: "Array of state descriptions" },
    28: { n: "description", h: "Description" },
    74: { n: "number_of_states", h: "Number of states" },
    81: { n: "out_of_service", h: "0=In service, 1=Out of service" },
    85: { n: "present_value", h: "Current state" },
    87: { n: "priority_array", h: "Priority array" },
    103: { n: "reliability", h: "Reliability enum" },
    104: { n: "relinquish_default", h: "Relinquish default" },
    111: { n: "status_flags", h: "Status flags bitmap" },
    256: { n: "application_type", h: "Application type" },
  }},
  20: { name: "Multistate Value", attrs: {
    14: { n: "state_text", h: "Array of state descriptions" },
    28: { n: "description", h: "Description" },
    74: { n: "number_of_states", h: "Number of states" },
    81: { n: "out_of_service", h: "Out of service" },
    85: { n: "present_value", h: "Current state" },
    87: { n: "priority_array", h: "Priority array" },
    103: { n: "reliability", h: "Reliability" },
    104: { n: "relinquish_default", h: "Relinquish default" },
    111: { n: "status_flags", h: "Status flags" },
    256: { n: "application_type", h: "Application type" },
  }},
  21: { name: "Commissioning", attrs: {
    0: { n: "short_address", h: "Short (NWK) address" },
    1: { n: "extended_pan_id", h: "Extended PAN ID" },
    2: { n: "pan_id", h: "PAN ID" },
    3: { n: "channel_mask", h: "Channel mask bitmap" },
    4: { n: "protocol_version", h: "Protocol version" },
    5: { n: "stack_profile", h: "Stack profile" },
    6: { n: "startup_control", h: "0=Part of network, 1=Form network, 2=Rejoin, 3=Start from scratch" },
    16: { n: "trust_center_address", h: "Trust center IEEE address" },
    18: { n: "network_key", h: "Network key" },
    19: { n: "use_insecure_join", h: "0=Secure, 1=Insecure join" },
    26: { n: "network_key_seq_num", h: "Network key sequence number" },
    27: { n: "network_key_type", h: "Network key type" },
    28: { n: "network_manager_address", h: "Network manager address" },
    48: { n: "scan_attempts", h: "Number of scan attempts" },
    49: { n: "time_between_scans", h: "Time between scans (ms)" },
    50: { n: "rejoin_interval", h: "Rejoin interval (sec)" },
    51: { n: "max_rejoin_interval", h: "Max rejoin interval (sec)" },
  }},
  25: { name: "OTA Upgrade", attrs: {
    0: { n: "upgrade_server_id", h: "OTA upgrade server IEEE" },
    1: { n: "file_offset", h: "Current file offset" },
    2: { n: "current_file_version", h: "Current firmware version" },
    3: { n: "current_zigbee_stack_version", h: "Current Zigbee stack version" },
    4: { n: "downloaded_file_version", h: "Downloaded firmware version" },
    5: { n: "downloaded_zigbee_stack_version", h: "Downloaded stack version" },
    6: { n: "image_upgrade_status", h: "0=Normal, 1=Download in progress, 2=Download complete, 3=Waiting to upgrade, 4=Count down, 5=Wait for more" },
    7: { n: "manufacturer_id", h: "Manufacturer ID" },
    8: { n: "image_type_id", h: "Image type ID" },
    9: { n: "min_block_period", h: "Min block request delay (ms)" },
    10: { n: "image_stamp", h: "Image stamp" },
    11: { n: "upgrade_activation_policy", h: "0=OTA server, 1=Out-of-band" },
    12: { n: "upgrade_timeout_policy", h: "0=Apply after timeout, 1=Don't apply" },
  }},
  26: { name: "Power Profile", attrs: {
    0: { n: "total_profile_num", h: "Total power profiles" },
    1: { n: "multiple_scheduling", h: "Multiple scheduling support" },
    2: { n: "energy_formatting", h: "Energy formatting" },
    3: { n: "energy_remote", h: "Energy remote control" },
    4: { n: "schedule_mode", h: "Schedule mode" },
  }},
  32: { name: "Poll Control", attrs: {
    0: { n: "check_in_interval", h: "Check-in (quarter-sec). Lower = responsive, more battery" },
    1: { n: "long_poll_interval", h: "Long poll (quarter-sec)" },
    2: { n: "short_poll_interval", h: "Short poll (quarter-sec)" },
    3: { n: "fast_poll_timeout", h: "Fast poll timeout (quarter-sec)" },
    4: { n: "check_in_interval_min", h: "Min check-in interval" },
    5: { n: "long_poll_interval_min", h: "Min long poll interval" },
    6: { n: "fast_poll_timeout_max", h: "Max fast poll timeout" },
  }},
  33: { name: "Green Power", attrs: {
    0: { n: "max_sink_table_entries", h: "Max sink table entries" },
    1: { n: "sink_table", h: "GP sink table" },
    2: { n: "communication_mode", h: "GP communication mode" },
    3: { n: "commissioning_exit_mode", h: "Commissioning exit mode" },
    4: { n: "commissioning_window", h: "Commissioning window (sec)" },
    5: { n: "security_level", h: "GP security level" },
    6: { n: "functionality", h: "GP functionality bitmap" },
    7: { n: "active_functionality", h: "Active GP functionality bitmap" },
  }},

  // ── Closures clusters ──
  256: { name: "Shade Configuration", attrs: {
    0: { n: "physical_closed_limit", h: "Physical closed limit" },
    1: { n: "motor_step_size", h: "Motor step size" },
    2: { n: "status", h: "Shade status" },
    16: { n: "closed_limit", h: "Closed limit" },
    18: { n: "mode", h: "Shade mode" },
  }},
  257: { name: "Door Lock", attrs: {
    0: { n: "lock_state", h: "0=Not fully locked, 1=Locked, 2=Unlocked, 255=Undefined" },
    1: { n: "lock_type", h: "Lock type enum" },
    2: { n: "actuator_enabled", h: "0=Disabled, 1=Enabled" },
    3: { n: "door_state", h: "0=Open, 1=Closed, 2=Error jammed, 3=Forced open, 4=Invalid, 255=Undefined" },
    4: { n: "door_open_events", h: "Door open events counter" },
    5: { n: "door_closed_events", h: "Door closed events counter" },
    6: { n: "open_period", h: "Open period (min)" },
    17: { n: "num_lock_records_supported", h: "Max lock records" },
    18: { n: "num_total_users_supported", h: "Max total users" },
    19: { n: "num_pin_users_supported", h: "Max PIN users" },
    20: { n: "num_rfid_users_supported", h: "Max RFID users" },
    21: { n: "num_weekday_schedules_per_user", h: "Weekday schedules/user" },
    22: { n: "num_yearday_schedules_per_user", h: "Year-day schedules/user" },
    23: { n: "num_holiday_schedules", h: "Holiday schedules" },
    24: { n: "max_pin_code_length", h: "Max PIN length" },
    25: { n: "min_pin_code_length", h: "Min PIN length" },
    26: { n: "max_rfid_code_length", h: "Max RFID code length" },
    27: { n: "min_rfid_code_length", h: "Min RFID code length" },
    32: { n: "enable_logging", h: "Enable event logging" },
    33: { n: "language", h: "Lock language" },
    35: { n: "auto_relock_time", h: "Auto re-lock time (sec)" },
    36: { n: "sound_volume", h: "0=Silent, 1=Low, 2=High" },
    37: { n: "operating_mode", h: "0=Normal, 1=Vacation, 2=Privacy, 3=No RF, 4=Passage" },
    41: { n: "enable_one_touch_locking", h: "One-touch locking" },
    48: { n: "wrong_code_entry_limit", h: "Max wrong code attempts" },
    49: { n: "user_code_temporary_disable_time", h: "Lockout time (sec)" },
    51: { n: "require_pi_nfor_rf_operation", h: "Require PIN for RF" },
  }},
  258: { name: "Window Covering", attrs: {
    0: { n: "window_covering_type", h: "0=Rollershade, 1=Rollershade2, 2=RollershadeExterior, 3=RollershadeExterior2, 4=Drapery, 5=Awning, 6=Shutter, 7=TiltBlindTiltOnly, 8=TiltBlindLiftTilt, 9=ProjectorScreen" },
    1: { n: "physical_closed_limit_lift", h: "Physical closed limit (lift)" },
    2: { n: "physical_closed_limit_tilt", h: "Physical closed limit (tilt)" },
    3: { n: "current_position_lift", h: "Current lift position" },
    4: { n: "current_position_tilt", h: "Current tilt position" },
    5: { n: "number_of_actuations_lift", h: "Lift actuations counter" },
    6: { n: "number_of_actuations_tilt", h: "Tilt actuations counter" },
    7: { n: "config_status", h: "Config/status bitmap" },
    8: { n: "current_position_lift_percentage", h: "Lift position % (0-100)" },
    9: { n: "current_position_tilt_percentage", h: "Tilt position % (0-100)" },
    16: { n: "installed_open_limit_lift", h: "Open limit lift" },
    17: { n: "installed_closed_limit_lift", h: "Closed limit lift" },
    18: { n: "installed_open_limit_tilt", h: "Open limit tilt" },
    19: { n: "installed_closed_limit_tilt", h: "Closed limit tilt" },
    23: { n: "mode", h: "Mode: 0=Normal, 1=LEDs, 2=Maintenance" },
  }},
  259: { name: "Barrier Control", attrs: {
    1: { n: "moving_state", h: "0=Stopped, 1=Closing, 2=Opening" },
    2: { n: "safety_status", h: "Safety status bitmap" },
    3: { n: "capabilities", h: "Capabilities bitmap" },
    10: { n: "barrier_position", h: "Position 0-100%" },
  }},

  // ── HVAC clusters ──
  512: { name: "Pump Config & Control", attrs: {
    0: { n: "max_pressure", h: "Max pressure (kPa*10)" },
    1: { n: "max_speed", h: "Max speed (RPM)" },
    2: { n: "max_flow", h: "Max flow (m\u00B3/h * 10)" },
    3: { n: "min_const_pressure", h: "Min constant pressure" },
    4: { n: "max_const_pressure", h: "Max constant pressure" },
    5: { n: "min_comp_pressure", h: "Min compensated pressure" },
    6: { n: "max_comp_pressure", h: "Max compensated pressure" },
    7: { n: "min_const_speed", h: "Min constant speed (RPM)" },
    8: { n: "max_const_speed", h: "Max constant speed (RPM)" },
    9: { n: "min_const_flow", h: "Min constant flow" },
    10: { n: "max_const_flow", h: "Max constant flow" },
    11: { n: "min_const_temp", h: "Min constant temp (\u00B0C*100)" },
    12: { n: "max_const_temp", h: "Max constant temp (\u00B0C*100)" },
    16: { n: "pump_status", h: "Pump status bitmap" },
    17: { n: "effective_operation_mode", h: "Effective operation mode" },
    18: { n: "effective_control_mode", h: "Effective control mode" },
    19: { n: "capacity", h: "Current capacity (m\u00B3/h * 10)" },
    20: { n: "speed", h: "Current speed (RPM)" },
    32: { n: "operation_mode", h: "0=Normal, 1=Min, 2=Max, 3=Local" },
    33: { n: "control_mode", h: "0=ConstantSpeed, 1=ConstantPressure, 2=ProportionalPressure, 3=ConstantFlow, 5=ConstantTemp, 7=Automatic" },
  }},
  513: { name: "Thermostat", attrs: {
    0: { n: "local_temperature", h: "Local temp (0.01\u00B0C)" },
    1: { n: "outdoor_temperature", h: "Outdoor temp (0.01\u00B0C)" },
    2: { n: "occupancy", h: "0=Unoccupied, 1=Occupied" },
    3: { n: "abs_min_heat_setpoint_limit", h: "Abs min heating setpoint" },
    4: { n: "abs_max_heat_setpoint_limit", h: "Abs max heating setpoint" },
    5: { n: "abs_min_cool_setpoint_limit", h: "Abs min cooling setpoint" },
    6: { n: "abs_max_cool_setpoint_limit", h: "Abs max cooling setpoint" },
    7: { n: "pi_cooling_demand", h: "PI cooling demand (0-100%)" },
    8: { n: "pi_heating_demand", h: "PI heating demand (0-100%)" },
    9: { n: "hvac_system_type_config", h: "HVAC system type config" },
    16: { n: "local_temperature_calibration", h: "Local temp calibration (0.1\u00B0C, -2.5 to +2.5)" },
    17: { n: "occupied_cooling_setpoint", h: "Cooling setpoint (0.01\u00B0C)" },
    18: { n: "occupied_heating_setpoint", h: "Heating setpoint (0.01\u00B0C)" },
    19: { n: "unoccupied_cooling_setpoint", h: "Unoccupied cooling setpoint" },
    20: { n: "unoccupied_heating_setpoint", h: "Unoccupied heating setpoint" },
    21: { n: "min_heat_setpoint_limit", h: "Min heating setpoint limit" },
    22: { n: "max_heat_setpoint_limit", h: "Max heating setpoint limit" },
    23: { n: "min_cool_setpoint_limit", h: "Min cooling setpoint limit" },
    24: { n: "max_cool_setpoint_limit", h: "Max cooling setpoint limit" },
    25: { n: "min_setpoint_dead_band", h: "Min setpoint dead band (0.1\u00B0C)" },
    27: { n: "control_sequence_of_operation", h: "0=Cooling, 1=CoolingWithReheat, 2=Heating, 3=HeatingWithReheat, 4=CoolingAndHeating, 5=CoolingAndHeatingWithReheat" },
    28: { n: "system_mode", h: "0=Off, 1=Auto, 3=Cool, 4=Heat, 5=EmergencyHeat, 6=Precooling, 7=FanOnly, 8=Dry, 9=Sleep" },
    30: { n: "running_mode", h: "Running mode" },
    41: { n: "running_state", h: "Running state bitmap" },
    48: { n: "setpoint_change_source", h: "Setpoint change source" },
    49: { n: "setpoint_change_amount", h: "Setpoint change amount (0.01\u00B0C)" },
    50: { n: "setpoint_change_source_timestamp", h: "Setpoint change timestamp" },
    52: { n: "occupied_setback", h: "Occupied setback (0.1\u00B0C)" },
    56: { n: "emergency_heat_delta", h: "Emergency heat delta (0.01\u00B0C)" },
    64: { n: "ac_type", h: "AC type enum" },
    65: { n: "ac_capacity", h: "AC capacity (BTU/h)" },
    66: { n: "ac_refrigerant_type", h: "AC refrigerant type" },
    67: { n: "ac_compressor_type", h: "AC compressor type" },
    68: { n: "ac_error_code", h: "AC error code bitmap" },
    69: { n: "ac_louver_position", h: "1=FullyClosed, 2=Fully open, 3=Quarter, 4=Half, 5=ThreeQuarters" },
    70: { n: "ac_coil_temperature", h: "AC coil temp (0.01\u00B0C)" },
    71: { n: "ac_capacity_format", h: "AC capacity format" },
  }},
  514: { name: "Fan Control", attrs: {
    0: { n: "fan_mode", h: "0=Off, 1=Low, 2=Medium, 3=High, 4=On, 5=Auto, 6=Smart" },
    1: { n: "fan_mode_sequence", h: "0=Low/Med/High, 1=Low/High, 2=Low/Med/High/Auto, 3=Low/High/Auto, 4=On/Auto" },
  }},
  515: { name: "Dehumidification Control", attrs: {
    0: { n: "relative_humidity", h: "Relative humidity (0.01%)" },
    1: { n: "dehumidification_cooling", h: "Dehumidification cooling (%)" },
    16: { n: "rh_dehumidification_setpoint", h: "RH dehumidification setpoint (%)" },
    17: { n: "relative_humidity_mode", h: "0=Measured locally, 1=Updated over network" },
    18: { n: "dehumidification_lockout", h: "0=Not allowed, 1=Allowed" },
    19: { n: "dehumidification_hysteresis", h: "Dehumidification hysteresis (%)" },
    20: { n: "dehumidification_max_cool", h: "Max cool (%)" },
    21: { n: "relative_humidity_display", h: "0=Not displayed, 1=Displayed" },
  }},
  516: { name: "Thermostat User Interface", attrs: {
    0: { n: "temperature_display_mode", h: "0=\u00B0C, 1=\u00B0F" },
    1: { n: "keypad_lockout", h: "0=NoLockout, 1=Level1, 2=Level2, 3=Level3, 4=Level4, 5=Level5" },
    2: { n: "schedule_programming_visibility", h: "0=Enabled, 1=Disabled" },
  }},

  // ── Lighting clusters ──
  768: { name: "Color Control", attrs: {
    0: { n: "current_hue", h: "Hue (0-254)" },
    1: { n: "current_saturation", h: "Saturation (0-254)" },
    2: { n: "remaining_time", h: "Remaining transition time (1/10 sec)" },
    3: { n: "current_x", h: "CIE x chromaticity (0-65279 \u2192 0.0-1.0)" },
    4: { n: "current_y", h: "CIE y chromaticity (0-65279 \u2192 0.0-1.0)" },
    5: { n: "drift_compensation", h: "Drift compensation" },
    6: { n: "compensation_text", h: "Compensation text" },
    7: { n: "color_temperature", h: "Color temp (mireds)" },
    8: { n: "color_mode", h: "0=HS, 1=XY, 2=CT" },
    15: { n: "options", h: "Color options bitmap" },
    16: { n: "enhanced_current_hue", h: "Enhanced hue (0-65535)" },
    17: { n: "enhanced_color_mode", h: "0=HS, 1=XY, 2=CT, 3=EnhancedHS" },
    18: { n: "color_loop_active", h: "0=Inactive, 1=Active" },
    19: { n: "color_loop_direction", h: "0=Decrement, 1=Increment" },
    20: { n: "color_loop_time", h: "Color loop time (sec)" },
    21: { n: "color_loop_start_enhanced_hue", h: "Loop start enhanced hue" },
    22: { n: "color_loop_stored_enhanced_hue", h: "Loop stored enhanced hue" },
    16384: { n: "color_capabilities", h: "Color capabilities bitmap" },
    16385: { n: "color_temp_physical_min_mireds", h: "Min color temp (mireds)" },
    16386: { n: "color_temp_physical_max_mireds", h: "Max color temp (mireds)" },
    16387: { n: "couple_color_temp_to_level_min_mireds", h: "Couple CT to level min mireds" },
    16400: { n: "start_up_color_temperature_mireds", h: "Startup color temp (mireds)" },
  }},
  769: { name: "Ballast Configuration", attrs: {
    0: { n: "physical_min_level", h: "Physical min level" },
    1: { n: "physical_max_level", h: "Physical max level" },
    16: { n: "min_level", h: "Min level" },
    17: { n: "max_level", h: "Max level" },
    20: { n: "intrinsic_ballast_factor", h: "Intrinsic ballast factor" },
    21: { n: "ballast_factor_adjustment", h: "Ballast factor adjustment" },
    32: { n: "lamp_quantity", h: "Number of lamps" },
    48: { n: "lamp_type", h: "Lamp type string" },
    49: { n: "lamp_manufacturer", h: "Lamp manufacturer" },
    50: { n: "lamp_rated_hours", h: "Lamp rated hours" },
    51: { n: "lamp_burn_hours", h: "Lamp burn hours" },
    52: { n: "lamp_alarm_mode", h: "Lamp alarm mode" },
    53: { n: "lamp_burn_hours_trip_point", h: "Lamp burn hours trip point" },
  }},

  // ── Measurement & Sensing clusters ──
  1024: { name: "Illuminance Measurement", attrs: {
    0: { n: "measured_value", h: "Illuminance: 10000*log10(lux)+1" },
    1: { n: "min_measured_value", h: "Min measurable value" },
    2: { n: "max_measured_value", h: "Max measurable value" },
    3: { n: "tolerance", h: "Tolerance" },
    4: { n: "light_sensor_type", h: "0=Photodiode, 1=CMOS, 64=Unknown" },
  }},
  1025: { name: "Illuminance Level Sensing", attrs: {
    0: { n: "level_status", h: "0=On target, 1=Below target, 2=Above target" },
    1: { n: "light_sensor_type", h: "0=Photodiode, 1=CMOS" },
    16: { n: "illuminance_target_level", h: "Target illuminance level" },
  }},
  1026: { name: "Temperature Measurement", attrs: {
    0: { n: "measured_value", h: "Temperature (0.01\u00B0C)" },
    1: { n: "min_measured_value", h: "Min measurable temp (0.01\u00B0C)" },
    2: { n: "max_measured_value", h: "Max measurable temp (0.01\u00B0C)" },
    3: { n: "tolerance", h: "Tolerance (0.01\u00B0C)" },
  }},
  1027: { name: "Pressure Measurement", attrs: {
    0: { n: "measured_value", h: "Pressure (kPa*10 or hPa)" },
    1: { n: "min_measured_value", h: "Min measurable pressure" },
    2: { n: "max_measured_value", h: "Max measurable pressure" },
    3: { n: "tolerance", h: "Tolerance" },
    16: { n: "scaled_value", h: "Scaled value" },
    17: { n: "min_scaled_value", h: "Min scaled value" },
    18: { n: "max_scaled_value", h: "Max scaled value" },
    19: { n: "scaled_tolerance", h: "Scaled tolerance" },
    20: { n: "scale", h: "Scale factor (10^n)" },
  }},
  1028: { name: "Flow Measurement", attrs: {
    0: { n: "measured_value", h: "Flow (m\u00B3/h * 10)" },
    1: { n: "min_measured_value", h: "Min measurable flow" },
    2: { n: "max_measured_value", h: "Max measurable flow" },
    3: { n: "tolerance", h: "Tolerance" },
  }},
  1029: { name: "Relative Humidity", attrs: {
    0: { n: "measured_value", h: "Humidity (0.01%)" },
    1: { n: "min_measured_value", h: "Min measurable humidity" },
    2: { n: "max_measured_value", h: "Max measurable humidity" },
    3: { n: "tolerance", h: "Tolerance" },
  }},
  1030: { name: "Occupancy Sensing", attrs: {
    0: { n: "occupancy", h: "0=Unoccupied, 1=Occupied" },
    1: { n: "occupancy_sensor_type", h: "0=PIR, 1=Ultrasonic, 2=PIR+Ultrasonic, 3=PhysicalContact" },
    2: { n: "occupancy_sensor_type_bitmap", h: "Sensor type bitmap" },
    16: { n: "pir_o_to_u_delay", h: "Occ\u2192Unocc delay (sec). Increase for longer hold." },
    17: { n: "pir_u_to_o_delay", h: "Unocc\u2192Occ delay (sec)" },
    18: { n: "pir_u_to_o_threshold", h: "Sensitivity. Lower = more sensitive." },
    32: { n: "ultrasonic_o_to_u_delay", h: "Ultrasonic Occ\u2192Unocc delay (sec)" },
    33: { n: "ultrasonic_u_to_o_delay", h: "Ultrasonic Unocc\u2192Occ delay (sec)" },
    48: { n: "physical_contact_o_to_u_delay", h: "Physical contact Occ\u2192Unocc delay" },
    49: { n: "physical_contact_u_to_o_delay", h: "Physical contact Unocc\u2192Occ delay" },
    50: { n: "physical_contact_u_to_o_threshold", h: "Physical contact threshold" },
  }},
  1032: { name: "Leaf Wetness", attrs: {
    0: { n: "measured_value", h: "Leaf wetness (%)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},
  1033: { name: "Soil Moisture", attrs: {
    0: { n: "measured_value", h: "Soil moisture (%)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},
  1034: { name: "pH Measurement", attrs: {
    0: { n: "measured_value", h: "pH (0.01 units)" },
    1: { n: "min_measured_value", h: "Min measurable pH" },
    2: { n: "max_measured_value", h: "Max measurable pH" },
  }},
  1035: { name: "EC Measurement", attrs: {
    0: { n: "measured_value", h: "Electrical conductivity (\u00B5S/cm)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},
  1036: { name: "Wind Speed", attrs: {
    0: { n: "measured_value", h: "Wind speed (0.01 m/s)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},
  1040: { name: "Carbon Monoxide (CO)", attrs: {
    0: { n: "measured_value", h: "CO concentration (ppm)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},
  1037: { name: "Carbon Dioxide (CO\u2082)", attrs: {
    0: { n: "measured_value", h: "CO\u2082 concentration (ppm)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},
  1038: { name: "PM2.5 Measurement", attrs: {
    0: { n: "measured_value", h: "PM2.5 (\u00B5g/m\u00B3)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},
  1039: { name: "Formaldehyde (CH\u2082O)", attrs: {
    0: { n: "measured_value", h: "Formaldehyde (ppm)" },
    1: { n: "min_measured_value", h: "Min measurable" },
    2: { n: "max_measured_value", h: "Max measurable" },
  }},

  // ── Security & Safety clusters ──
  1280: { name: "IAS Zone", attrs: {
    0: { n: "zone_state", h: "0=Not enrolled, 1=Enrolled" },
    1: { n: "zone_type", h: "0x000D=Motion, 0x0015=Contact, 0x0028=Fire, 0x002A=Water, 0x002B=CO, 0x002C=Personal Emergency, 0x002D=Vibration, 0x010F=Remote Control, 0x0115=Key Fob, 0x021D=Keypad, 0x0225=Standard Warning, 0x0226=Glass Break, 0x8XXX=Manufacturer" },
    2: { n: "zone_status", h: "Bitmap: bit0=Alarm1, bit1=Alarm2, bit2=Tamper, bit3=Battery, bit4=SupervisionReports, bit5=RestoreReports, bit6=Trouble, bit7=AC(mains), bit8=Test, bit9=BatteryDefect" },
    16: { n: "ias_cie_address", h: "IAS CIE IEEE address" },
    17: { n: "zone_id", h: "Zone ID" },
    18: { n: "num_zone_sensitivity_levels_supported", h: "Sensitivity levels" },
    19: { n: "current_zone_sensitivity_level", h: "Current sensitivity" },
  }},
  1281: { name: "IAS ACE", attrs: {
  }},
  1282: { name: "IAS Warning Devices", attrs: {
    0: { n: "max_duration", h: "Max warning duration (sec)" },
  }},

  // ── Smart Energy / Metering ──
  1792: { name: "Price", attrs: {
    0: { n: "tier1_price_label", h: "Tier 1 price label" },
  }},
  1793: { name: "DRLC", attrs: {
    0: { n: "utility_enrollment_group", h: "Utility enrollment group" },
    1: { n: "start_randomize_minutes", h: "Start randomize (min)" },
    2: { n: "stop_randomize_minutes", h: "Stop randomize (min)" },
    3: { n: "device_class_value", h: "Device class" },
  }},
  1794: { name: "Metering", attrs: {
    0: { n: "current_summation_delivered", h: "Total energy delivered (Wh)" },
    1: { n: "current_summation_received", h: "Total energy received (Wh)" },
    2: { n: "current_max_demand_delivered", h: "Max demand delivered" },
    3: { n: "current_max_demand_received", h: "Max demand received" },
    4: { n: "dft_summation", h: "DFT summation" },
    5: { n: "daily_freeze_time", h: "Daily freeze time" },
    6: { n: "power_factor", h: "Power factor (-100 to 100)" },
    7: { n: "reading_snapshot_time", h: "Reading snapshot time" },
    8: { n: "current_max_demand_delivered_time", h: "Max demand delivered time" },
    9: { n: "current_max_demand_received_time", h: "Max demand received time" },
    256: { n: "current_tier1_summation_delivered", h: "Tier 1 delivered" },
    512: { n: "current_demand_delivered", h: "Current demand delivered" },
    768: { n: "unit_of_measure", h: "0=kWh, 1=m\u00B3, 2=ft\u00B3, 3=ccf, 4=US gal, 5=IMP gal, 6=BTU, 7=L, 8=kPa, 128+=BCD versions" },
    769: { n: "multiplier", h: "Multiplier" },
    770: { n: "divisor", h: "Divisor" },
    771: { n: "summation_formatting", h: "Summation formatting" },
    772: { n: "demand_formatting", h: "Demand formatting" },
    773: { n: "historical_consumption_formatting", h: "Historical formatting" },
    774: { n: "metering_device_type", h: "0=Electric, 1=Gas, 2=Water, 3=Thermal, 4=Pressure, 5=Heat, 6=Cooling" },
    775: { n: "site_id", h: "Site ID" },
    776: { n: "meter_serial_number", h: "Meter serial number" },
    1024: { n: "instantaneous_demand", h: "Instantaneous demand (W)" },
    1025: { n: "current_day_consumption_delivered", h: "Today consumption delivered" },
    1026: { n: "current_day_consumption_received", h: "Today consumption received" },
    1027: { n: "previous_day_consumption_delivered", h: "Yesterday consumption delivered" },
  }},
  1795: { name: "Messaging", attrs: {
  }},
  1796: { name: "Tunneling", attrs: {
  }},
  1797: { name: "Prepayment", attrs: {
    0: { n: "payment_control_config", h: "Payment control config" },
  }},

  // ── Protocol/Telecom clusters ──
  2817: { name: "Meter Identification", attrs: {
    0: { n: "company_name", h: "Company name" },
    1: { n: "meter_type_id", h: "Meter type ID" },
    4: { n: "data_quality_id", h: "Data quality ID" },
    12: { n: "pod", h: "POD (Point of Delivery)" },
    13: { n: "available_power", h: "Available power" },
    14: { n: "power_threshold", h: "Power threshold" },
  }},

  // ── Electrical Measurement ──
  2820: { name: "Electrical Measurement", attrs: {
    0: { n: "measurement_type", h: "Measurement type bitmap" },
    256: { n: "dc_voltage", h: "DC voltage (V)" },
    257: { n: "dc_voltage_min", h: "DC voltage min" },
    258: { n: "dc_voltage_max", h: "DC voltage max" },
    259: { n: "dc_current", h: "DC current (A)" },
    260: { n: "dc_current_min", h: "DC current min" },
    261: { n: "dc_current_max", h: "DC current max" },
    262: { n: "dc_power", h: "DC power (W)" },
    263: { n: "dc_power_min", h: "DC power min" },
    264: { n: "dc_power_max", h: "DC power max" },
    512: { n: "ac_frequency", h: "AC frequency (Hz)" },
    513: { n: "ac_frequency_min", h: "AC frequency min" },
    514: { n: "ac_frequency_max", h: "AC frequency max" },
    515: { n: "neutral_current", h: "Neutral current (A)" },
    516: { n: "total_active_power", h: "Total active power (W)" },
    517: { n: "total_reactive_power", h: "Total reactive power (VAr)" },
    518: { n: "total_apparent_power", h: "Total apparent power (VA)" },
    1024: { n: "ac_voltage_multiplier", h: "AC voltage multiplier" },
    1025: { n: "ac_voltage_divisor", h: "AC voltage divisor" },
    1026: { n: "ac_current_multiplier", h: "AC current multiplier" },
    1027: { n: "ac_current_divisor", h: "AC current divisor" },
    1028: { n: "ac_power_multiplier", h: "AC power multiplier" },
    1029: { n: "ac_power_divisor", h: "AC power divisor" },
    1281: { n: "ac_voltage_overload", h: "AC voltage overload" },
    1282: { n: "ac_current_overload", h: "AC current overload" },
    1283: { n: "ac_active_power_overload", h: "AC active power overload" },
    1285: { n: "rms_voltage", h: "RMS voltage (V)" },
    1286: { n: "rms_voltage_min", h: "RMS voltage min" },
    1287: { n: "rms_voltage_max", h: "RMS voltage max" },
    1288: { n: "rms_current", h: "RMS current (mA)" },
    1289: { n: "rms_current_min", h: "RMS current min" },
    1290: { n: "rms_current_max", h: "RMS current max" },
    1291: { n: "active_power", h: "Active power (W)" },
    1292: { n: "active_power_min", h: "Active power min" },
    1293: { n: "active_power_max", h: "Active power max" },
    1294: { n: "reactive_power", h: "Reactive power (VAr)" },
    1295: { n: "apparent_power", h: "Apparent power (VA)" },
    1296: { n: "power_factor", h: "Power factor (-100 to 100)" },
    1297: { n: "average_rms_voltage_measurement_period", h: "Avg RMS voltage measurement period" },
    1299: { n: "average_rms_over_voltage_counter", h: "Avg RMS over-voltage counter" },
    1300: { n: "average_rms_under_voltage_counter", h: "Avg RMS under-voltage counter" },
    1301: { n: "rms_extreme_over_voltage_period", h: "RMS extreme over-voltage period" },
    1302: { n: "rms_extreme_under_voltage_period", h: "RMS extreme under-voltage period" },
    1303: { n: "rms_voltage_sag_period", h: "RMS voltage sag period" },
    1304: { n: "rms_voltage_swell_period", h: "RMS voltage swell period" },
    // Phase B
    2309: { n: "rms_voltage_ph_b", h: "Phase B RMS voltage (V)" },
    2312: { n: "rms_current_ph_b", h: "Phase B RMS current (mA)" },
    2315: { n: "active_power_ph_b", h: "Phase B active power (W)" },
    // Phase C
    2565: { n: "rms_voltage_ph_c", h: "Phase C RMS voltage (V)" },
    2568: { n: "rms_current_ph_c", h: "Phase C RMS current (mA)" },
    2571: { n: "active_power_ph_c", h: "Phase C active power (W)" },
  }},
  2821: { name: "Diagnostics", attrs: {
    0: { n: "number_of_resets", h: "Number of device resets" },
    1: { n: "persistent_memory_writes", h: "Persistent memory writes" },
    256: { n: "mac_rx_bcast", h: "MAC layer received broadcasts" },
    257: { n: "mac_tx_bcast", h: "MAC layer transmitted broadcasts" },
    258: { n: "mac_rx_ucast", h: "MAC layer received unicasts" },
    259: { n: "mac_tx_ucast", h: "MAC layer transmitted unicasts" },
    260: { n: "mac_tx_ucast_retry", h: "MAC TX unicast retries" },
    261: { n: "mac_tx_ucast_fail", h: "MAC TX unicast failures" },
    262: { n: "aps_rx_bcast", h: "APS layer received broadcasts" },
    263: { n: "aps_tx_bcast", h: "APS layer transmitted broadcasts" },
    264: { n: "aps_rx_ucast", h: "APS layer received unicasts" },
    265: { n: "aps_tx_ucast_success", h: "APS TX unicast successes" },
    266: { n: "aps_tx_ucast_retry", h: "APS TX unicast retries" },
    267: { n: "aps_tx_ucast_fail", h: "APS TX unicast failures" },
    268: { n: "route_disc_initiated", h: "Route discoveries initiated" },
    269: { n: "neighbor_added", h: "Neighbors added" },
    270: { n: "neighbor_removed", h: "Neighbors removed" },
    271: { n: "neighbor_stale", h: "Stale neighbors" },
    272: { n: "join_indication", h: "Join indications" },
    273: { n: "child_moved", h: "Children moved" },
    274: { n: "nwk_fc_failure", h: "NWK frame counter failures" },
    275: { n: "aps_fc_failure", h: "APS frame counter failures" },
    276: { n: "aps_unauthorized_key", h: "APS unauthorized key usage" },
    277: { n: "nwk_decrypt_failures", h: "NWK decrypt failures" },
    278: { n: "aps_decrypt_failures", h: "APS decrypt failures" },
    279: { n: "packet_buffer_allocate_failures", h: "Packet buffer allocation failures" },
    280: { n: "relayed_ucast", h: "Relayed unicasts" },
    281: { n: "phy_to_mac_queue_limit_reached", h: "PHY→MAC queue limit reached" },
    282: { n: "packet_validate_drop_count", h: "Packets dropped during validation" },
    283: { n: "average_mac_retry_per_aps_message_sent", h: "Avg MAC retry per APS message" },
    284: { n: "last_message_lqi", h: "Last message LQI" },
    285: { n: "last_message_rssi", h: "Last message RSSI" },
  }},

  // ── Touchlink ──
  4096: { name: "Touchlink Commissioning", attrs: {
  }},

  // ── Manufacturer-specific / Private clusters ──
  64512: { name: "Xiaomi Aqara (0xFC00)", attrs: {
    0: { n: "opple_cluster_attr_0", h: "Aqara opple attribute 0" },
    1: { n: "opple_mode", h: "Aqara opple mode" },
    2: { n: "opple_cluster_attr_2", h: "Aqara opple attribute 2" },
    9: { n: "mode", h: "Aqara device mode" },
    10: { n: "occupancy_timeout", h: "Aqara occupancy timeout" },
    100: { n: "aqara_attr_100", h: "Aqara custom attribute 100" },
    101: { n: "aqara_attr_101", h: "Aqara custom attribute 101" },
    102: { n: "aqara_attr_102", h: "Aqara custom attribute 102" },
    103: { n: "aqara_attr_103", h: "Aqara custom attribute 103" },
    105: { n: "aqara_attr_105", h: "Aqara custom attribute 105" },
    149: { n: "aqara_attr_149", h: "Aqara custom attribute 149 (energy)" },
    150: { n: "aqara_attr_150", h: "Aqara custom attribute 150 (voltage)" },
    152: { n: "aqara_attr_152", h: "Aqara custom attribute 152 (power)" },
    247: { n: "aqara_attr_247", h: "Aqara custom attribute 247" },
    268: { n: "aqara_attr_268", h: "Aqara startup on/off" },
    329: { n: "aqara_attr_329", h: "Aqara custom attribute 329" },
    512: { n: "aqara_attr_512", h: "Aqara custom 512" },
  }},
  64528: { name: "Xiaomi MiJia (0xFC10)", attrs: {
  }},
  64529: { name: "Xiaomi MiJia 2 (0xFC11)", attrs: {
  }},
  61184: { name: "Tuya (0xEF00)", attrs: {
    0: { n: "tuya_dp_set", h: "Tuya DataPoint set" },
    2: { n: "tuya_dp_report", h: "Tuya DataPoint report" },
    3: { n: "tuya_mcu_version", h: "Tuya MCU version" },
    4: { n: "tuya_mcu_sync_time", h: "Tuya MCU sync time" },
    61440: { n: "tuya_cluster_revision", h: "Tuya cluster revision" },
  }},
  65281: { name: "Xiaomi Private (0xFF01)", attrs: {
    1: { n: "battery_voltage_mv", h: "Battery voltage (mV)" },
    3: { n: "device_temperature", h: "Device temperature (\u00B0C)" },
    5: { n: "rssi_db", h: "RSSI (dBm)" },
    6: { n: "lqi", h: "LQI value" },
    8: { n: "key_1", h: "Key/event 1" },
    10: { n: "key_2", h: "Key/event 2" },
    100: { n: "temperature", h: "Temperature (\u00B0C * 100)" },
    101: { n: "humidity", h: "Humidity (% * 100)" },
    102: { n: "pressure", h: "Pressure (hPa * 100)" },
    150: { n: "consumption_kwh", h: "Consumption (kWh)" },
    152: { n: "power_w", h: "Power (W)" },
  }},
  65282: { name: "Xiaomi Private 2 (0xFF02)", attrs: {
    1: { n: "battery_voltage_mv", h: "Battery voltage (mV)" },
    3: { n: "device_temperature", h: "Device temperature (\u00B0C)" },
    4: { n: "unk_1", h: "Unknown attr 4" },
    5: { n: "rssi_db", h: "RSSI (dBm)" },
    6: { n: "lqi", h: "LQI value" },
  }},
  64638: { name: "Ikea (0xFC7E)", attrs: {
    0: { n: "ikea_attr_0", h: "Ikea custom attribute 0" },
    1: { n: "ikea_attr_1", h: "Ikea custom attribute 1" },
  }},
  64636: { name: "Ikea Air Purifier (0xFC7C)", attrs: {
    0: { n: "filter_run_time", h: "Filter run time (min)" },
    1: { n: "replace_filter", h: "Replace filter flag" },
    2: { n: "filter_life_level", h: "Filter life level (%)" },
    6: { n: "pm25", h: "PM2.5 (\u00B5g/m\u00B3)" },
    7: { n: "child_lock", h: "Child lock (0=Off, 1=On)" },
    8: { n: "fan_mode", h: "Fan mode" },
    9: { n: "fan_speed", h: "Fan speed" },
    10: { n: "device_run_time", h: "Device run time (min)" },
  }},
  64642: { name: "Schneider Electric (0xFC82)", attrs: {
  }},
  64514: { name: "Legrand (0xFC02)", attrs: {
  }},
  64560: { name: "Philips Hue (0xFC30)", attrs: {
  }},
  64527: { name: "Osram (0xFC0F)", attrs: {
  }},
  64773: { name: "HEIMAN (0xFD05)", attrs: {
  }},
  64704: { name: "Sonoff (0xFCC0)", attrs: {
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
    const epId = _pid(ep.endpoint_id ?? ep.id) || 1;
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
    const attrId = typeof (attr.id ?? attr.attribute) === "string" ? parseInt(attr.id ?? attr.attribute, 10) : Number(attr.id ?? attr.attribute ?? 0);
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

/* ========================================================
   ANNOTATION / DRAWING OVERLAY
   ======================================================== */
const Annotate = (() => {
  let active = false;
  let tool = "pen";
  let color = "#ff4444";
  let lineW = 4;
  let strokes = [];       // completed strokes [{type, pts/rect/text, color, lineW}]
  let currentPts = [];
  let shapeStart = null;
  let notes = [];
  let noteCounter = 0;
  let ctx = null;
  let canvas = null;

  function open() {
    const overlay = $("annotate-overlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    canvas = $("annotate-canvas");
    if (!canvas) return;
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx = canvas.getContext("2d");
    ctx.scale(devicePixelRatio, devicePixelRatio);
    active = true;
    redraw();
  }

  function close() {
    const overlay = $("annotate-overlay");
    if (overlay) overlay.classList.add("hidden");
    active = false;
  }

  function setTool(t) {
    tool = t;
    document.querySelectorAll(".annotate-tool[data-tool]").forEach(b => {
      b.classList.toggle("active", b.dataset.tool === t);
    });
    if (canvas) canvas.style.cursor = t === "text" ? "text" : "crosshair";
  }

  function redraw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of strokes) drawStroke(s);
  }

  function drawStroke(s) {
    if (!ctx) return;
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.lineW;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (s.type === "pen" && s.pts.length > 1) {
      ctx.beginPath();
      ctx.moveTo(s.pts[0].x, s.pts[0].y);
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(s.pts[i].x, s.pts[i].y);
      ctx.stroke();
    } else if (s.type === "arrow" && s.pts.length === 2) {
      const [a, b] = s.pts;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // arrowhead
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const hl = 14;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - hl * Math.cos(angle - 0.4), b.y - hl * Math.sin(angle - 0.4));
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - hl * Math.cos(angle + 0.4), b.y - hl * Math.sin(angle + 0.4));
      ctx.stroke();
    } else if (s.type === "rect" && s.rect) {
      const r = s.rect;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    } else if (s.type === "text" && s.text) {
      ctx.font = `${Math.max(14, s.lineW * 4)}px 'Segoe UI', sans-serif`;
      ctx.fillText(s.text, s.pos.x, s.pos.y);
    }
  }

  function onDown(e) {
    if (!active) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "text") {
      const text = prompt("Enter annotation text:");
      if (text) {
        strokes.push({ type: "text", text, pos: { x, y }, color, lineW });
        redraw();
      }
      return;
    }

    currentPts = [{ x, y }];
    shapeStart = { x, y };
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp, { once: true });
  }

  function onMove(e) {
    if (!active || !currentPts.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "pen") {
      currentPts.push({ x, y });
      redraw();
      drawStroke({ type: "pen", pts: currentPts, color, lineW });
    } else {
      redraw();
      if (tool === "arrow") {
        drawStroke({ type: "arrow", pts: [shapeStart, { x, y }], color, lineW });
      } else if (tool === "rect") {
        drawStroke({ type: "rect", rect: { x: shapeStart.x, y: shapeStart.y, w: x - shapeStart.x, h: y - shapeStart.y }, color, lineW });
      }
    }
  }

  function onUp(e) {
    canvas.removeEventListener("mousemove", onMove);
    if (!currentPts.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "pen") {
      strokes.push({ type: "pen", pts: [...currentPts], color, lineW });
    } else if (tool === "arrow") {
      strokes.push({ type: "arrow", pts: [shapeStart, { x, y }], color, lineW });
    } else if (tool === "rect") {
      strokes.push({ type: "rect", rect: { x: shapeStart.x, y: shapeStart.y, w: x - shapeStart.x, h: y - shapeStart.y }, color, lineW });
    }
    currentPts = [];
    shapeStart = null;
    redraw();
  }

  function undo() {
    strokes.pop();
    redraw();
  }

  function clear() {
    strokes = [];
    redraw();
  }

  function saveAsPng() {
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `annotation_${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function addNote() {
    noteCounter++;
    const id = `note-${noteCounter}`;
    notes.push({ id, text: "" });
    renderNotes();
    const ta = document.querySelector(`#${id} textarea`);
    if (ta) ta.focus();
  }

  function deleteNote(id) {
    notes = notes.filter(n => n.id !== id);
    renderNotes();
  }

  function renderNotes() {
    const host = $("annotate-notes-list");
    if (!host) return;
    host.innerHTML = "";
    for (const n of notes) {
      const item = document.createElement("div");
      item.className = "annotate-note-item";
      item.id = n.id;
      const ta = document.createElement("textarea");
      ta.value = n.text;
      ta.placeholder = "Type your note...";
      ta.addEventListener("input", () => { n.text = ta.value; });
      const del = document.createElement("button");
      del.className = "annotate-note-del";
      del.innerHTML = '<i class="mdi mdi-close"></i>';
      del.addEventListener("click", () => deleteNote(n.id));
      item.appendChild(ta);
      item.appendChild(del);
      host.appendChild(item);
    }
    if (!notes.length) {
      host.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-tert)">No notes yet. Click + to add.</div>';
    }
  }

  function init() {
    $("annotate-btn")?.addEventListener("click", () => { active ? close() : open(); });
    $("annotate-close")?.addEventListener("click", close);
    $("annotate-undo")?.addEventListener("click", undo);
    $("annotate-clear")?.addEventListener("click", clear);
    $("annotate-save")?.addEventListener("click", saveAsPng);
    $("annotate-add-note")?.addEventListener("click", addNote);
    $("annotate-color")?.addEventListener("input", (e) => { color = e.target.value; });
    $("annotate-size")?.addEventListener("change", (e) => { lineW = parseInt(e.target.value, 10); });

    document.querySelectorAll(".annotate-tool[data-tool]").forEach(b => {
      b.addEventListener("click", () => setTool(b.dataset.tool));
    });

    const c = $("annotate-canvas");
    if (c) c.addEventListener("mousedown", onDown);

    window.addEventListener("resize", () => {
      if (!active || !canvas) return;
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      ctx = canvas.getContext("2d");
      ctx.scale(devicePixelRatio, devicePixelRatio);
      redraw();
    });

    renderNotes();
  }

  return { init, open, close };
})();

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
  initHResizeBar("devhelper-resize-bar",  "devhelper-left",   120, 400);
  initHResizeBar("devhelper-resize-bar2", "devhelper-center", 180, 500);

  /* Annotation overlay */
  Annotate.init();

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
