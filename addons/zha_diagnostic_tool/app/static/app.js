/* ===== ZHA Diagnostic Desktop — app.js (v0.6.0) ===== */
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
  const d = now.toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  setHTML("taskbar-clock", `${h}:${m}<br>${d}`);
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

/* ========================================================
   WINDOW MANAGER — open, close, focus, drag, maximize, resize
   ======================================================== */
const WM = {
  zIndex: 100,
  focusedId: null,

  /* Default size & position — cascade from top-left */
  defaults: {
    "kpi-win":       { w: 840, h: 320, x: 130, y: 15  },
    "zha-win":       { w: 520, h: 440, x: 170, y: 55  },
    "switch-win":    { w: 580, h: 400, x: 210, y: 95  },
    "telemetry-win": { w: 680, h: 480, x: 250, y: 35  },
    "mirror-win":    { w: 580, h: 340, x: 290, y: 135 },
    "sensor-win":    { w: 620, h: 360, x: 330, y: 75  },
    "battery-win":   { w: 720, h: 520, x: 160, y: 45  },
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

    setSummary(d.summary || {});
    renderDelayChart(d.delay_samples || []);
    renderZhaList();
    renderSwitchList();
    renderMirrorRules(d.mirror_rules || []);
    renderSensorRules(d.sensor_rules || []);
    renderTelemetryChart(state.telemetrySpikes);
    renderTelemetryLog(state.telemetryEvents);
    renderBatteryList();
    renderBatteryChart(state.batteryItems);
    renderBatteryAlerts(state.batteryAlerts);

    if (d.runtime?.last_error) {
      setStatus(`Error: ${d.runtime.last_error}`, true);
    } else {
      setStatus(
        `OK \u00B7 zigbee: ${d.summary?.zigbee_entities ?? 0} \u00B7 switches: ${d.summary?.switches_total ?? 0}`,
        false
      );
    }

    setText("updated-at", new Date().toLocaleTimeString("en-US"));
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
  setInterval(tickClock, 15000);

  /* Auto-open KPI window on start */
  WM.open("kpi-win");

  /* Initial data load */
  load();

  /* Auto-refresh every 5 seconds */
  state.refreshTimer = setInterval(() => load(), 5000);
});
