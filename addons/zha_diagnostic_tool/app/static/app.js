const state = {
  dashboard: null,
  switches: [],
};

const $ = (id) => document.getElementById(id);

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

function setSummary(summary) {
  $("kpi-entities").textContent = summary.zigbee_entities ?? "-";
  $("kpi-switches").textContent = summary.zigbee_switches ?? "-";
  $("kpi-rules").textContent = summary.mirror_rules ?? "-";
  $("kpi-avg").textContent = summary.delay_avg_ms == null ? "-" : `${summary.delay_avg_ms} ms`;
  $("kpi-p95").textContent = summary.delay_p95_ms == null ? "-" : `${summary.delay_p95_ms} ms`;
  $("kpi-max").textContent = summary.delay_max_ms == null ? "-" : `${summary.delay_max_ms} ms`;
}

function renderSwitches(items) {
  const host = $("switch-list");
  host.innerHTML = "";
  const options = ['<option value="">-- wybierz switch --</option>'];

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.innerHTML = `<div>${item.friendly_name || item.entity_id}</div><div class="meta">${item.entity_id}</div>`;

    const right = document.createElement("div");
    right.className = "actions";

    const badge = document.createElement("span");
    badge.className = `badge ${item.state === "on" ? "on" : "off"}`;
    badge.textContent = item.state;

    const toggle = document.createElement("button");
    toggle.className = "ghost";
    toggle.textContent = "Toggle";
    toggle.onclick = () => switchAction(item.entity_id, "toggle");

    right.appendChild(badge);
    right.appendChild(toggle);

    row.appendChild(left);
    row.appendChild(right);
    host.appendChild(row);

    options.push(`<option value="${item.entity_id}">${item.entity_id}</option>`);
  }

  $("mirror-source").innerHTML = options.join("");
  $("mirror-target").innerHTML = options.join("");
}

function renderRules(rules) {
  const host = $("rules-list");
  host.innerHTML = "";
  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "row";

    const left = document.createElement("div");
    left.innerHTML = `<div>${rule.source} → ${rule.target}</div><div class="meta">${rule.bidirectional ? "bidirectional" : "one-way"}</div>`;

    const del = document.createElement("button");
    del.className = "ghost";
    del.textContent = "Usuń";
    del.onclick = async () => {
      await api(`/api/mirror-rules/${encodeURIComponent(rule.id)}`, { method: "DELETE" });
      await load();
    };

    row.appendChild(left);
    row.appendChild(del);
    host.appendChild(row);
  }
}

function renderDevices(items) {
  const host = $("device-list");
  host.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div><div>${item.friendly_name || item.entity_id}</div><div class="meta">${item.entity_id}</div></div><div class="meta">LQI: ${item.lqi ?? "-"}</div>`;
    host.appendChild(row);
  }
}

function renderDelayChart(samples) {
  const canvas = $("delay-chart");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#1b1b1c";
  ctx.fillRect(0, 0, width, height);

  if (!samples.length) {
    ctx.fillStyle = "#9da1a6";
    ctx.fillText("Brak próbek delay", 12, 24);
    return;
  }

  const values = samples.map((s) => Number(s.delay_ms) || 0);
  const max = Math.max(50, ...values);
  const pad = 24;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  ctx.strokeStyle = "#3c3c3c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, pad);
  ctx.lineTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();

  ctx.strokeStyle = "#569cd6";
  ctx.lineWidth = 2;
  ctx.beginPath();

  values.forEach((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * innerW;
    const y = height - pad - (v / max) * innerH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#d4d4d4";
  ctx.fillText(`max: ${max.toFixed(0)} ms`, width - 100, 16);
}

async function switchAction(entityId, action) {
  await api("/api/switch-action", {
    method: "POST",
    body: JSON.stringify({ entity_id: entityId, action }),
  });
}

async function addRule() {
  const source = $("mirror-source").value;
  const target = $("mirror-target").value;
  const bidirectional = $("mirror-bidirectional").checked;

  if (!source || !target) {
    alert("Wybierz source i target");
    return;
  }

  await api("/api/mirror-rules", {
    method: "POST",
    body: JSON.stringify({ source, target, bidirectional }),
  });

  await load();
}

async function load() {
  const [dashboard, switches] = await Promise.all([
    api("/api/dashboard"),
    api("/api/switches"),
  ]);

  state.dashboard = dashboard;
  state.switches = switches.items || [];

  setSummary(dashboard.summary || {});
  renderSwitches(state.switches);
  renderRules(dashboard.mirror_rules || []);
  renderDevices(dashboard.zigbee_devices || []);
  renderDelayChart(dashboard.delay_samples || []);

  $("updated-at").textContent = new Date().toLocaleTimeString();
}

document.addEventListener("DOMContentLoaded", async () => {
  $("refresh-btn").addEventListener("click", async () => {
    await api("/api/refresh", { method: "POST" });
    await load();
  });
  $("add-rule-btn").addEventListener("click", addRule);

  await load();
  setInterval(load, 5000);
});
