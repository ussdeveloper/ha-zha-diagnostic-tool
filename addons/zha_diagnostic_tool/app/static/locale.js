"use strict";
/* =============================================================================
   ZHA Diagnostic Tool — UI locale strings
   Default language: English ("en")

   To add a new locale create a matching object with the same keys and set
     window.ZHA_LANG = "<lang_code>";
   before this script is loaded (or patch it into locale.js directly).

   Example skeleton for German:
     window.ZHA_LANG = "de";
     ZHA_STRINGS.de = {
       "nav.dashboard_kpi": "Dashboard KPI",
       ...all keys from "en"...
     };
============================================================================= */

const ZHA_STRINGS = {
  en: {
    /* ── Desktop navigation shortcuts ── */
    "nav.dashboard_kpi":   "Dashboard KPI",
    "nav.zha_entities":    "ZHA Entities",
    "nav.switches":        "Switches",
    "nav.telemetry":       "Telemetry",
    "nav.mirror_rules":    "Mirror Rules",
    "nav.sensor_rules":    "Sensor Rules",
    "nav.battery_monitor": "Battery Monitor",
    "nav.network_map":     "Network Map",
    "nav.device_helper":   "Device Helper",
    "nav.zigbee_logs":     "Zigbee Logs",

    /* ── Window title-bar labels ── */
    "win.kpi":        "Dashboard \u2014 KPI & Delay Chart",
    "win.zha":        "ZHA Entities",
    "win.switches":   "Switches",
    "win.lights":     "Lights",
    "win.telemetry":  "ZHA Telemetry (Realtime)",
    "win.mirror":     "Mirror Switches",
    "win.sensor":     "Sensor Range \u2192 Switch",
    "win.battery":    "Battery Monitor",
    "win.netmap":     "ZHA Network Map",
    "win.devhelper":  "Device Helper Explorer",
    "win.zigbeelogs": "All Zigbee Logs \u2014 Errors & Events",
    "win.unavail":    "Unavailable Zigbee Devices",

    /* ── KPI card labels ── */
    "kpi.zigbee":  "Zigbee",
    "kpi.switches":"Switches",
    "kpi.mirror":  "Mirror",
    "kpi.sensor":  "Sensor",
    "kpi.avg":     "AVG",
    "kpi.p95":     "P95",
    "kpi.max":     "MAX",
    "kpi.pending": "Pending",
    "kpi.errors":  "Errors",
    "kpi.success": "Success%",

    /* ── Input placeholders ── */
    "ph.search_zha":       "Search ZHA entities\u2026",
    "ph.search_switches":  "Search switches\u2026",
    "ph.search_lights":    "Search lights\u2026",
    "ph.search_battery":   "Search battery devices\u2026",
    "ph.search_devhelper": "Search ZHA devices\u2026",
    "ph.search_logs":      "Search logs (IEEE, type, message)\u2026",
    "ph.mirror_source":    "Source switch\u2026",
    "ph.mirror_target":    "Target switch\u2026",
    "ph.sensor_entity":    "Sensor entity\u2026",
    "ph.sensor_switch":    "Target switch\u2026",
    "ph.folder_name":      "Folder name\u2026",
    "ph.folder_entity":    "Search entity to add\u2026",
    "ph.log_raw":          "Click a log entry to see raw data\u2026",

    /* ── Buttons ── */
    "btn.link":         "Link",
    "btn.add":          "Add",
    "btn.save_alert":   "Save Alert",
    "btn.scan_network": "Scan Network",
    "btn.identify":     "Identify",
    "btn.save":         "Save",
    "btn.cancel":       "Cancel",
    "btn.delete":       "Delete",
    "btn.clear":        "Clear",

    /* ── Form / misc labels ── */
    "label.bidirectional":      "Bidirectional",
    "label.alert_threshold":    "Alert threshold:",
    "label.keep_alive":         "Keep-alive",
    "label.sec":                "sec",
    "label.folder_props":       "Folder Properties",
    "label.name":               "Name",
    "label.icon":               "Icon",
    "label.entities":           "Entities",
    "label.battery_chart_hint": "Click device rows below to select/deselect on chart",
    "label.select_device":      "Select a device from the list",

    /* ── Sensor action select options ── */
    "sensor.in_on":     "In: ON",
    "sensor.in_off":    "In: OFF",
    "sensor.in_toggle": "In: toggle",
    "sensor.out_none":  "Out: none",
    "sensor.out_on":    "Out: ON",
    "sensor.out_off":   "Out: OFF",
    "sensor.out_toggle":"Out: toggle",

    /* ── Telemetry chart legend ── */
    "tele.zha":   "ZHA",
    "tele.state": "State",
    "tele.call":  "Call",
    "tele.error": "Error",

    /* ── Zigbee log filter labels ── */
    "filter.timeout":       "Timeout",
    "filter.not_delivered": "Not Delivered",
    "filter.lqi_critical":  "LQI Critical",
    "filter.log_errors":    "Log Errors",

    /* ── Taskbar / tooltip titles ── */
    "title.app":          "ZHA Diagnostic Tool",
    "title.refresh":      "Refresh data",
    "title.scan_network": "Scan ZHA network topology",

    /* ── Network map canvas text ── */
    "netmap.no_devices": "No ZHA devices \u2014 open Network Map to load",
    "netmap.hub":        "HUB",
    "netmap.coord":      "Coordinator",
    "netmap.minimap":    "minimap",
    "netmap.lqi_good":   "LQI > 180 (good)",
    "netmap.lqi_ok":     "LQI 100-180 (ok)",
    "netmap.lqi_poor":   "LQI < 100 (poor)",

    /* ── Battery monitor ── */
    "bat.no_alerts":        "No battery alerts configured",
    "bat.no_data_selected": "Selected devices have no battery history data",
    "bat.no_data":          "No battery history data available",
    "bat.select_notify":    "\u2014 select notify entity \u2014",

    /* ── Device Helper ── */
    "dh.loading_clusters": "Loading clusters\u2026",
    "dh.no_clusters":      "No clusters found",
    "dh.loading_attrs":    "Loading attributes\u2026",
    "dh.no_unavail":       "No unavailable devices data",

    /* ── Status / messages ── */
    "msg.initializing": "Initializing\u2026",
    "msg.please_notify":"Please select a notify entity (phone)",
  },
};
