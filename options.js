// /options.js
// Keep "Forever" from changing the ms field; remember last non-zero in chrome.storage.local.

const DEFAULTS = {
  settings: {
    prefixPlaying: "⏳",
    prefixPaused: "⏸",
    updateIntervalMs: 250,
    defaultEnabled: false,
    hideWhenInactive: false,
    finishedPrefix: "✓ Finished",
    finishedHoldMs: 0 // 0 = forever
  },
  sites: {}
};

const UI_CACHE_KEY = "uiCachedHoldMs"; // chrome.storage.local

function $(id) { return document.getElementById(id); }

function setStatus(msg, ok = true) {
  const el = $("status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok ? "inherit" : "#b00020";
}

/* ---------- Load & render ---------- */
async function load() {
  try {
    const [{ settings: s0, sites }, cache] = await Promise.all([
      chrome.storage.sync.get(["settings", "sites"]),
      chrome.storage.local.get([UI_CACHE_KEY])
    ]);
    const s = { ...DEFAULTS.settings, ...(s0 || {}) };
    const cachedHold = Number.isFinite(cache[UI_CACHE_KEY]) ? cache[UI_CACHE_KEY] : 8000;

    $("prefixPlaying").value = s.prefixPlaying;
    $("prefixPaused").value = s.prefixPaused;
    $("finishedPrefix").value = s.finishedPrefix;

    // If settings hold is 0 (forever), show cached non-zero value in the box, keep it disabled.
    const showMs = s.finishedHoldMs === 0 ? cachedHold : s.finishedHoldMs;
    $("finishedHoldMs").value = String(showMs);
    $("finishedHoldForever").checked = s.finishedHoldMs === 0;
    $("finishedHoldMs").disabled = s.finishedHoldMs === 0;

    $("updateIntervalMs").value = String(s.updateIntervalMs);
    $("defaultEnabled").checked = !!s.defaultEnabled;
    $("hideWhenInactive").checked = !!s.hideWhenInactive;

    const host = (await getActiveHostname()) || "";
    $("currentHost").value = host;
    $("finishedEnabledThisSite").checked = (sites?.[host]?.finishedEnabled ?? true);

    renderSites(sites || {});
    updateHoldHint(); // dynamic hint text
    setStatus("Loaded ✓", true);
  } catch (e) {
    console.error(e);
    setStatus("Failed to load options", false);
  }
}

/* ---------- Helpers ---------- */
function readNumeric(id, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = Number($(id).value);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, raw));
}

async function cacheHoldMs(value) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) {
    await chrome.storage.local.set({ [UI_CACHE_KEY]: num });
  }
}

function updateHoldHint() {
  const forever = $("finishedHoldForever").checked;
  const ms = readNumeric("finishedHoldMs", 8000, { min: 0 });
  const hint = $("finishedHoldHint");

  if (forever) {
    hint.textContent = "Forever (saved as 0 ms). The box keeps your last non-zero value.";
  } else if (ms === 0) {
    hint.textContent = "0 ms means forever.";
  } else {
    const s = Math.round(ms / 1000);
    const human =
      s >= 3600 ? `${(s / 3600).toFixed(1)} h` :
      s >= 60   ? `${Math.round(s / 60)} min` :
                  `${s} s`;
    hint.textContent = `Will display for ${ms} ms (~${human})`;
  }
}

/* ---------- Save / Reset ---------- */
async function save() {
  try {
    const forever = $("finishedHoldForever").checked;
    const currentBoxMs = readNumeric("finishedHoldMs", 8000, { min: 0 });

    // Always keep a cached non-zero ms when user types
    if (currentBoxMs > 0) await cacheHoldMs(currentBoxMs);

    const settings = {
      prefixPlaying: $("prefixPlaying").value || "⏳",
      prefixPaused: $("prefixPaused").value || "⏸",
      finishedPrefix: $("finishedPrefix").value || "✓ Finished",
      finishedHoldMs: forever ? 0 : currentBoxMs,
      updateIntervalMs: readNumeric("updateIntervalMs", 250, { min: 100 }),
      defaultEnabled: $("defaultEnabled").checked,
      hideWhenInactive: $("hideWhenInactive").checked
    };

    await chrome.storage.sync.set({ settings });
    await notifyActive("APPLY_SETTINGS");
    setStatus("Saved ✓", true);
  } catch (e) {
    console.error(e);
    setStatus("Save failed", false);
  }
}

async function reset() {
  try {
    await chrome.storage.sync.set(DEFAULTS);
    // Reset UI cache to default suggestion (8s)
    await chrome.storage.local.set({ [UI_CACHE_KEY]: 8000 });
    await load();
    await notifyActive("APPLY_SETTINGS");
    setStatus("Reset to defaults ✓", true);
  } catch (e) {
    console.error(e);
    setStatus("Reset failed", false);
  }
}

