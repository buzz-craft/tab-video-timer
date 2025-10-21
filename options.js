// options.js
// Exposes separate prefixes: prefixLivePlaying, prefixVODPlaying (paused shared via prefixPaused).
// Migrates from legacy `prefixPlaying` on load (UI only) until user clicks Save.

(() => {
  const DEFAULTS = {
    prefixPlaying: "⏳",           // legacy fallback (kept for migration)
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

  // DOM helpers
  const $ = (id) => document.getElementById(id);

  // Canonicalize host names like content.js does
  const canonicalHost = (h) => {
    const host = (h || "").toLowerCase();
    if (host.endsWith(".youtube.com") || host === "youtube.com" || host === "youtu.be") return "youtube.com";
    if (host.endsWith(".twitch.tv") || host === "twitch.tv") return "twitch.tv";
    return host;
  };

  let settings = { ...DEFAULTS };
  let sites = {};             // as stored (raw)
  let currentHost = "";       // raw current tab host

  // ---- UI wiring ----
  async function init() {
    await loadAll();
    seedCurrentHostFromActiveTab();
    renderForm();
    renderSitesTable();

    // Events
    $("save").addEventListener("click", onSave);
    $("reset").addEventListener("click", onResetDefaults);
    $("toggleSite").addEventListener("click", onToggleSite);
    $("applySitePrefs").addEventListener("click", onApplySitePrefs);

    // Keep hint text consistent with the number input
    const holdMs = $("finishedHoldMs");
    const hint = $("finishedHoldHint");
    const forever = $("finishedHoldForever");
    const syncHint = () => {
      const val = Number(holdMs.value || 0);
      hint.textContent = val === 0 ? "Set 0 to keep “Finished” indefinitely"
                                   : `Currently: ${val} ms (set 0 for Forever)`;
    };
    holdMs.addEventListener("input", syncHint);
    forever.addEventListener("change", () => {
      // Do not overwrite the numeric box; only affect how we save
      syncHint();
    });
    syncHint();
  }

  async function loadAll() {
    const { settings: storedSettings = {}, sites: storedSites = {} } =
      await chrome.storage.sync.get(["settings", "sites"]);

    // Merge defaults
    settings = { ...DEFAULTS, ...storedSettings };

    // ---- Migration logic (UI only; save happens on user action) ----
    // If new keys are missing but legacy prefixPlaying exists, surface it in both fields.
    if (storedSettings.prefixLivePlaying == null && storedSettings.prefixVODPlaying == null) {
      if (typeof storedSettings.prefixPlaying === "string" && storedSettings.prefixPlaying.trim()) {
        settings.prefixLivePlaying = storedSettings.prefixPlaying;
        settings.prefixVODPlaying  = storedSettings.prefixPlaying;
      }
    }

    sites = { ...storedSites };
  }

  function seedCurrentHostFromActiveTab() {
    try {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const url = tabs?.[0]?.url || "";
        try {
          const u = new URL(url);
          currentHost = u.hostname || "";
        } catch {
          currentHost = "";
        }
        $("currentHost").value = currentHost;
        // Preload finished checkbox from stored sites if present
        const site = sites[canonicalHost(currentHost)] || sites[currentHost] || {};
        $("finishedEnabledThisSite").checked = site.finishedEnabled ?? true;
      });
    } catch {
      // ignore
    }
  }

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

  function getFormSettings() {
    // Do not zero out numeric when Forever is checked; we only write 0 on save if checkbox is on
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

  async function onSave() {
    const newSettings = getFormSettings();

    // Persist
    await chrome.storage.sync.set({ settings: newSettings });

    // Ping all tabs to apply without reload
    try {
      const tabs = await chrome.tabs.query({});
      for (const t of tabs) {
        try { chrome.tabs.sendMessage(t.id, { type: "APPLY_SETTINGS" }); } catch {}
      }
    } catch {}

    settings = { ...DEFAULTS, ...newSettings };
    showStatus("Saved ✓");
  }

  async function onResetDefaults() {
    // Reset UI to defaults; do not overwrite sites
    settings = { ...DEFAULTS };
    renderForm();
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
        broadcastApply();
      });
      const btnRemove = document.createElement("button");
      btnRemove.textContent = "Remove";
      btnRemove.addEventListener("click", async () => {
        delete sites[host];
        await chrome.storage.sync.set({ sites });
        renderSitesTable();
        showStatus(`Removed site override: ${host}`);
        broadcastApply();
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

    // Store canonized key
    delete sites[hostRaw];
    sites[canon] = cur;

    await chrome.storage.sync.set({ sites });
    renderSitesTable();
    $("finishedEnabledThisSite").checked = cur.finishedEnabled ?? true;
    showStatus(`${canon}: ${cur.enabled ? "enabled" : "disabled"}`);
    broadcastApply();
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
    broadcastApply();
  }

  function broadcastApply() {
    try {
      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
          try { chrome.tabs.sendMessage(t.id, { type: "APPLY_SETTINGS" }); } catch {}
        }
      });
    } catch {}
  }

  function showStatus(msg) {
    const s = $("status");
    s.textContent = msg;
    s.classList.add("show");
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => { s.textContent = ""; s.classList.remove("show"); }, 1600);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
