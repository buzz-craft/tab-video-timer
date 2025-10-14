// /background.js
const DEFAULTS = {
  settings: {
    prefixPlaying: "⏳",
    prefixPaused: "⏸",
    updateIntervalMs: 250,
    defaultEnabled: false,
    finishedPrefix: "✓ Finished",
    finishedHoldMs: 0
  },
  sites: {}
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const curr = await chrome.storage.sync.get(["settings", "sites"]);
    if (!curr.settings) {
      await chrome.storage.sync.set({ settings: DEFAULTS.settings });
    } else {
      const s = { ...curr.settings };
      if (typeof s.defaultEnabled === "undefined") s.defaultEnabled = false;
      if (typeof s.finishedHoldMs === "undefined") s.finishedHoldMs = 0;
      if (typeof s.finishedPrefix === "undefined") s.finishedPrefix = "✓ Finished";
      if (typeof s.updateIntervalMs !== "number" || s.updateIntervalMs < 100) s.updateIntervalMs = 250;
      await chrome.storage.sync.set({ settings: s });
    }
    if (!curr.sites) await chrome.storage.sync.set({ sites: DEFAULTS.sites });
  } catch (e) {
    console.error("onInstalled error", e);
  }
});

async function getHostFromTab(tabId) {
  try { const tab = await chrome.tabs.get(tabId); return tab?.url ? new URL(tab.url).hostname : null; }
  catch { return null; }
}
async function isSiteEnabled(hostname) {
  const { settings, sites } = await chrome.storage.sync.get(["settings", "sites"]);
  const site = sites?.[hostname];
  return site?.enabled ?? settings?.defaultEnabled ?? true;
}
async function setSiteEnabled(hostname, enabled) {
  const { sites = {} } = await chrome.storage.sync.get(["sites"]);
  sites[hostname] = { ...(sites[hostname] || {}), enabled: !!enabled };
  await chrome.storage.sync.set({ sites });
}
async function updateActionBadge(tabId, enabled) {
  try {
    await chrome.action.setBadgeText({ tabId, text: enabled ? "" : "OFF" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: enabled ? [0,0,0,0] : [128,128,128,255] });
  } catch {}
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;
  const host = await getHostFromTab(tab.id); if (!host) return;
  const enabled = await isSiteEnabled(host);
  await setSiteEnabled(host, !enabled);
  await updateActionBadge(tab.id, !enabled);
  try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS" }); } catch {}
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const host = await getHostFromTab(tabId); if (!host) return;
  const enabled = await isSiteEnabled(host);
  await updateActionBadge(tabId, enabled);
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab?.url) {
    const host = await getHostFromTab(tabId); if (!host) return;
    const enabled = await isSiteEnabled(host);
    await updateActionBadge(tabId, enabled);
  }
});

/** Heuristic: count only "real" media, not placeholders. */
function hasRealMediaList(list) {
  return list.filter((m) => {
    try {
      if (!m || !m.isConnected) return false;
      // must have a source or metadata
      const hasSrc = !!(m.currentSrc || m.src);
      const hasInfo = Number.isFinite(m.duration) || m.readyState > 0;
      const active = !m.paused || m.seeking || m.currentTime > 0;
      return hasSrc && (hasInfo || active);
    } catch { return false; }
  });
}

// ---------- All-frames media helpers ----------
async function queryMuteStateAllFrames(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      const raw = Array.from(document.querySelectorAll("video, audio")).filter(n => n && n.isConnected);
      // mirror heuristics inside the page
      const list = raw.filter((m) => {
        try {
          const hasSrc = !!(m.currentSrc || m.src);
          const hasInfo = Number.isFinite(m.duration) || m.readyState > 0;
          const active = !m.paused || m.seeking || m.currentTime > 0;
          return hasSrc && (hasInfo || active);
        } catch { return false; }
      });
      if (!list.length) return { has: false, allMuted: false, anyMuted: false, count: 0 };
      const allMuted = list.every(m => m.muted);
      const anyMuted = list.some(m => m.muted);
      return { has: true, allMuted, anyMuted, count: list.length };
    }
  });

  let has = false, allMuted = true, anyMuted = false, count = 0;
  for (const r of results) {
    const v = r?.result || {};
    has = has || v.has;
    allMuted = allMuted && (v.has ? v.allMuted : true);
    anyMuted = anyMuted || v.anyMuted;
    count += v.count || 0;
  }
  return { has, allMuted, anyMuted, count };
}

async function setMutedAllFrames(tabId, desiredMuted) {
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    args: [desiredMuted],
    func: (muted) => {
      const raw = Array.from(document.querySelectorAll("video, audio")).filter(n => n && n.isConnected);
      const list = raw.filter((m) => {
        try {
          const hasSrc = !!(m.currentSrc || m.src);
          const hasInfo = Number.isFinite(m.duration) || m.readyState > 0;
          const active = !m.paused || m.seeking || m.currentTime > 0;
          return hasSrc && (hasInfo || active);
        } catch { return false; }
      });
      for (const m of list) { try { m.muted = !!muted; } catch {} }
      const allMuted = list.length ? list.every((m) => m.muted) : !!muted;
      return { applied: list.length, allMuted };
    }
  });

  let applied = 0, allMuted = desiredMuted;
  for (const r of results) {
    const v = r?.result || {};
    applied += v.applied || 0;
    allMuted = allMuted && (v.allMuted ?? desiredMuted);
  }
  return { applied, allMuted };
}

async function toggleMuteForTab(tabId) {
  const q = await queryMuteStateAllFrames(tabId);
  if (!q.has) return { ok: false, reason: "no-media" };
  const desired = !q.allMuted;
  const s = await setMutedAllFrames(tabId, desired);
  if (desired) {
    await chrome.action.setBadgeText({ tabId, text: "MUTE" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: [200, 0, 0, 255] });
  } else {
    await chrome.action.setBadgeText({ tabId, text: "" });
  }
  return { ok: true, muted: desired, applied: s.applied };
}

// ---------- Message bridge ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = msg.tabId || sender?.tab?.id;

    if (msg?.type === "BG_MUTE_TOGGLE") {
      if (!tabId) return sendResponse({ ok: false, reason: "no-tab" });
      try { sendResponse(await toggleMuteForTab(tabId)); } catch (e) { sendResponse({ ok:false, reason:String(e) }); }
      return;
    }

    if (msg?.type === "BG_QUERY_MUTE") {
      if (!tabId) return sendResponse({ ok: false, reason: "no-tab" });
      try { const q = await queryMuteStateAllFrames(tabId); sendResponse({ ok:true, ...q }); } catch (e) { sendResponse({ ok:false, reason:String(e) }); }
      return;
    }

    if (msg?.type === "BG_GET_ENABLED") {
      if (!tabId) return sendResponse({ ok: false, reason: "no-tab" });
      try { const host = await getHostFromTab(tabId); const enabled = host ? await isSiteEnabled(host) : false; sendResponse({ ok:true, enabled, host }); } catch (e) { sendResponse({ ok:false, reason:String(e) }); }
      return;
    }
  })();
  return true;
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  const activeTab = tab?.id ? tab : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!activeTab?.id) return;
  if (command === "mute-active") {
    await toggleMuteForTab(activeTab.id);
  } else if (command === "toggle-site") {
    const host = await getHostFromTab(activeTab.id); if (!host) return;
    const enabled = await isSiteEnabled(host);
    await setSiteEnabled(host, !enabled);
    await updateActionBadge(activeTab.id, !enabled);
    try { await chrome.tabs.sendMessage(activeTab.id, { type: "APPLY_SETTINGS" }); } catch {}
  }
});
