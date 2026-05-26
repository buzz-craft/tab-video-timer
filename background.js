// background.js v2.0 — watch-time storage, notifications, stats, badge, mute helpers

const DAY_MS = 86400000;
const liveStateByTab = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function canonicalHost(h) {
  const host = (h || "").toLowerCase();
  if (host.endsWith(".youtube.com") || host === "youtube.com" || host === "youtu.be") return "youtube.com";
  if (host.endsWith(".twitch.tv")   || host === "twitch.tv")                         return "twitch.tv";
  return host;
}

async function getSettings() {
  try { const { settings = {} } = await chrome.storage.sync.get("settings"); return settings; }
  catch { return {}; }
}

async function getEnabledForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const raw = new URL(tab.url).hostname;
    const host = canonicalHost(raw);
    const { settings = {}, sites = {} } = await chrome.storage.sync.get(["settings", "sites"]);
    const entry = sites[host] || sites[raw] || null;
    return { host, enabled: entry ? !!entry.enabled : !!(settings.defaultEnabled ?? false), finishedEnabled: entry?.finishedEnabled ?? true };
  } catch { return { host: "", enabled: false, finishedEnabled: true }; }
}

// ─── Badge ───────────────────────────────────────────────────────────────────

function setBadge(tabId, live) {
  liveStateByTab.set(tabId, !!live);
  chrome.action.setBadgeText({ tabId, text: live ? "LIVE" : "" }).catch(() => {});
  if (live) chrome.action.setBadgeBackgroundColor({ tabId, color: [220, 38, 38, 255] }).catch(() => {});
}

// ─── Mute helpers ────────────────────────────────────────────────────────────

async function queryMuteState(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const els = Array.from(document.querySelectorAll("video,audio"));
        const has = els.length > 0;
        return { has, anyMuted: has && els.some(e => e.muted || e.volume === 0), allMuted: has && els.every(e => e.muted || e.volume === 0) };
      }
    });
    let has = false, anyMuted = false, allMuted = true, seenMedia = false;
    for (const r of results) {
      if (!r?.result) continue;
      has = has || r.result.has;
      anyMuted = anyMuted || r.result.anyMuted;
      if (r.result.has) { seenMedia = true; allMuted = allMuted && r.result.allMuted; }
    }
    if (!seenMedia) allMuted = false;
    return { has, anyMuted, allMuted };
  } catch { return { has: false, anyMuted: false, allMuted: false }; }
}

async function setMutedForAll(tabId, mute) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (m) => { for (const e of document.querySelectorAll("video,audio")) { try { e.muted = m; } catch {} } },
      args: [!!mute]
    });
    return true;
  } catch { return false; }
}

// ─── Watch-time storage ──────────────────────────────────────────────────────

async function handleWatchTimeUpdate({ site, seconds }) {
  if (!seconds || seconds < 1) return { ok: true };
  const { watchTime = {} } = await chrome.storage.local.get("watchTime");
  const key = todayKey();
  if (!watchTime[key]) watchTime[key] = {};
  watchTime[key][site]   = (watchTime[key][site]   || 0) + Math.floor(seconds);
  watchTime[key]._total  = (watchTime[key]._total  || 0) + Math.floor(seconds);

  const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
  for (const k of Object.keys(watchTime)) { if (k < cutoff) delete watchTime[k]; }

  await chrome.storage.local.set({ watchTime });
  return { ok: true };
}

async function getStats(period) {
  const { watchTime = {} } = await chrome.storage.local.get("watchTime");
  const today = todayKey();
  if (period === "today") return watchTime[today] || {};
  if (period === "week") {
    const result = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
      result[d] = watchTime[d] || {};
    }
    return result;
  }
  return watchTime;
}

async function getDailyUsage() {
  const [{ watchTime = {} }, settings] = await Promise.all([
    chrome.storage.local.get("watchTime"),
    getSettings(),
  ]);
  const totalSecs = (watchTime[todayKey()] || {})._total || 0;
  const limitMins = settings.dailyLimitMins || 0;
  return { totalSecs, limitSecs: limitMins * 60 };
}

// ─── Notifications ───────────────────────────────────────────────────────────

function notify(id, title, message, priority) {
  chrome.notifications.create(id, { type: "basic", iconUrl: "icon128.png", title, message, priority: priority || 0 }).catch(() => {});
}

function handleVideoEnded({ title }) {
  notify(`tvt-ended-${Date.now()}`, "Video finished", title ? `"${title}" has ended.` : "Your video has ended.");
}

function handleBreakReminder({ seconds }) {
  const mins = Math.max(1, Math.round((seconds || 0) / 60));
  notify(`tvt-break-${Date.now()}`, "Time for a break?", `You've been watching for ${mins} minute${mins === 1 ? "" : "s"}.`, 1);
}

// ─── Message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = msg?.tabId ?? sender?.tab?.id;
  (async () => {
    switch (msg?.type) {
      case "WATCH_TIME_UPDATE":   sendResponse(await handleWatchTimeUpdate(msg)); break;
      case "GET_STATS":           sendResponse(await getStats(msg.period || "today")); break;
      case "GET_DAILY_USAGE":     sendResponse(await getDailyUsage()); break;
      case "CLEAR_STATS":         await chrome.storage.local.remove("watchTime"); sendResponse({ ok: true }); break;
      case "VIDEO_ENDED":         handleVideoEnded(msg); sendResponse({ ok: true }); break;
      case "BREAK_REMINDER":      handleBreakReminder(msg); sendResponse({ ok: true }); break;
      case "FG_LIVE_STATE":       setBadge(tabId, !!msg.live); sendResponse({ ok: true }); break;
      case "BG_QUERY_MUTE":       { const r = await queryMuteState(tabId); sendResponse({ ok: true, ...r }); break; }
      case "BG_MUTE_TOGGLE":      { const r = await queryMuteState(tabId); await setMutedForAll(tabId, !r.allMuted); sendResponse({ ok: true }); break; }
      case "BG_GET_ENABLED":      { const { host, enabled } = await getEnabledForTab(tabId); sendResponse({ ok: true, host, enabled }); break; }
      default:                    sendResponse({ ok: false, error: "unknown" });
    }
  })();
  return true;
});

// ─── Commands ────────────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return;
  if (command === "mute-active")  try { await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_MUTE" }); }         catch {}
  if (command === "toggle-site")  try { await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SITE_ENABLED" }); } catch {}
});

// ─── Tab lifecycle ────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status === "loading") liveStateByTab.delete(tabId); });
chrome.tabs.onRemoved.addListener((tabId) => liveStateByTab.delete(tabId));
chrome.tabs.onActivated.addListener(({ tabId }) => setBadge(tabId, liveStateByTab.get(tabId) || false));
