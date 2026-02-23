const state = {
  dashboard: null,
  zhaItems: [],
  switchItems: [],
  sensorItems: [],
};

const $ = (id) => document.getElementById(id);

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
  const node = $("status-bar");
  node.textContent = text;
  node.className = `status-bar ${cls}`.trim();
}

function setSummary(summary) {
  $("kpi-entities").textContent = summary.zigbee_entities ?? "-";
  $("kpi-switches").textContent = summary.switches_total ?? summary.zigbee_switches ?? "-";
  $("kpi-rules").textContent = summary.mirror_rules ?? "-";
  $("kpi-srules").textContent = summary.sensor_rules ?? "-";
  $("kpi-avg").textContent = summary.delay_avg_ms == null ? "-" : `${summary.delay_avg_ms} ms`;
  $("kpi-p95").textContent = summary.delay_p95_ms == null ? "-" : `${summary.delay_p95_ms} ms`;
  $("kpi-max").textContent = summary.delay_max_ms == null ? "-" : `${summary.delay_max_ms} ms`;
  $("kpi-pending").textContent = summary.pending_commands ?? "-";
}

function renderDelayChart(samples) {
  const canvas = $("delay-chart");
  const ctx = canvas.getContext("2d");

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
  const query = ($("zha-search").value || "").trim().toLowerCase();
  const host = $("zha-list");
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
  const query = ($("switch-search").value || "").trim().toLowerCase();
  const host = $("switch-list");
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
    right.appendChild(rowRightActions(item.entity_id, item.state, true));

    const onBtn = document.createElement("button");
    onBtn.textContent = "ON";
    onBtn.onclick = () => switchAction(item.entity_id, "turn_on");

    const offBtn = document.createElement("button");
    offBtn.textContent = "OFF";
    offBtn.onclick = () => switchAction(item.entity_id, "turn_off");

    right.appendChild(onBtn);
    right.appendChild(offBtn);

    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);
  }

  const switchOptions = ['<option value="">-- switch --</option>'];
  for (const item of state.switchItems) {
    switchOptions.push(`<option value="${item.entity_id}">${item.entity_id}</option>`);
  }
  $("mirror-source").innerHTML = switchOptions.join("");
  $("mirror-target").innerHTML = switchOptions.join("");
  $("sensor-switch").innerHTML = switchOptions.join("");
}

function renderMirrorRules(rules) {
  const host = $("rules-list");
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
  const host = $("sensor-rules-list");
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
  $("sensor-entity").innerHTML = options.join("");
}

async function switchAction(entityId, action) {
  await api("api/switch-action", {
    method: "POST",
    body: JSON.stringify({ entity_id: entityId, action }),
  });
}

async function addMirrorRule() {
  const source = $("mirror-source").value;
  const target = $("mirror-target").value;
  const bidirectional = $("mirror-bidirectional").checked;

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
  const sensor_entity = $("sensor-entity").value;
  const switch_entity = $("sensor-switch").value;
  const minRaw = $("sensor-min").value;
  const maxRaw = $("sensor-max").value;
  const action_in_range = $("sensor-in-action").value;
  const action_out_of_range = $("sensor-out-action").value;

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

  setSummary(dashboard.summary || {});
  renderDelayChart(dashboard.delay_samples || []);
  renderZhaList();
  renderSwitchList();
  renderMirrorRules(dashboard.mirror_rules || []);
  renderSensorOptions();
  renderSensorRules(dashboard.sensor_rules || []);

  if (dashboard.runtime?.last_error) {
    setStatus(`Błąd backendu: ${dashboard.runtime.last_error}`, "err");
  } else {
    setStatus(
      `API OK • token: ${dashboard.runtime?.token_present ? "OK" : "BRAK"} • zigbee: ${dashboard.summary?.zigbee_entities ?? 0}`,
      "ok"
    );
  }

  $("updated-at").textContent = new Date().toLocaleTimeString();
}

document.addEventListener("DOMContentLoaded", async () => {
  $("refresh-btn").addEventListener("click", async () => {
    try {
      await api("api/refresh", { method: "POST" });
      await load();
    } catch (error) {
      setStatus(`Refresh failed: ${error.message}`, "err");
    }
  });

  $("zha-search").addEventListener("input", renderZhaList);
  $("switch-search").addEventListener("input", renderSwitchList);

  $("add-rule-btn").addEventListener("click", async () => {
    try {
      await addMirrorRule();
    } catch (error) {
      setStatus(`Mirror create failed: ${error.message}`, "err");
    }
  });

  $("add-sensor-rule-btn").addEventListener("click", async () => {
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
