(() => {
  "use strict";

  const state = {
    health: null,
    metrics: null,
    hardware: null,
    devices: [],
    releases: [],
    incidents: [],
    audit: null,
    activeView: "dashboard",
    simulatorLog: ["Demo ready. Select a sample scenario; no live device or network action will be performed."],
    loading: false,
  };

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    const raw = await response.text();
    let data = raw;
    try { data = raw ? JSON.parse(raw) : null; } catch (_) { /* keep text response */ }
    if (!response.ok) {
      const detail = data && typeof data === "object" && data.detail ? data.detail : (typeof data === "string" && data ? data : "Request failed (" + response.status + ")");
      throw new Error(String(detail));
    }
    return data;
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value == null ? "" : String(value);
  }

  function formatTime(value) {
    if (!value) return "Never reported";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function isRecent(value, maxSeconds = 45) {
    if (!value) return false;
    const time = new Date(value).getTime();
    return !Number.isNaN(time) && Date.now() - time <= maxSeconds * 1000;
  }

  function deviceIsOnline(device) {
    if (state.hardware && device.id === state.hardware.device_id) return Boolean(state.hardware.connected);
    return isRecent(device.last_seen);
  }

  function releaseMatch(device) {
    if (!device.reported_hash) return null;
    return state.releases.find((release) =>
      release.approved && !release.revoked &&
      String(release.sha256).toLowerCase() === String(device.reported_hash).toLowerCase()
    ) || null;
  }

  function showToast(message, isError = false) {
    let box = $("toast-container");
    if (!box) {
      box = document.createElement("div");
      box.id = "toast-container";
      const topbar = document.querySelector(".topbar");
      if (topbar) topbar.insertAdjacentElement("afterend", box);
      else document.querySelector(".main-view")?.prepend(box);
    }
    box.innerHTML = '<div class="toast' + (isError ? ' error' : '') + '">' + escapeHtml(message) + '</div>';
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { box.innerHTML = ""; }, 5500);
  }

  function updateStatusIndicators() {
    const apiOnline = Boolean(state.health && state.health.status === "ok");
    const hardwareOnline = Boolean(state.hardware && state.hardware.connected);
    const auditValid = Boolean(state.audit && state.audit.chain_valid);

    const apiDot = $("api-dot");
    const backendDot = $("backend-dot");
    const deviceDot = $("device-dot");
    const auditDot = $("audit-dot");
    const usbDot = $("usb-dot");
    if (apiDot) apiDot.className = "status-dot " + (apiOnline ? "online" : "offline");
    if (backendDot) backendDot.className = "status-dot " + (apiOnline ? "online" : "offline");
    if (deviceDot) deviceDot.className = "status-dot " + (hardwareOnline ? "online" : "offline");
    if (auditDot) auditDot.className = "status-dot " + (auditValid ? "online" : "offline");
    if (usbDot) usbDot.className = "status-dot " + (hardwareOnline ? "online" : "offline");

    setText("api-status", apiOnline ? "Backend API Online" : "Backend API Offline");
    setText("device-status", hardwareOnline ? "ESP32-S3 Online" : "ESP32-S3 Offline");
    setText("backend-state", apiOnline ? "Online" : "Offline");
    setText("audit-state", auditValid ? "Valid" : (state.audit ? "Invalid" : "Unavailable"));
    setText("sidebar-audit", auditValid ? "Valid" : (state.audit ? "Invalid" : "Unavailable"));
    setText("usb-state", hardwareOnline ? "Connected" : "Waiting");
    setText("flow-device-state", hardwareOnline ? "Reporting" : "Waiting");
    const gateway = state.metrics?.gateway_mode || "unknown";
    setText("gateway-mode", gateway.toLowerCase() === "simulation" ? "Enforcement not configured" : "Gateway: " + gateway);
    const gatewayNode = $("gateway-mode");
    if (gatewayNode) gatewayNode.className = "status-pill warning";
  }

  function renderDashboard() {
    const metrics = state.metrics || {};
    const devices = state.devices || [];
    const incidents = state.incidents || [];
    const approvedCount = devices.filter((device) => device.status === "approved").length;
    setText("metric-devices", metrics.devices ?? devices.length);
    setText("metric-approved", approvedCount);
    setText("metric-isolated", metrics.isolated_devices ?? 0);
    setText("metric-incidents", metrics.incidents ?? incidents.length);
    setText("device-count", devices.length + (devices.length === 1 ? " device" : " devices"));

    const deviceList = $("device-list");
    if (deviceList) {
      if (!devices.length) {
        deviceList.innerHTML = '<div class="empty-state">No device records yet. Connect the ESP32-S3 and start the Windows USB bridge to send its first report.</div>';
      } else {
        deviceList.innerHTML = devices.map((device) => {
          const online = deviceIsOnline(device);
          const match = releaseMatch(device);
          const isolated = device.network_state === "isolated" || device.status === "violation";
          const suspicious = device.status === "suspicious";
          const badgeClass = isolated || suspicious || !online ? "bad" : "safe";
          const label = isolated ? "Isolation decision" : suspicious ? "Firmware mismatch" : online ? "Online" : "Offline";
          const matchText = match ? "Matches " + match.id : (device.reported_hash ? "No approved release match" : "No firmware hash reported");
          return '<article class="device-card searchable ' + ((isolated || suspicious) ? "danger" : "") + '" data-searchable>' +
            '<div class="device-card-top"><div><div class="device-name">' + escapeHtml(device.name || device.id) + '</div><div class="device-id">' + escapeHtml(device.id) + '</div></div>' +
            '<span class="status-pill ' + badgeClass + '">' + label + '</span></div>' +
            '<div class="device-facts">' +
              '<div class="fact-row"><span>Firmware Version</span><strong>' + escapeHtml(device.firmware_version || "Not reported") + '</strong></div>' +
              '<div class="fact-row"><span>Decision</span><strong>' + escapeHtml(device.last_decision || "Pending report") + '</strong></div>' +
              '<div class="fact-row"><span>Registry Comparison</span><strong class="' + (match ? "fact-good" : "fact-warn") + '">' + escapeHtml(matchText) + '</strong></div>' +
              '<div class="hash-fact"><span class="device-id">Reported Firmware SHA-256</span><code>' + escapeHtml(device.reported_hash || "Waiting for report") + '</code></div>' +
              '<div class="fact-row"><span>Last Report</span><strong>' + escapeHtml(formatTime(device.last_seen)) + '</strong></div>' +
            '</div><div class="card-actions"><button class="btn btn-outline" type="button" data-go-view="firmware">View Firmware Registry</button></div></article>';
        }).join("");
      }
    }

    const incidentList = $("incident-list");
    if (incidentList) {
      if (!incidents.length) {
        incidentList.innerHTML = '<div class="empty-state">No security incidents recorded.</div>';
      } else {
        incidentList.innerHTML = incidents.slice(0, 8).map((incident) => {
          const severity = String(incident.severity || "info").toLowerCase();
          const badge = severity === "high" || severity === "critical" ? "bad" : "warning";
          return '<article class="incident-item searchable" data-searchable><div class="incident-top"><strong>' +
            escapeHtml(String(incident.event_type || "event").replaceAll("_", " ")) +
            '</strong><span class="status-pill ' + badge + '">' + escapeHtml(severity) + '</span></div>' +
            '<div class="incident-meta">' + escapeHtml(incident.device_id) + ' · ' + escapeHtml(formatTime(incident.created_at)) + '</div>' +
            '<div class="incident-detail">' + escapeHtml(incident.details) + '</div></article>';
        }).join("");
      }
    }
    updateStatusIndicators();
    applySearch();
  }

  function renderFirmware() {
    const releases = state.releases || [];
    setText("release-count", releases.length + (releases.length === 1 ? " release" : " releases"));
    const list = $("release-list");
    if (list) {
      list.innerHTML = releases.length ? releases.map((release) => {
        const status = release.revoked ? "Revoked" : release.approved ? "Approved" : "Pending";
        const badge = release.revoked ? "bad" : release.approved ? "safe" : "warning";
        const action = release.revoked ? '<span class="table-meta">No action</span>' :
          '<div class="release-actions"><button class="btn btn-red btn-small" type="button" data-revoke="' + escapeHtml(release.id) + '">Revoke Release</button></div>';
        return '<article class="release-item searchable" data-searchable><div class="release-top"><strong>' +
          escapeHtml(release.version) + ' · ' + escapeHtml(release.id) +
          '</strong><span class="status-pill ' + badge + '">' + status + '</span></div>' +
          '<div class="release-hash"><code class="hash-code">' + escapeHtml(release.sha256) + '</code></div>' +
          (release.notes ? '<div class="release-version">' + escapeHtml(release.notes) + '</div>' : '') + action + '</article>';
      }).join("") : '<div class="empty-state">No firmware releases registered.</div>';
    }

    const comparison = $("device-firmware-table");
    if (comparison) {
      if (!state.devices.length) {
        comparison.innerHTML = '<div class="empty-state">No device reports available.</div>';
      } else {
        comparison.innerHTML = '<table class="data-table"><thead><tr><th>Device</th><th>Version</th><th>Reported SHA-256</th><th>Registry Match</th></tr></thead><tbody>' +
          state.devices.map((device) => {
            const match = releaseMatch(device);
            return '<tr class="searchable" data-searchable><td><strong>' + escapeHtml(device.name || device.id) + '</strong><span class="table-meta">' + escapeHtml(device.id) + '</span></td>' +
              '<td>' + escapeHtml(device.firmware_version || "Not reported") + '</td>' +
              '<td><code class="hash-code">' + escapeHtml(device.reported_hash || "No report") + '</code></td>' +
              '<td><span class="status-pill ' + (match ? "safe" : "warning") + '">' + escapeHtml(match ? "Matches " + match.id : "No approved match") + '</span></td></tr>';
          }).join("") + '</tbody></table>';
      }
    }
    applySearch();
  }

  function renderAudit() {
    const audit = state.audit;
    const valid = Boolean(audit && audit.chain_valid);
    setText("audit-count", audit ? audit.count : "—");
    setText("audit-entry-count", audit ? audit.count + (audit.count === 1 ? " entry" : " entries") : "0 entries");
    setText("audit-valid", audit ? (valid ? "VALID" : "INVALID") : "—");
    const list = $("audit-list");
    if (!list) return;
    if (!audit || !Array.isArray(audit.entries) || !audit.entries.length) {
      list.innerHTML = '<div class="empty-state">' + (audit ? "No audit entries recorded." : "Audit data unavailable.") + '</div>';
    } else {
      list.innerHTML = audit.entries.slice().reverse().map((entry) => {
        const payload = JSON.stringify(entry.payload || {});
        return '<article class="audit-entry searchable" data-searchable><div class="audit-entry-top"><strong>' +
          escapeHtml(String(entry.event_type || "event").replaceAll("_", " ")) +
          '</strong><span class="audit-time">Entry #' + escapeHtml(entry.id) + ' · ' + escapeHtml(formatTime(entry.created_at)) + '</span></div>' +
          '<div class="audit-payload">' + escapeHtml(payload) + '</div>' +
          '<div class="audit-hashes"><label>Previous Hash<code>' + escapeHtml(entry.previous_hash || "") + '</code></label><label>Entry Hash<code>' + escapeHtml(entry.entry_hash || "") + '</code></label></div></article>';
      }).join("");
    }
    updateStatusIndicators();
    applySearch();
  }

  function renderSimulatorLog() {
    const log = $("simulator-log");
    if (!log) return;
    log.innerHTML = state.simulatorLog.map((entry) => '<div class="log-entry">' + escapeHtml(entry) + '</div>').join("");
  }

  function renderAll() {
    renderDashboard();
    renderFirmware();
    renderAudit();
    renderSimulatorLog();
  }

  async function refreshData(showMessage = false) {
    if (state.loading) return;
    state.loading = true;
    const button = $("refresh-btn");
    if (button) button.disabled = true;
    try {
      const results = await Promise.allSettled([
        api("/api/health"),
        api("/api/metrics"),
        api("/api/hardware/status"),
        api("/api/devices"),
        api("/api/releases"),
        api("/api/incidents"),
        api("/api/audit"),
      ]);
      const setters = ["health", "metrics", "hardware", "devices", "releases", "incidents", "audit"];
      const failures = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") state[setters[index]] = result.value;
        else failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      });
      if (failures.length) {
        setText("api-status", "Backend/API issue");
        const dot = $("api-dot");
        if (dot) dot.className = "status-dot offline";
        if (showMessage) showToast(failures.join(" · "), true);
      } else if (showMessage) {
        showToast("FirmaChain data refreshed.");
      }
      renderAll();
    } catch (error) {
      if (showMessage) showToast(error instanceof Error ? error.message : "Refresh failed.", true);
    } finally {
      state.loading = false;
      if (button) button.disabled = false;
    }
  }

  const pageInfo = {
    dashboard: ["Security Command Center", "Device status, firmware integrity and security events"],
    firmware: ["Device Software & Integrity", "Approved firmware releases and device-reported hash comparisons"],
    audit: ["Security History", "Server-recorded audit entries and hash-chain validation"],
    simulator: ["Attack Simulator (Demo Only)", "Browser-only sample scenarios; no live hardware or network actions"],
  };

  function setView(view, addHistory = true) {
    if (!pageInfo[view]) view = "dashboard";
    state.activeView = view;
    document.querySelectorAll(".view").forEach((section) => {
      section.classList.toggle("active", section.id === "view-" + view);
    });
    document.querySelectorAll(".nav-btn").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    setText("current-page-title", pageInfo[view][0]);
    setText("current-page-subtitle", pageInfo[view][1]);
    if (addHistory) {
      const hash = "#" + view;
      if (location.hash !== hash) history.pushState({ view }, "", hash);
    }
    applySearch();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function applySearch() {
    const input = $("global-search");
    if (!input) return;
    const query = input.value.trim().toLowerCase();
    const active = $("view-" + state.activeView);
    if (!active) return;
    active.querySelectorAll("[data-searchable]").forEach((node) => {
      node.hidden = Boolean(query) && !node.textContent.toLowerCase().includes(query);
    });
  }

  async function registerDevice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const hash = String(data.firmware_hash || "").trim();
    const message = $("register-message");
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      if (message) { message.textContent = "Enter a valid 64-character SHA-256 hash."; message.className = "form-message error"; }
      return;
    }
    try {
      await api("/api/devices/register", { method: "POST", body: JSON.stringify({
        device_id: String(data.device_id).trim(),
        name: String(data.name).trim(),
        firmware_version: String(data.firmware_version).trim(),
        firmware_hash: hash.toLowerCase(),
      }) });
      if (message) { message.textContent = "Device record saved."; message.className = "form-message"; }
      form.reset();
      form.elements.device_id.value = "esp32-s3-usb-01";
      form.elements.name.value = "ESP32-S3 Device";
      form.elements.firmware_version.value = "1.0.0";
      showToast("Device registration saved. No firmware was flashed and no certificate was issued.");
      await refreshData();
    } catch (error) {
      if (message) { message.textContent = error instanceof Error ? error.message : "Registration failed."; message.className = "form-message error"; }
    }
  }

  function askAdminToken() {
    return window.prompt("Enter the firmware administrator bearer token. It will only be used for this request and will not be saved.");
  }

  async function createRelease(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const hash = String(data.sha256 || "").trim();
    const message = $("release-message");
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      if (message) { message.textContent = "Enter a valid 64-character SHA-256 hash."; message.className = "form-message error"; }
      return;
    }
    const token = askAdminToken();
    if (!token) return;
    try {
      await api("/api/releases", { method: "POST", body: JSON.stringify({
        release_id: String(data.release_id).trim(),
        version: String(data.version).trim(),
        sha256: hash.toLowerCase(),
        notes: String(data.notes || "").trim(),
      }), headers: { Authorization: "Bearer " + token } });
      if (message) { message.textContent = "Firmware release registered."; message.className = "form-message"; }
      form.elements.sha256.value = "";
      form.elements.notes.value = "";
      showToast("Firmware release registered in the server registry.");
      await refreshData();
    } catch (error) {
      if (message) { message.textContent = error instanceof Error ? error.message : "Release registration failed."; message.className = "form-message error"; }
    }
  }

  async function revokeRelease(releaseId) {
    if (!window.confirm("Revoke firmware release " + releaseId + "?")) return;
    const token = askAdminToken();
    if (!token) return;
    try {
      await api("/api/releases/" + encodeURIComponent(releaseId) + "/revoke", {
        method: "POST", body: JSON.stringify({}), headers: { Authorization: "Bearer " + token },
      });
      showToast("Release " + releaseId + " has been revoked.");
      await refreshData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Release revocation failed.", true);
    }
  }

  function runSimulation(type) {
    const scenarios = {
      firmware: [
        "SIMULATION: a sample firmware hash was changed to an unapproved value.",
        "SIMULATION: the sample hash is shown as not matching the approved registry.",
        "SIMULATION: a local demonstration alert was generated.",
        "No report was sent to the backend and no firewall rule or ESP32 state was changed.",
      ],
      network: [
        "SIMULATION: sample MQTT traffic was raised above its normal message rate.",
        "SIMULATION: a rate-anomaly warning was displayed for the example target.",
        "SIMULATION: the event is visible only in this browser session.",
        "No network traffic was generated and no device was isolated.",
      ],
      sensor: [
        "SIMULATION: sample temperature and voltage readings were changed to abnormal values.",
        "SIMULATION: the values are marked for operator review.",
        "SIMULATION: the event is visible only in this browser session.",
        "No physical sensor reading or ESP32 state was changed.",
      ],
    };
    const names = { firmware: "Malicious Firmware Injection", network: "MQTT Packet Flood", sensor: "Sensor Spoofing" };
    state.simulatorLog.unshift("[" + new Date().toLocaleTimeString() + "] " + names[type] + " — local demo started.");
    scenarios[type].forEach((line) => state.simulatorLog.unshift(line));
    state.simulatorLog = state.simulatorLog.slice(0, 22);
    renderSimulatorLog();
  }

  document.querySelectorAll(".nav-btn").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.goView)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => {
    const target = $(button.dataset.go);
    if (target) {
      target.open = true;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }));

  $("refresh-btn")?.addEventListener("click", () => refreshData(true));
  $("firmware-refresh")?.addEventListener("click", () => refreshData(true));
  $("audit-refresh")?.addEventListener("click", () => refreshData(true));
  $("global-search")?.addEventListener("input", applySearch);
  $("device-register-form")?.addEventListener("submit", registerDevice);
  $("release-create-form")?.addEventListener("submit", createRelease);
  $("release-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-revoke]");
    if (button) revokeRelease(button.dataset.revoke);
  });
  document.querySelectorAll("[data-scenario]").forEach((button) => button.addEventListener("click", () => runSimulation(button.dataset.scenario)));
  $("clear-sim-log")?.addEventListener("click", () => {
    state.simulatorLog = ["Simulation log cleared. No live device or network action was performed."];
    renderSimulatorLog();
  });
  window.addEventListener("popstate", () => setView(location.hash.slice(1) || "dashboard", false));

  setView(location.hash.slice(1) || "dashboard", false);
  refreshData();
  window.setInterval(() => refreshData(false), 5000);
})();