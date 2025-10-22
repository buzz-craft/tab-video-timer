// options.js
// Robust messaging: filter tabs without content scripts and catch promise rejections.
// Dynamic hold hint (~seconds / indefinitely). Separate LIVE/VOD/Paused titles.

(() => {
  const DEFAULTS = {
    // legacy fallback kept for migration
    prefixPlaying: "⏳",
    prefixLivePlaying: "🔴 LIVE",
    prefixVODPlaying: "⏳",
    prefixPaused: "⏸",
    finishedPrefix: "✓ Finished",
    finishedHoldMs: 0,
    updateIntervalMs: 250,
    defaultEnabled: false,
    hideWhenInactive: false,
    liveShowElapsed: true
  };

  const $ = (id) => document.getElementById(id);

  const canonicalHost = (h) => {
    const host = (h || "").toLowerCase();
    if (host.endsWith(".youtube.com") || host === "youtube.com" || host === "youtu.be") return "youtube.com";
    if (host.endsWith(".twitch.tv") || host === "twitch.tv") return "twitch.tv";
    return host;
  };

  let settings = { ...DEFAULTS };
  let sites = {};
  let currentHost = "";

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    await loadAll();
    seedCurrentHostFromActiveTab();
    renderForm();
    renderSitesTable();
    wireEvents();
    syncHoldHint();
  }

  function wireEvents() {
    $("save").addEventListener("click", onSave);
    $("reset").addEventListener("click", onResetDefaults);
    $("toggleSite").addEventListener("click", onToggleSite);
    $("applySitePrefs").addEventListener("click", onApplySitePrefs);

    $("finishedHoldMs").addEventListener("input", syncHoldHint);
    $("finishedHoldForever").addEventListener("change", syncHoldHint);
  }

  async function loadAll() {
    const { settings: storedSettings = {}, sites: storedSites = {} } =
      await chrome.storage.sync.get(["settings", "sites"]);

    settings = { ...DEFAULTS, ...storedSettings };

    // UI-only migration from legacy prefixPlaying → both new fields (until Save)
    if (storedSettings.prefixLivePlaying == null && storedSettings.prefixVODPlaying == null) {
      if (typeof storedSettings.prefixPlaying === "string" && storedSettings.prefixPlaying.trim()) {
        settings.prefixLivePlaying = storedSettings.prefixPlaying;
        settings.prefixVODPlaying  = storedSettings.prefixPlaying;
      }
    }

    sites = { ...storedSites };
  }

  // ---------- Tab utilities ----------
  function isWebTab(url = "") {
    // Content scripts don't exist on chrome://, edge://, about:, chrome-extension://, etc.
    // We allow http(s), file, ftp (matches your <all_urls> policy except restricted schemes).
    return /^(https?:|file:|ftp:)/i.test(url);
  }

  async function listWebTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(t => isWebTab(t.url || ""));
  }

  function sendToTab(tabId, message) {
    // Use promise form and always catch to avoid "Uncaught (in promise)".
    return chrome.tabs.sendMessage(tabId, message).catch(() => {/* ignore missing receivers */});
  }

  async function broadcastApply() {
    try {
      const tabs = await listWebTabs();
      await Promise.allSettled(tabs.map(t => sendToTab(t.id, { type: "APPLY_SETTINGS" })));
    } catch {
      // ignore
    }
  }

  function seedCurrentHostFromActiveTab() {
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const url = tabs?.[0]?.url || "";
        try {
          const u = new URL(url);
          currentHost = u.hostname || "";
        } catch { currentHost = ""; }
        $("currentHost").value = currentHost;
        const site = sites[canonicalHost(currentHost)] || sites[currentHost] || {};
        $("finishedEnabledThisSite").checked = site.finishedEnabled ?? true;
      });
    } catch { /* ignore */ }
  }

  // ---------- Form ----------
  function renderForm() {
    $("prefixLivePlaying").value = settings.prefixLivePlaying ?? DEFAULTS.prefixLivePlaying;
    $("prefixVODPlaying").value  = settings.prefixVODPlaying  ?? DEFAULTS.prefixVODPlaying;
    $("prefixPaused").value      = settings.prefixPaused      ?? DEFAULTS.prefixPaused;
    $("finishedPrefix").value    = settings.finishedPrefix    ?? DEFAULTS.finishedPrefix;

    const hold = Number(settings.finishedHoldMs) || 0;
    $("finishedHoldMs").value = hold;
    $("finishedHoldForever").checked = hold === 0;

    $("updateIntervalMs").value = Number(settings.updateIntervalMs) || DEFAULTS.updateIntervalMs;
    $("defaultEnabled").checked = !!settings.defaultEnabled;
    $("hideWhenInactive").checked = !!settings.hideWhenInactive;
    $("liveShowElapsed").checked = !!settings.liveShowElapsed;
  }

  function syncHoldHint() {
    const hint = $("finishedHoldHint");
    const forever = $("finishedHoldForever").checked;
    const msRaw = Number($("finishedHoldMs").value || 0);
    if (forever) {
      hint.textContent = "Title will be held indefinitely";
      return;
    }
    const secs = Math.max(0, Math.round(msRaw / 1000));
    hint.textContent = `Approximately ~${secs} second${secs === 1 ? "" : "s"}`;
  }

  function getFormSettings() {
    const forever = $("finishedHoldForever").checked;
    const holdVal = Number($("finishedHoldMs").value || 0);
    const holdToSave = forever ? 0 : Math.max(0, holdVal);

    return {
      prefixLivePlaying: $("prefixLivePlaying").value || DEFAULTS.prefixLivePlaying,
      prefixVODPlaying:  $("prefixVODPlaying").value  || DEFAULTS.prefixVODPlaying,
      prefixPaused:      $("prefixPaused").value      || DEFAULTS.prefixPaused,
      finishedPrefix:    $("finishedPrefix").value    || DEFAULTS.finishedPrefix,
      finishedHoldMs:    holdToSave,
      updateIntervalMs:  Math.max(100, Number($("updateIntervalMs").value || DEFAULTS.updateIntervalMs)),
      defaultEnabled:    $("defaultEnabled").checked,
      hideWhenInactive:  $("hideWhenInactive").checked,
      liveShowElapsed:   $("liveShowElapsed").checked
    };
  }

  // ---------- Actions ----------
  async function onSave() {
    const newSettings = getFormSettings();
    await chrome.storage.sync.set({ settings: newSettings });

    await broadcastApply();

    settings = { ...DEFAULTS, ...newSettings };
    showStatus("Saved ✓");
  }

  async function onResetDefaults() {
    settings = { ...DEFAULTS };
    renderForm();
    syncHoldHint();
    showStatus("Reset fields to defaults. Click Save to apply.");
  }

  function renderSitesTable() {
    const tbody = document.querySelector("#sitesTable tbody");
    tbody.innerHTML = "";

    const rows = Object.entries(sites).map(([host, cfg]) => ({ host, cfg }));
    rows.sort((a, b) => a.host.localeCompare(b.host));

    for (const { host, cfg } of rows) {
      const tr = document.createElement("tr");

      const tdHost = document.createElement("td");
      tdHost.textContent = host;

      const tdEnabled = document.createElement("td");
      tdEnabled.textContent = cfg.enabled ? "On" : "Off";

      const tdFinished = document.createElement("td");
      tdFinished.textContent = (cfg.finishedEnabled ?? true) ? "Shown" : "Hidden";

      const tdActions = document.createElement("td");
      const btnToggle = document.createElement("button");
      btnToggle.textContent = cfg.enabled ? "Disable" : "Enable";
      btnToggle.addEventListener("click", async () => {
        cfg.enabled = !cfg.enabled;
        await chrome.storage.sync.set({ sites });
        renderSitesTable();
        showStatus(`Site ${host}: ${cfg.enabled ? "enabled" : "disabled"}`);
        await broadcastApply();
      });
      const btnRemove = document.createElement("button");
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", async () => {
        delete sites[host];
        await chrome.storage.sync.set({ sites });
        renderSitesTable();
        showStatus(`Removed site override: ${host}`);
        await broadcastApply();
      });

      tdActions.appendChild(btnToggle);
      tdActions.appendChild(btnRemove);

      tr.appendChild(tdHost);
      tr.appendChild(tdEnabled);
      tr.appendChild(tdFinished);
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    }
  }

  async function onToggleSite() {
    const hostRaw = $("currentHost").value.trim();
    if (!hostRaw) return;

    const canon = canonicalHost(hostRaw);
    const cur = sites[canon] || sites[hostRaw] || { enabled: settings.defaultEnabled, finishedEnabled: true };

    cur.enabled = !cur.enabled;

    delete sites[hostRaw];
    sites[canon] = cur;

    await chrome.storage.sync.set({ sites });
    renderSitesTable();
    $("finishedEnabledThisSite").checked = cur.finishedEnabled ?? true;
    showStatus(`${canon}: ${cur.enabled ? "enabled" : "disabled"}`);
    await broadcastApply();
  }

  async function onApplySitePrefs() {
    const hostRaw = $("currentHost").value.trim();
    if (!hostRaw) return;

    const canon = canonicalHost(hostRaw);
    const cur = sites[canon] || sites[hostRaw] || { enabled: settings.defaultEnabled, finishedEnabled: true };

    cur.finishedEnabled = $("finishedEnabledThisSite").checked;

    delete sites[hostRaw];
    sites[canon] = cur;

    await chrome.storage.sync.set({ sites });
    renderSitesTable();
    showStatus(`${canon}: Finished banner ${cur.finishedEnabled ? "shown" : "hidden"}`);
    await broadcastApply();
  }

  function showStatus(msg) {
    const s = $("status");
    s.textContent = msg;
    s.classList.add("show");
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => { s.textContent = ""; s.classList.remove("show"); }, 1600);
  }
})();
