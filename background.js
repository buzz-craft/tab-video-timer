// background.js (MV3 service worker)

const liveStateByTab = new Map(); // tabId -> boolean

function canonicalHost(h) {
  const host = (h || "").toLowerCase();
  if (host.endsWith(".youtube.com") || host === "youtube.com" || host === "youtu.be") return "youtube.com";
  if (host.endsWith(".twitch.tv") || host === "twitch.tv") return "twitch.tv";
  return host;
}

async function getEnabledForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const raw = new URL(tab.url).hostname;
    const host = canonicalHost(raw);
    const { settings = {}, sites = {} } = await chrome.storage.sync.get(["settings", "sites"]);
    const defaultEnabled = !!(settings.defaultEnabled ?? false);
    const entry = sites[host] || sites[raw] || null; // keep compatibility for old keys
    const enabled = entry ? !!entry.enabled : defaultEnabled;
    const finishedEnabled = entry?.finishedEnabled ?? true;
    return { host, enabled, finishedEnabled };
  } catch {
    return { host: "", enabled: false, finishedEnabled: true };
  }
}

async function queryMuteState(tabId) {
  try {
    const { enabled } = await getEnabledForTab(tabId);
    if (!enabled) return { has: false, anyMuted: false, allMuted: false, disabled: true };

    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const els = Array.from(document.querySelectorAll("video,audio"));
        const has = els.length > 0;
        const anyMuted = has && els.some(e => e.muted || e.volume === 0);
        const allMuted = has && els.every(e => e.muted || e.volume === 0);
        return { has, anyMuted, allMuted };
      }
    });

    const merged = results.reduce(
      (acc, r) => {
        if (!r?.result) return acc;
        acc.has = acc.has || r.result.has;
        acc.anyMuted = acc.anyMuted || r.result.anyMuted;
        acc.allMuted = acc.allMuted && r.result.has ? (acc.allMuted && r.result.allMuted) : acc.allMuted;
        if (r.result.has && acc._initAllMuted === false) acc._initAllMuted = true;
        return acc;
      },
      { has: false, anyMuted: false, allMuted: true, _initAllMuted: false }
    );
    if (!merged._initAllMuted) merged.allMuted = false;
    return merged;
  } catch {
    return { has: false, anyMuted: false, allMuted: false };
  }
}

async function setMutedForAll(tabId, mute) {
  try {
    const { enabled } = await getEnabledForTab(tabId);
    if (!enabled) return false; // respect site disabled
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (mute) => {
        const els = Array.from(document.querySelectorAll("video,audio"));
        for (const e of els) {
          try { e.muted = !!mute; } catch {}
        }
      },
      args: [!!mute]
    });
    return true;
  } catch {
    return false;
  }
}

function setBadge(tabId, live) {
  liveStateByTab.set(tabId, !!live);
  chrome.action.setBadgeText({ tabId, text: live ? "LIVE" : "" }).catch(() => {});
  if (live) chrome.action.setBadgeBackgroundColor({ tabId, color: [220, 38, 38, 255] }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const tabId = msg?.tabId || sender?.tab?.id;

    switch (msg?.type) {
      case "BG_QUERY_MUTE": {
        const r = await queryMuteState(tabId);
        sendResponse({ ok: true, ...r });
        break;
      }
      case "BG_MUTE_TOGGLE": {
        const r = await queryMuteState(tabId);
        if (r.disabled) { sendResponse({ ok: false, disabled: true }); break; }
        const targetMute = !(r.allMuted);
        const ok = await setMutedForAll(tabId, targetMute);
        sendResponse({ ok });
        break;
      }
      case "BG_GET_ENABLED": {
        const { host, enabled } = await getEnabledForTab(tabId);
        sendResponse({ ok: true, host, enabled });
        break;
      }
      case "BG_REFRESH_BADGE": {
        const live = liveStateByTab.get(tabId) || false;
        setBadge(tabId, live);
        sendResponse({ ok: true });
        break;
      }
      case "BG_QUERY_LIVE": {
        const live = liveStateByTab.get(tabId) || false;
        sendResponse({ ok: true, live });
        break;
      }
      case "FG_LIVE_STATE": {
        setBadge(tabId, !!msg.live);
        sendResponse?.({ ok: true });
        break;
      }
      default: break;
    }
  })();
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") liveStateByTab.delete(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  liveStateByTab.delete(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  const live = liveStateByTab.get(tabId) || false;
  setBadge(tabId, live);
});
