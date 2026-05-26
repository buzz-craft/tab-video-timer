// options.js
// Robust messaging: filter tabs without content scripts and catch promise rejections.
// Dynamic hold hint (~seconds / indefinitely). Separate LIVE/VOD/Paused titles.

(() => {
  const DEFAULTS = {
    // legacy fallback kept for migration
    prefixPlaying: "⏳",
    prefixLivePlaying: "🔴",
    prefixVODPlaying: "⏳",
    prefixPaused: "⏸",
    finishedPrefix: "✓ Finished",
    finishedHoldMs: 0,
    updateIntervalMs: 250,
    defaultEnabled: false,
    hideWhenInactive: false,
    liveShowElapsed: true,
    vodTimerMode: 'countdown',
    showPercent: false,
    separator: ' • ',
    speedAwareCountdown: true,
    showChapters: true,
    endNotification: false,
    breakReminderMins: 0,
    dailyLimitMins: 0,
    trackWatchTime: true,
    showOverlay: false,
    overlayPosition: 'bottom-right',
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
    renderStreamingSites();
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

    $("savePlayback").addEventListener("click", onSavePlayback);
    $("saveAlerts").addEventListener("click", onSaveAlerts);
    $("clearStats").addEventListener("click", onClearStats);
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

    const vodMode = settings.vodTimerMode ?? DEFAULTS.vodTimerMode;
    const modeRadio = document.querySelector(`input[name="vodTimerMode"][value="${vodMode}"]`);
    if (modeRadio) modeRadio.checked = true;

    $("separator").value   = settings.separator  ?? DEFAULTS.separator;
    $("showPercent").checked = !!settings.showPercent;

    $("speedAwareCountdown").checked = settings.speedAwareCountdown ?? DEFAULTS.speedAwareCountdown;
    $("showChapters").checked        = settings.showChapters        ?? DEFAULTS.showChapters;
    $("showOverlay").checked         = settings.showOverlay         ?? DEFAULTS.showOverlay;
    $("overlayPosition").value       = settings.overlayPosition     ?? DEFAULTS.overlayPosition;

    $("trackWatchTime").checked      = settings.trackWatchTime      ?? DEFAULTS.trackWatchTime;
    $("endNotification").checked     = settings.endNotification     ?? DEFAULTS.endNotification;
    $("breakReminderMins").value     = settings.breakReminderMins   ?? DEFAULTS.breakReminderMins;
    $("dailyLimitMins").value        = settings.dailyLimitMins      ?? DEFAULTS.dailyLimitMins;
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
      liveShowElapsed:   $("liveShowElapsed").checked,
      vodTimerMode: (document.querySelector('input[name="vodTimerMode"]:checked') || {}).value || 'countdown',
      showPercent:  $("showPercent").checked,
      separator:    $("separator").value !== undefined ? $("separator").value : ' • ',
      speedAwareCountdown: $("speedAwareCountdown").checked,
      showChapters:        $("showChapters").checked,
      showOverlay:         $("showOverlay").checked,
      overlayPosition:     $("overlayPosition").value || DEFAULTS.overlayPosition,
      trackWatchTime:      $("trackWatchTime").checked,
      endNotification:     $("endNotification").checked,
      breakReminderMins:   Math.max(0, Number($("breakReminderMins").value) || 0),
      dailyLimitMins:      Math.max(0, Number($("dailyLimitMins").value) || 0),
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

  function showStatus(msg, elemId = "status") {
    const s = $(elemId);
    if (!s) return;
    s.textContent = msg;
    s.classList.add("show");
    clearTimeout(showStatus["_t_" + elemId]);
    showStatus["_t_" + elemId] = setTimeout(() => { s.textContent = ""; s.classList.remove("show"); }, 1600);
  }

  async function onSavePlayback() {
    const patch = {
      speedAwareCountdown: $("speedAwareCountdown").checked,
      showChapters:        $("showChapters").checked,
      showOverlay:         $("showOverlay").checked,
      overlayPosition:     $("overlayPosition").value || DEFAULTS.overlayPosition,
    };
    settings = { ...settings, ...patch };
    await chrome.storage.sync.set({ settings });
    await broadcastApply();
    showStatus("Saved ✓", "statusPlayback");
  }

  async function onSaveAlerts() {
    const patch = {
      trackWatchTime:    $("trackWatchTime").checked,
      endNotification:   $("endNotification").checked,
      breakReminderMins: Math.max(0, Number($("breakReminderMins").value) || 0),
      dailyLimitMins:    Math.max(0, Number($("dailyLimitMins").value) || 0),
    };
    settings = { ...settings, ...patch };
    await chrome.storage.sync.set({ settings });
    await broadcastApply();
    showStatus("Saved ✓", "statusAlerts");
  }

  async function onClearStats() {
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_STATS' });
    } catch { /* background may not be listening yet */ }
    showStatus("Watch history cleared", "statusAlerts");
  }
  // ---------- Streaming sites quick-enable ----------
  const STREAMING_SITES = [
    { host: 'youtube.com',       label: 'YouTube',     emoji: '📺' },
    { host: 'twitch.tv',         label: 'Twitch',      emoji: '🎮' },
    { host: 'netflix.com',       label: 'Netflix',     emoji: '🎬' },
    { host: 'disneyplus.com',    label: 'Disney+',     emoji: '✨' },
    { host: 'primevideo.com',    label: 'Prime Video', emoji: '🎥' },
    { host: 'hulu.com',          label: 'Hulu',        emoji: '📡' },
    { host: 'max.com',           label: 'Max (HBO)',   emoji: '🎭' },
    { host: 'peacocktv.com',     label: 'Peacock',     emoji: '🦚' },
    { host: 'paramountplus.com', label: 'Paramount+',  emoji: '⭐' },
    { host: 'crunchyroll.com',   label: 'Crunchyroll', emoji: '🍥' },
    { host: 'vimeo.com',         label: 'Vimeo',       emoji: '🎞️' },
    { host: 'dailymotion.com',   label: 'Dailymotion', emoji: '📹' },
  ];

  function renderStreamingSites() {
    const container = $("streamingSites");
    if (!container) return;
    container.innerHTML = '';
    for (const site of STREAMING_SITES) {
      const entry = sites[site.host] || null;
      const enabled = entry ? !!entry.enabled : !!settings.defaultEnabled;
      const wrap = document.createElement('div');
      wrap.className = 'site-chip' + (enabled ? ' enabled' : '');
      const lbl = document.createElement('label');
      lbl.className = 'site-chip-inner';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = enabled;
      cb.addEventListener('change', async () => {
        const cur = sites[site.host] || { enabled: !!settings.defaultEnabled, finishedEnabled: true };
        cur.enabled = cb.checked;
        sites[site.host] = cur;
        wrap.classList.toggle('enabled', cur.enabled);
        await chrome.storage.sync.set({ sites });
        renderSitesTable();
        showStatus(`${site.label}: ${cur.enabled ? 'enabled' : 'disabled'}`);
        await broadcastApply();
      });
      const em = document.createElement('span');
      em.className = 'site-emoji';
      em.textContent = site.emoji;
      em.setAttribute('aria-hidden', 'true');
      const nm = document.createElement('span');
      nm.className = 'site-name';
      nm.textContent = site.label;
      lbl.appendChild(cb); lbl.appendChild(em); lbl.appendChild(nm);
      wrap.appendChild(lbl);
      container.appendChild(wrap);
    }
  }

})();
