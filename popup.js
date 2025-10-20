// popup.js
// Label tweak: show "Enable timer" first when no per-tab override is set (override === null).
// Functionality unchanged: first click sets override=true for this tab, then toggles.

(async () => {
  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  const els = {
    host: $("host"),
    live: $("liveBadge"),
    muteBtn: $("mute"),
    muteLabel: $("muteLabel"),
    toggleSiteBtn: $("toggleSiteBtn"),
    toggleSiteLabel: $("toggleSiteLabel"),
    hideInactive: $("hideWhenInactive"),
    finishedSite: $("finishedEnabledThisSite"),
    openOptions: $("openOptions"),
    openShortcuts: $("openShortcuts"),
  };

  const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  };

  const getHost = (url) => { try { return new URL(url).hostname; } catch { return ""; } };

  // Try old content-script path (safe no-op if not present)
  async function tryContentScriptToggle(tabId) {
    try { await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_MUTE" }); return true; } catch { return false; }
  }

  // Runs in page with the user gesture from this click (works around Twitch autoplay rules)
  async function forcePageToggle(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const media = Array.from(document.querySelectorAll("video,audio"));
        const anyAudible = media.some(v => !v.muted && v.volume > 0);
        const wantMute = anyAudible;

        const clickIfVisible = (sel) => {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) { el.click(); return true; }
          return false;
        };

        const onTwitch = /(^|\.)twitch\.tv$/.test(location.hostname);
        if (onTwitch) {
          if (!wantMute) {
            clickIfVisible('[data-a-target="player-overlay-mute-button"]') ||
            clickIfVisible('[data-a-target="player-unmute-button"]') ||
            clickIfVisible('[data-a-target="player-mute-unmute-button"]');
          } else {
            clickIfVisible('[data-a-target="player-mute-unmute-button"]');
          }
        }

        for (const v of media) {
          try {
            v.muted = wantMute;
            if (!wantMute) {
              if (v.volume === 0) v.volume = 0.5;
              if (v.paused && v.readyState >= 2) v.play().catch(() => {});
            }
          } catch {}
        }

        const nowAudible = media.some(v => !v.muted && v.volume > 0);
        return { muted: !nowAudible };
      },
    });
    return result;
  }

  // UI helpers for the per-tab enable button
  function setEnableButtonUI(isEnabled) {
    if (!els.toggleSiteBtn || !els.toggleSiteLabel) return;
    els.toggleSiteLabel.textContent = isEnabled ? "Disable timer" : "Enable timer";
    els.toggleSiteBtn.setAttribute("aria-pressed", isEnabled ? "true" : "false");
  }

  // Ask content script for local override + effective state.
  // We use override strictly for UI: if override is null => show "Enable timer".
  async function queryTabEnable(tabId) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "GET_LOCAL_ENABLED" });
      const override = res?.override ?? null;
      const effective = !!res?.effective;
      // UI should show "Enable timer" when override is unset (null)
      const enabledForLabel = (override === null) ? false : !!override;
      return { ok: true, enabledForLabel, override, effective };
    } catch {
      return { ok: false, enabledForLabel: false, override: null, effective: false };
    }
  }

  async function setTabEnable(tabId, enabled) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "SET_LOCAL_ENABLED", enabled: !!enabled });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async function updateMuteLabel(finalMuted) {
    if (!els.muteLabel || !els.muteBtn) return;
    els.muteLabel.textContent = finalMuted ? "Unmute" : "Mute";
    els.muteBtn.setAttribute("aria-pressed", finalMuted ? "true" : "false");
  }

  // ---------- init ----------
  const tab = await getActiveTab();
  const host = getHost(tab?.url || "");
  if (els.host) els.host.textContent = host.replace(/^www\./, "") || "";

  // Default UI before we learn anything: show "Enable timer"
  setEnableButtonUI(false);

  // Initialize Enable/Disable button from current tab state (using override for the label)
  {
    const q = await queryTabEnable(tab.id);
    setEnableButtonUI(q.enabledForLabel);
  }

  // ---------- wire buttons ----------
  if (els.muteBtn) {
    els.muteBtn.addEventListener("click", async () => {
      if (!tab?.id) return;
      await tryContentScriptToggle(tab.id);
      const res = await forcePageToggle(tab.id);
      await updateMuteLabel(res?.muted ?? false);
    });
  }

  if (els.toggleSiteBtn) {
    els.toggleSiteBtn.addEventListener("click", async () => {
      if (!tab?.id) return;
      const current = await queryTabEnable(tab.id);
      const next = !current.enabledForLabel; // if UI shows "Enable", clicking sets true
      await setTabEnable(tab.id, next);
      setEnableButtonUI(next);
    });
  }

  // Preferences (still global/site-level; optional to use)
  if (els.hideInactive) {
    els.hideInactive.addEventListener("change", async () => {
      const { settings = {} } = await chrome.storage.sync.get(["settings"]);
      await chrome.storage.sync.set({ settings: { ...settings, hideWhenInactive: !!els.hideInactive.checked } });
      try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS" }); } catch {}
    });
  }
  if (els.finishedSite) {
    els.finishedSite.addEventListener("change", async () => {
      const { sites = {}, settings = {} } = await chrome.storage.sync.get(["sites", "settings"]);
      const canon = host.toLowerCase().replace(/^www\./, "");
      const entry = (sites[canon] || { enabled: settings.defaultEnabled ?? true, finishedEnabled: true });
      await chrome.storage.sync.set({ sites: { ...sites, [canon]: { ...entry, finishedEnabled: !!els.finishedSite.checked } } });
      try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS" }); } catch {}
    });
  }

  if (els.openOptions) els.openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  if (els.openShortcuts) els.openShortcuts.addEventListener("click", () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" }));

  // Initial mute label
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const media = Array.from(document.querySelectorAll("video,audio"));
        const anyAudible = media.some(v => !v.muted && v.volume > 0);
        return { muted: !anyAudible };
      },
    });
    await updateMuteLabel(result?.muted ?? false);
  } catch {}

  setTimeout(async () => {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const media = Array.from(document.querySelectorAll("video,audio"));
          const anyAudible = media.some(v => !v.muted && v.volume > 0);
          return { muted: !anyAudible };
        },
      });
      await updateMuteLabel(result?.muted ?? false);
    } catch {}
  }, 700);
})();