/* ---------- Sites table ---------- */
function renderSites(sites) {
  const tbody = $("sitesTable").querySelector("tbody");
  tbody.innerHTML = "";
  const entries = Object.entries(sites || {});
  if (!entries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4">No site overrides yet.</td>`;
    tbody.appendChild(tr);
    return;
  }
  for (const [host, { enabled = true, finishedEnabled = true }] of entries.sort()) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${host}</td>
      <td>${enabled ? "Enabled" : "Disabled"}</td>
      <td>${finishedEnabled ? "On" : "Off"}</td>
      <td>
        <button data-host="${host}" data-action="toggle">${enabled ? "Disable" : "Enable"}</button>
        <button data-host="${host}" data-action="toggle-finished">${finishedEnabled ? "Hide Finished" : "Show Finished"}</button>
        <button data-host="${host}" data-action="remove">Remove</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.addEventListener("click", onSitesAction, { once: true });
}

async function onSitesAction(e) {
  const btn = e.target.closest("button"); if (!btn) return;
  try {
    const host = btn.dataset.host, action = btn.dataset.action;
    const store = await chrome.storage.sync.get(["sites"]);
    const sites = store.sites || {};
    const cur = sites[host] || { enabled: true, finishedEnabled: true };

    if (action === "toggle") cur.enabled = !cur.enabled;
    else if (action === "toggle-finished") cur.finishedEnabled = !(cur.finishedEnabled ?? true);
    else if (action === "remove") { delete sites[host]; await chrome.storage.sync.set({ sites }); renderSites(sites); await notifyActive("APPLY_SETTINGS"); setStatus(`Removed ${host} ✓`, true); return; }

    sites[host] = cur;
    await chrome.storage.sync.set({ sites });
    renderSites(sites);
    await notifyActive("APPLY_SETTINGS");
    setStatus("Updated site overrides ✓", true);
  } catch (e2) {
    console.error(e2);
    setStatus("Site update failed", false);
  }
}

/* ---------- Per-site apply/toggle ---------- */
async function applySitePrefsForCurrent() {
  try {
    const host = $("currentHost").value.trim();
    if (!host) return;
    const store = await chrome.storage.sync.get(["sites"]);
    const sites = store.sites || {};
    const entry = sites[host] || { enabled: true, finishedEnabled: true };
    entry.finishedEnabled = $("finishedEnabledThisSite").checked;
    sites[host] = entry;
    await chrome.storage.sync.set({ sites });
    renderSites(sites);
    await notifyActive("APPLY_SETTINGS");
    setStatus(`Applied site prefs for ${host} ✓`, true);
  } catch (e) {
    console.error(e);
    setStatus("Apply failed", false);
  }
}

async function toggleCurrentHost() {
  try {
    const host = $("currentHost").value.trim();
    if (!host) return;
    const store = await chrome.storage.sync.get(["sites"]);
    const sites = store.sites || {};
    const entry = sites[host] || { enabled: true, finishedEnabled: true };
    entry.enabled = !entry.enabled;
    sites[host] = entry;
    await chrome.storage.sync.set({ sites });
    renderSites(sites);
    await notifyActive("APPLY_SETTINGS");
    setStatus(`${entry.enabled ? "Enabled" : "Disabled"} ${host} ✓`, true);
  } catch (e) {
    console.error(e);
    setStatus("Toggle failed", false);
  }
}

/* ---------- Tabs/notify ---------- */
async function getActiveHostname() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url ? new URL(tab.url).hostname : "";
  } catch { return ""; }
}

async function notifyActive(type) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type });
  } catch { /* content not available on chrome:// etc. */ }
}

/* ---------- Wire up ---------- */
document.addEventListener("DOMContentLoaded", () => {
  load();

  $("save").addEventListener("click", (e) => { e.preventDefault(); save(); });
  $("reset").addEventListener("click", (e) => { e.preventDefault(); reset(); });
  $("toggleSite").addEventListener("click", (e) => { e.preventDefault(); toggleCurrentHost(); });
  $("applySitePrefs").addEventListener("click", (e) => { e.preventDefault(); applySitePrefsForCurrent(); });

  $("finishedHoldForever").addEventListener("change", async () => {
    const forever = $("finishedHoldForever").checked;
    const msBox = $("finishedHoldMs");
    if (!forever) {
      // Restore cached non-zero ms if available
      const cache = await chrome.storage.local.get([UI_CACHE_KEY]);
      const cached = Number.isFinite(cache[UI_CACHE_KEY]) ? cache[UI_CACHE_KEY] : 8000;
      if (Number(msBox.value) === 0 || msBox.value === "" || !Number.isFinite(Number(msBox.value))) {
        msBox.value = String(cached);
      }
    }
    msBox.disabled = forever;
    updateHoldHint();
  });

  $("finishedHoldMs").addEventListener("input", async () => {
    const ms = Number($("finishedHoldMs").value);
    if (Number.isFinite(ms) && ms > 0) {
      await cacheHoldMs(ms);
    }
    updateHoldHint();
  });
});
