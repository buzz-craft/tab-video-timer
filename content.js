// /content.js
(() => {
  // -------- Settings --------
  const settings = {
    prefixPlaying: "⏳",
    prefixPaused: "⏸",
    updateIntervalMs: 250,
    enabled: true,
    hideWhenInactive: false,
    finishedPrefix: "✓ Finished",
    finishedHoldMs: 0,       // 0 => forever
    finishedEnabled: true
  };

  const hostname = (() => { try { return new URL(location.href).hostname; } catch { return ""; } })();

  function applySettingsFromStore(obj) {
    const s = obj.settings || {}, sites = obj.sites || {};
    settings.prefixPlaying    = s.prefixPlaying    ?? settings.prefixPlaying;
    settings.prefixPaused     = s.prefixPaused     ?? settings.prefixPaused;
    settings.updateIntervalMs = Math.max(100, Number(s.updateIntervalMs ?? settings.updateIntervalMs));
    settings.hideWhenInactive = Boolean(s.hideWhenInactive ?? settings.hideWhenInactive);
    settings.finishedPrefix   = s.finishedPrefix   ?? settings.finishedPrefix;
    settings.finishedHoldMs   = Number.isFinite(s.finishedHoldMs) ? Math.max(0, s.finishedHoldMs) : settings.finishedHoldMs;

    const site = sites[hostname] || {};
    const def  = s.defaultEnabled ?? true;
    settings.enabled         = (site.enabled ?? def);
    settings.finishedEnabled = (site.finishedEnabled ?? true);
  }

  chrome.storage.sync.get(["settings","sites"], (obj) => { applySettingsFromStore(obj); boot(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const obj = {};
    if (changes.settings) obj.settings = changes.settings.newValue;
    if (changes.sites)    obj.sites    = changes.sites.newValue;
    applySettingsFromStore(obj);
    scheduler.restart();
  });

  // -------- Title manager --------
  class TitleManager {
    constructor() {
      this.baseTitle = document.title || "";
      this.lastApplied = ""; this.isApplying = false;
      const el = this._ensureTitleElement();
      this.obs = new MutationObserver(() => { if (!this.isApplying) this.baseTitle = document.title || ""; });
      this.obs.observe(el, { childList:true, characterData:true, subtree:true });
    }
    _ensureTitleElement() { let t = document.querySelector("head > title"); if (!t) { t = document.createElement("title"); document.head.appendChild(t); } return t; }
    setPrefix(prefix) {
      const full = prefix ? `${prefix} | ${this.baseTitle}` : this.baseTitle;
      if (full === this.lastApplied) return;
      this.isApplying = true; try { document.title = full; this.lastApplied = full; } finally { queueMicrotask(() => { this.isApplying = false; }); }
    }
    restore() { this.setPrefix(""); }
  }
  const title = new TitleManager();

  // -------- Media tracking & smoothing --------
  const state = { media: new Set(), lastActive: null };
  let finishedUntil = 0; // timestamp or Infinity

  // "Playing" test: ignore readyState to avoid buffering flips.
  const isPlayingRaw = (m) => m && !m.paused && !m.ended && (m.playbackRate || 1) > 0;

  // Stickiness: once "playing", don't flip to "paused" for brief stalls (<1.5s)
  const SMOOTH_WINDOW_MS = 1500;
  let lastState = "idle";
  let lastStateAt = 0;

  function effectiveState(m) {
    if (!m) return "idle";
    const now = Date.now();

    // Explicit ends/pauses override stickiness.
    if (m.ended) { lastState = "idle"; lastStateAt = now; return "idle"; }
    if (m.paused) {
      // If we were "playing" very recently and not explicitly paused, keep "playing"
      if (lastState === "playing" && (now - lastStateAt) < SMOOTH_WINDOW_MS) return "playing";
      lastState = "paused"; lastStateAt = now; return "paused";
    }

    // Not paused: treat as playing, even if buffering/readyState low.
    if (isPlayingRaw(m)) { lastState = "playing"; lastStateAt = now; return "playing"; }

    // Fallback: if we were just playing, keep it sticky
    if (lastState === "playing" && (now - lastStateAt) < SMOOTH_WINDOW_MS) return "playing";
    lastState = "paused"; lastStateAt = now; return "paused";
  }

  function pickActiveMedia() {
    let best = null;
    for (const m of state.media) {
      if (!m.isConnected) continue;
      if (isPlayingRaw(m)) return m; // prefer actually playing
      if (!best) best = m;
    }
    return state.lastActive?.isConnected ? state.lastActive : best;
  }

  const isFiniteNumber = (n) => Number.isFinite(n) && !Number.isNaN(n);
  function mediaInfo(m) {
    const dur = m.duration, ct = m.currentTime, rate = Math.max(0.1, m.playbackRate || 1);
    const live = dur === Infinity;
    const hasDuration = isFiniteNumber(dur) && dur > 0 && dur !== Infinity;
    const remaining = hasDuration ? Math.max(0, (dur - ct) / rate) : NaN;
    return { live, hasDuration, remaining };
  }

  function formatHMS(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const two = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
  }

  function shouldHideNow() { return settings.hideWhenInactive && document.visibilityState === "hidden"; }

  function updateTitle() {
    if (!settings.enabled || shouldHideNow()) { title.restore(); return; }
    if (Date.now() < finishedUntil || finishedUntil === Infinity) { title.setPrefix(settings.finishedPrefix); return; }
    const m = pickActiveMedia(); if (!m) { title.restore(); return; }
    const info = mediaInfo(m);

    if (!info.hasDuration) { title.setPrefix(`${settings.prefixPlaying} --:--`); return; }

    const stamp = formatHMS(info.remaining);
    const est = effectiveState(m);
    const prefix = est === "playing" ? `${settings.prefixPlaying} ${stamp}`
                 : est === "paused"  ? `${settings.prefixPaused} ${stamp}`
                 : "";
    if (prefix) title.setPrefix(prefix); else title.restore();
  }

  function onBecameActive(m) { state.lastActive = m; finishedUntil = 0; }
  function onEnded() {
    if (!settings.finishedEnabled) return;
    finishedUntil = (settings.finishedHoldMs === 0) ? Infinity : (Date.now() + Math.max(0, settings.finishedHoldMs || 0));
    title.setPrefix(settings.finishedPrefix); scheduler.tickSoon();
  }

  function attachToMedia(m) {
    if (!m || state.media.has(m)) return;
    state.media.add(m);
    const onPlay = () => onBecameActive(m);
    const onAny  = () => scheduler.tickSoon();

    m.addEventListener("play", onPlay, { passive:true });
    m.addEventListener("playing", onPlay, { passive:true });
    m.addEventListener("pause", onAny, { passive:true });
    m.addEventListener("ended", onEnded, { passive:true });
    m.addEventListener("ratechange", onAny, { passive:true });
    m.addEventListener("seeking", onAny, { passive:true });
    m.addEventListener("loadedmetadata", onAny, { passive:true });
    m.addEventListener("timeupdate", () => {
      const { hasDuration, remaining } = mediaInfo(m);
      if (settings.finishedEnabled && hasDuration && isFiniteNumber(remaining) && remaining <= 0.15) onEnded();
    }, { passive:true });

    if (isPlayingRaw(m)) onBecameActive(m);
    scheduler.tickSoon();
  }

  function scanForMedia(root = document) { root.querySelectorAll?.("video, audio").forEach(attachToMedia); }

  const domObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes?.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === "VIDEO" || node.tagName === "AUDIO") attachToMedia(node);
        else scanForMedia(node);
      });
    }
  });

  const scheduler = (() => {
    let timer = 0, pending = false, currentMs = settings.updateIntervalMs;
    function loop() { pending = false; updateTitle(); timer = setTimeout(loop, currentMs); }
    return {
      start() { this.stop(); currentMs = settings.updateIntervalMs; timer = setTimeout(loop, currentMs); },
      stop() { if (timer) clearTimeout(timer); timer = 0; },
      restart() { this.stop(); currentMs = settings.updateIntervalMs; updateTitle(); if (settings.enabled) this.start(); else title.restore(); },
      tickSoon() { if (pending) return; pending = true; queueMicrotask(() => { updateTitle(); pending = false; }); }
    };
  })();

  // -------- Messaging (popup queries our state) --------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "APPLY_SETTINGS") {
      chrome.storage.sync.get(["settings","sites"], (obj) => { applySettingsFromStore(obj); scheduler.restart(); });
      return;
    }
    if (msg?.type === "GET_STATUS") {
      if (!settings.enabled) { sendResponse({ enabled:false }); return; }
      const m = pickActiveMedia();
      if (!m) { sendResponse({ enabled:true, state:"idle" }); return; }

      const info = mediaInfo(m);
      const est = effectiveState(m);

      sendResponse({
        enabled: true,
        state: est,  // "playing" | "paused" | "idle" (smoothed)
        remaining: Number.isFinite(info.remaining) ? info.remaining : null,
        playbackRate: m.playbackRate || 1,
        live: info.live,
        hasDuration: info.hasDuration,
        muted: !!m.muted
      });
      return;
    }
  });

  // -------- Utilities --------
  function boot() {
    domObserver.observe(document.documentElement || document.body, { childList:true, subtree:true });
    scanForMedia();
    scheduler.restart();
    document.addEventListener("visibilitychange", () => scheduler.tickSoon());
    window.addEventListener("beforeunload", () => { scheduler.stop(); domObserver.disconnect(); title.restore(); });
  }
})();
