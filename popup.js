// /popup.js
const DEFAULTS = {
  settings: {
    prefixPlaying: "⏳",
    prefixPaused: "⏸",
    updateIntervalMs: 250,
    defaultEnabled: false,
    hideWhenInactive: false,
    finishedPrefix: "✓ Finished",
    finishedHoldMs: 0
  },
  sites: {}
};
const $ = (id) => document.getElementById(id);

let activeTab = null;
let hostname = "";
let siteEnabled = true;
let pollTimer = 0;
let lastHasMedia = false;

document.addEventListener("DOMContentLoaded", async () => {
  activeTab = await getActiveTab();
  hostname = safeHostname(activeTab?.url || "");
  $("host").textContent = hostname || "";

  $("openOptions").addEventListener("click", () => { try { chrome.runtime.openOptionsPage(); } catch {} });
  $("openShortcuts").addEventListener("click", () => { try { chrome.tabs.create({ url: "chrome://extensions/shortcuts" }); } catch {} });

  await refreshEnabledFromBG();

  $("mute").addEventListener("click", onMute);
  $("toggleSite").addEventListener("click", onToggleSite);
  $("hideWhenInactive").addEventListener("change", onToggleHideInactive);
  $("finishedEnabledThisSite").addEventListener("change", onToggleFinishedThisSite);

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "sync") return;
    if (changes.sites || changes.settings) await refreshEnabledFromBG();
  });

  startPolling();
});

async function refreshEnabledFromBG() {
  siteEnabled = true;
  if (!activeTab?.id) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: "BG_GET_ENABLED", tabId: activeTab.id });
    siteEnabled = !!res?.enabled;
  } catch { siteEnabled = true; }
  $("toggleSite").textContent = siteEnabled ? "Disable Site" : "Enable Site";
}

async function readStore() {
  const data = await chrome.storage.sync.get(["settings", "sites"]);
  return { settings: { ...DEFAULTS.settings, ...(data.settings || {}) }, sites: data.sites || {} };
}
function isSiteEnabledForHost(store, host) {
  if (!host) return true;
  const site = store.sites[host] || {};
  return (site.enabled ?? store.settings.defaultEnabled ?? true);
}
async function setSiteEnabled(host, enabled) {
  const { sites } = await readStore();
  sites[host] = { ...(sites[host] || {}), enabled: !!enabled };
  await chrome.storage.sync.set({ sites });
}
async function setSiteFinishedEnabled(host, finishedEnabled) {
  const { sites } = await readStore();
  sites[host] = { ...(sites[host] || {}), finishedEnabled: !!finishedEnabled };
  await chrome.storage.sync.set({ sites });
}

async function onMute() {
  const btn = $("mute");
  if (!activeTab?.id || btn.disabled || !siteEnabled || !lastHasMedia) return;
  btn.classList.add("pending");
  try {
    await chrome.runtime.sendMessage({ type: "BG_MUTE_TOGGLE", tabId: activeTab.id });
    await updateHasMediaAndMuteState();
  } catch {}
  finally {
    btn.classList.remove("pending");
  }
}

async function onToggleSite() {
  if (!hostname) return;
  const store = await readStore();
  const curr = isSiteEnabledForHost(store, hostname);
  await setSiteEnabled(hostname, !curr);
  await chrome.action.setBadgeText({ tabId: activeTab.id, text: !curr ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ tabId: activeTab.id, color: !curr ? [0,0,0,0] : [128,128,128,255] });
  await refreshEnabledFromBG();
  try { await chrome.tabs.sendMessage(activeTab.id, { type: "APPLY_SETTINGS" }); } catch {}
}
async function onToggleHideInactive(e) {
  const { settings } = await readStore();
  settings.hideWhenInactive = !!e.target.checked;
  await chrome.storage.sync.set({ settings });
  try { await chrome.tabs.sendMessage(activeTab.id, { type: "APPLY_SETTINGS" }); } catch {}
}
async function onToggleFinishedThisSite(e) {
  if (!hostname) return;
  await setSiteFinishedEnabled(hostname, !!e.target.checked);
  try { await chrome.tabs.sendMessage(activeTab.id, { type: "APPLY_SETTINGS" }); } catch {}
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(updateHasMediaAndMuteState, 1200);
  updateHasMediaAndMuteState();
}
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = 0; }

async function updateHasMediaAndMuteState() {
  if (!activeTab?.id) return;
  try {
    const q = await chrome.runtime.sendMessage({ type: "BG_QUERY_MUTE", tabId: activeTab.id });
    if (q?.ok) {
      lastHasMedia = !!q.has;
      setMuteUi({ has: lastHasMedia, muted: !!q.allMuted });
      return;
    }
  } catch {}
  lastHasMedia = false;
  setMuteUi({ has: false, muted: false });
}

function setMuteUi({ has, muted }) {
  const btn = $("mute");
  const label = document.getElementById("muteLabel");

  const enabled = !!siteEnabled && !!has;
  btn.disabled = !enabled;
  btn.classList.toggle("muted", !!muted);
  btn.classList.toggle("nomedia", !has);
  btn.setAttribute("aria-pressed", String(!!muted));
  btn.setAttribute("aria-disabled", String(!enabled));

  if (!has) {
    btn.title = "No media detected on this page";
    if (label) label.textContent = "No media";
  } else {
    btn.title = muted ? "Unmute current media" : "Mute current media";
    if (label) label.textContent = muted ? "Unmute" : "Mute";
  }
}

// utils
async function getActiveTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab || null; }
function safeHostname(u) { try { return new URL(u).hostname; } catch { return ""; } }
