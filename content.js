// content.js v2.0
// Speed-aware countdown, chapter titles, multi-video picker, watch-time tracking,
// break reminders, video-end notifications, page overlay.

if (window.top === window.self) {
  (function () {

    // ─── DEFAULTS ────────────────────────────────────────────────────────────
    const DEFAULTS = {
      prefixPlaying:        "⏳",
      prefixLivePlaying:    "🔴",
      prefixVODPlaying:     "⏳",
      prefixPaused:         "⏸",
      finishedPrefix:       "✓ Finished",
      finishedHoldMs:       0,
      updateIntervalMs:     250,
      defaultEnabled:       false,
      hideWhenInactive:     false,
      liveShowElapsed:      true,
      liveStickMs:          8000,
      ytNavGraceMs:         2500,
      dvrQuarantineMs:      10000,
      vodTimerMode:         "countdown",
      showPercent:          false,
      separator:            " • ",
      // v2.0
      speedAwareCountdown:  true,
      showChapters:         true,
      endNotification:      false,
      breakReminderMins:    0,
      dailyLimitMins:       0,
      trackWatchTime:       true,
      showOverlay:          false,
      overlayPosition:      "bottom-right",
      keepPlayingWhenInactive: false,
    };

    // ─── HOST HELPERS ─────────────────────────────────────────────────────────
    const canonicalHost = (h) => {
      const host = (h || "").toLowerCase();
      if (host.endsWith(".youtube.com") || host === "youtube.com" || host === "youtu.be") return "youtube.com";
      if (host.endsWith(".twitch.tv") || host === "twitch.tv") return "twitch.tv";
      return host;
    };
    const rawHost  = location.hostname;
    const host     = canonicalHost(rawHost);
    const isYouTube     = () => host === "youtube.com";
    const isTwitch      = () => host === "twitch.tv";
    const isYouTubeWatch = () => isYouTube() && location.pathname === "/watch";

    // ─── STATE ────────────────────────────────────────────────────────────────
    let settings   = { ...DEFAULTS };
    let sitesCanon = {};
    let sitesRaw   = {};
    let enabledForHost         = false;
    let finishedEnabledForHost = true;
    let localEnabledOverride      = null;
    let localHideInactiveOverride = null;

    let lastApplied    = "";
    let finishedUntil  = 0;
    let lastHref       = location.href;
    const ytVideoIdFromUrl = (url) => { try { return new URL(url, location.origin).searchParams.get("v") || ""; } catch { return ""; } };
    let currentVid     = ytVideoIdFromUrl(location.href);
    let currentVideoNode = null;

    let isLive             = false;
    let liveStartMs        = null;
    let fallbackLiveStartMs = null;
    let lastElapsedShownSec = 0;

    let sessionActive    = false;
    let lastIsPlaying    = false;
    let pausedSnapshot   = null;
    let navAtMs          = Date.now();
    let dvrQuarantineUntil = 0;
    let intervalId       = null;
    let prevEffectiveEnabled = null;
    let lastTwitchIdentity   = "";

    // Multi-video
    let selectedVideoIndex = 0;

    // Watch-time
    let watchAccumSecs      = 0;
    let watchSegmentStart   = null;
    let continuousWatchSecs = 0;
    let continuousSegStart  = null;
    let breakReminderFired  = false;
    let lastWatchReport     = 0;
    const listenedVideos    = new WeakSet();

    // Overlay
    let overlayEl      = null;
    let overlayVisible = false;



    // Hide guard
    let hideGuardActive = false;
    let hideBaseTitle   = "";
    let titleObserver   = null;
    let headObserver    = null;
    let hideEnforcerId  = null;

    // ─── UTILS ───────────────────────────────────────────────────────────────
    const clamp  = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
    const nowMs  = () => Date.now();
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    function stripDecor(t) {
      const sep = escRe(settings?.separator ?? " • ");
      const re = new RegExp(
        "^(?:[⏳⏸]️?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s+\\([0-9]+%\\))?(?:\\s+@[\\d.]+×)?" + sep +
        "|\\u{1F534}\\S*\\s+\\d{1,2}:\\d{2}(?::\\d{2})?" + sep +
        "|✓\\s+Finished" + sep + ")", "u"
      );
      return (t || "").replace(re, "");
    }

    function fmtHMS(totalSeconds) {
      totalSeconds = Math.max(0, Math.floor(totalSeconds));
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
                   : `${m}:${String(s).padStart(2,"0")}`;
    }

    // ─── TITLE HELPERS ───────────────────────────────────────────────────────
    function getYouTubePlayerResponse() {
      try { const y = window.ytInitialPlayerResponse || window.ytplayer?.config?.args?.player_response; return typeof y === "string" ? JSON.parse(y) : (y || null); } catch { return null; }
    }
    function getYouTubeTitleFresh() {
      const pr = getYouTubePlayerResponse();
      const vd = pr?.videoDetails?.title;
      if (vd && typeof vd === "string") return vd.trim();
      for (const sel of ['h1.ytd-watch-metadata yt-formatted-string','h1.title yt-formatted-string','h1.ytd-watch-metadata','#title h1','h1']) {
        const t = (document.querySelector(sel)?.textContent || "").trim();
        if (t) return t;
      }
      const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (og?.trim()) return og.trim();
      return stripDecor(document.title || "").trim();
    }
    function getTwitchTitleFresh() {
      for (const sel of ['[data-a-target="stream-title"]','[data-test-selector="stream-info-card-component__title"]','h2[class*="StreamInfo"]','h2[class*="stream"],h2[class*="title"]']) {
        const t = (document.querySelector(sel)?.textContent || "").trim();
        if (t) return t;
      }
      const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (og?.trim()) return og.trim();
      return stripDecor(document.title || "").trim();
    }
    function currentBaseTitle() {
      if (isYouTube()) return getYouTubeTitleFresh();
      if (isTwitch()) return getTwitchTitleFresh();
      const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (og?.trim()) return og.trim();
      return stripDecor(document.title || "").trim();
    }
    function getChapterTitle() {
      if (!settings.showChapters || !isYouTube()) return null;
      return document.querySelector(".ytp-chapter-title-content")?.textContent?.trim() || null;
    }
    function effectiveBaseTitle() {
      const base = currentBaseTitle();
      if (!settings.showChapters) return base;
      const ch = getChapterTitle();
      if (!ch || ch === base) return base;
      return `${ch} — ${base}`;
    }

    // ─── TWITCH HELPERS ───────────────────────────────────────────────────────
    function twitchChannelLogin() {
      const seg = (location.pathname || "/").split("/").filter(Boolean)[0] || "";
      if (seg && !["videos","directory","p"].includes(seg)) return seg.toLowerCase();
      try {
        const cand = document.querySelector('meta[property="og:url"]')?.getAttribute("content") || document.querySelector('link[rel="canonical"]')?.href || "";
        if (cand) { const p = new URL(cand, location.origin).pathname.split("/").filter(Boolean); if (p[0] && !["videos","directory","p"].includes(p[0])) return p[0].toLowerCase(); }
      } catch {}
      return "";
    }
    function getWindowApollo() { try { const ap = window.__APOLLO_STATE__; if (ap && typeof ap === "object") return ap; } catch {} return null; }
    function parseApolloFromScripts() {
      for (const s of Array.from(document.scripts)) {
        const txt = s.textContent || ""; if (!txt || !txt.includes("__APOLLO_STATE__")) continue;
        const m = txt.match(/__APOLLO_STATE__\s*=\s*({[\s\S]*?});/);
        if (!m) continue; try { return JSON.parse(m[1]); } catch {}
      }
      return null;
    }
    const getApollo = () => getWindowApollo() || parseApolloFromScripts();
    function findLiveStartMsFromApollo(ap) {
      if (!ap) return null; let best = null;
      for (const k in ap) { const obj = ap[k]; if (!obj || typeof obj !== "object") continue; for (const key of ["startedAt","createdAt","publishedAt","streamStartedAt"]) { const t = Date.parse(obj[key]); if (!isNaN(t) && nowMs() - t <= 48*3600000) { if (best == null || t > best) best = t; } } }
      return best;
    }
    function findTwitchStreamIdFromApollo(ap) {
      if (!ap) return "";
      for (const k in ap) { const v = ap[k]; if (v?.__typename && /stream/i.test(v.__typename) && typeof v.id === "string") return v.id; }
      for (const k in ap) { const v = ap[k]; if (v?.__typename && /video/i.test(v.__typename) && v.broadcastType === "LIVE" && typeof v.id === "string") return v.id; }
      return "";
    }
    function parseStartFromJsonLd() {
      for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        try { const walk = (o) => { if (!o || typeof o !== "object") return null; if (typeof o.startDate === "string") { const ms = Date.parse(o.startDate); if (!isNaN(ms)) return ms; } for (const k of Object.keys(o)) { const r = walk(o[k]); if (r) return r; } return null; }; const r = walk(JSON.parse(s.textContent || "{}")); if (r) return r; } catch {}
      }
      return null;
    }
    function findLiveStartMsFromMeta() {
      const m = document.querySelector('meta[property="og:video:release_date"],meta[property="video:release_date"]');
      if (m?.content) { const t = Date.parse(m.content); if (!isNaN(t)) return t; }
      const tEl = document.querySelector('time[datetime]');
      if (tEl) { const t = Date.parse(tEl.getAttribute('datetime') || ""); if (!isNaN(t)) return t; }
      return null;
    }
    function parseBestClockishToSec(txt) {
      const re = /(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/g; let best = null;
      for (let m; (m = re.exec(txt)) !== null; ) { const hasH = m[3] != null; const h = hasH ? +m[1] : 0, mm = hasH ? +m[2] : +m[1], ss = hasH ? +m[3] : +m[2]; if ([h,mm,ss].some(isNaN)) continue; const sec = h*3600+mm*60+ss; if (sec<=0||sec>172800) continue; if (best==null||(h>0&&best.h===0)||(h===best.h&&sec>best.sec)) best={h,sec}; }
      return best ? best.sec : null;
    }
    function parseWordsToSec(txt) {
      const lower = txt.toLowerCase(); let total = 0, found = false;
      const hm = /(\d+)\s*h/.exec(lower); const mm = /(\d+)\s*m/.exec(lower); const sm = /(\d+)\s*s/.exec(lower);
      if (hm) { total += +hm[1]*3600; found = true; } if (mm) { total += +mm[1]*60; found = true; } if (sm) { total += +sm[1]; found = true; }
      return (found && total > 0 && total <= 172800) ? total : null;
    }
    function twitchUiElapsedSec() {
      const sel = ['[data-a-target="stream-title"]','[data-test-selector="stream-info-card-component__title"]','[data-a-target*="stream"],[data-a-target*="time"],[class*="stream"],[class*="time"]','main section,aside,header'].join(",");
      let best = null, found3 = false;
      for (const el of Array.from(document.querySelectorAll(sel)).slice(0,150)) {
        for (const txt of [el.textContent||"", el.getAttribute?.("aria-label")||"", el.getAttribute?.("title")||""]) {
          const c = parseBestClockishToSec(txt); if (c!=null) { const h3=/\d{1,2}:[0-5]\d:[0-5]\d/.test(txt); if(h3) found3=true; if(best==null||(found3&&!h3?false:c>best)) best=c; }
          const w = parseWordsToSec(txt); if(w!=null&&(best==null||(!found3&&w>best))) best=w;
        }
      }
      return best;
    }
    function maybeSnapToTwitchUIElapsed() {
      if (!isTwitch() || !settings.liveShowElapsed) return;
      const elapsed = twitchUiElapsedSec(); if (elapsed == null) return;
      const derived = nowMs() - elapsed*1000;
      if (liveStartMs == null || Math.abs(derived - liveStartMs) > 5000 || elapsed+15 < lastElapsedShownSec) { liveStartMs = derived; fallbackLiveStartMs = null; }
    }

    // ─── MEDIA DETECTION ─────────────────────────────────────────────────────
    function getPrimaryYouTubePlayer() {
      return document.querySelector("ytd-player video") || document.querySelector("#movie_player video") || document.querySelector("video") || null;
    }
    function getAllVideos() {
      return Array.from(document.querySelectorAll("video")).filter(v => { try { return v.readyState >= 1; } catch { return false; } });
    }
    function buildVideoList() {
      return getAllVideos().map((v, i) => ({
        index: i,
        duration: Number.isFinite(v.duration) ? v.duration : null,
        currentTime: v.currentTime || 0,
        playing: !v.paused && !v.ended && v.readyState >= 2,
        muted: v.muted,
        width: v.videoWidth || 0,
        height: v.videoHeight || 0,
      }));
    }
    function getPlayingMedia() {
      if (isYouTubeWatch()) { const v = getPrimaryYouTubePlayer(); return (v && !v.paused && !v.ended && v.readyState >= 2) ? v : null; }
      const all = Array.from(document.querySelectorAll("video,audio"));
      const playing = all.filter(e => !e.paused && !e.ended && e.readyState >= 2);
      if (!playing.length) return null;
      if (all[selectedVideoIndex] && playing.includes(all[selectedVideoIndex])) return all[selectedVideoIndex];
      return playing.reduce((b, v) => (v.videoWidth*v.videoHeight > (b?.videoWidth||0)*(b?.videoHeight||0) ? v : b), null);
    }
    function getAnyRelevantMedia() {
      if (isYouTubeWatch()) return getPrimaryYouTubePlayer();
      const all = Array.from(document.querySelectorAll("video,audio"));
      if (all[selectedVideoIndex]) return all[selectedVideoIndex];
      return all[0] || null;
    }

    // ─── LIVE DETECTION ───────────────────────────────────────────────────────
    function isYouTubeLiveByBadge() {
      const mp = document.getElementById("movie_player");
      const badge = document.querySelector(".ytp-live-badge");
      const liveBtn = document.querySelector("button.ytp-live-button");
      return !!(badge && badge.offsetParent !== null && /live/i.test(badge.textContent||"")) ||
             !!(mp && (mp.classList.contains("ytp-live") || mp.classList.contains("ytp-embed-live"))) ||
             !!(liveBtn && /live/i.test(liveBtn.getAttribute("aria-label")||""));
    }
    function getYouTubeLiveInfo() {
      let liveNow = false, startMs = null;
      const pr = getYouTubePlayerResponse();
      if (pr) {
        const mf = pr.microformat?.playerMicroformatRenderer; const vd = pr.videoDetails || {}; const lb = mf?.liveBroadcastDetails || {};
        if (vd.isLiveContent === true || lb?.isLiveNow === true || pr.playabilityStatus?.liveStreamability) liveNow = true;
        const ts = lb?.startTimestamp; if (ts) { const ms = Date.parse(ts); if (!isNaN(ms)) startMs = ms; }
      }
      if (!startMs) { const m = document.querySelector('meta[itemprop="startDate"]')?.getAttribute("content"); if (m) { const ms = Date.parse(m); if (!isNaN(ms)) startMs = ms; } }
      if (!startMs) startMs = parseStartFromJsonLd();
      if (!liveNow && isYouTubeLiveByBadge()) liveNow = true;
      if (startMs && (nowMs() - startMs) > 172800000) startMs = null;
      return { liveNow, startMs };
    }
    function isStrongLive(media) {
      const dur = Number(media?.duration);
      const durationInfinite = media && dur === Infinity;
      if (isYouTube()) { const { liveNow } = getYouTubeLiveInfo(); return durationInfinite || isYouTubeLiveByBadge() || liveNow; }
      return durationInfinite;
    }
    const looksLikeDvrHour = (dur) => Number.isFinite(dur) && dur >= 3500 && dur <= 3700;
    const inDvrQuarantine = () => isYouTubeWatch() && nowMs() < dvrQuarantineUntil;

    // ─── TITLE I/O ────────────────────────────────────────────────────────────
    function safeSetTitle(t) { if (document.title !== t) document.title = t; lastApplied = t; }
    function hardResetLiveState() { isLive = false; liveStartMs = null; fallbackLiveStartMs = null; lastElapsedShownSec = 0; }
    function updateBaseTitleIfNavigated() {
      if (location.href === lastHref) return;
      lastHref = location.href; navAtMs = nowMs();
      const vidNow = ytVideoIdFromUrl(location.href); const vidChanged = vidNow !== currentVid; currentVid = vidNow;
      sessionActive = false; finishedUntil = 0; dvrQuarantineUntil = 0; hardResetLiveState(); pausedSnapshot = null; lastIsPlaying = false; lastApplied = "";
      if (vidChanged) hardResetLiveState();
      // flush accumulated watch-time before resetting counters
      onWatchPaused();
      const flushSecs = Math.floor(watchAccumSecs);
      if (flushSecs >= 5) {
        chrome.runtime.sendMessage({ type: "WATCH_TIME_UPDATE", site: canonicalHost(location.hostname), seconds: flushSecs }).catch(() => {});
      }
      watchAccumSecs = 0; selectedVideoIndex = 0; continuousWatchSecs = 0; continuousSegStart = null; breakReminderFired = false;
    }

    // ─── ENABLEMENT ──────────────────────────────────────────────────────────
    function computeEnabledFlags() {
      if (localEnabledOverride !== null) {
        enabledForHost = !!localEnabledOverride;
      } else {
        const entry = sitesCanon[host] ?? sitesRaw[rawHost] ?? null;
        enabledForHost = entry ? !!entry.enabled : !!(settings.defaultEnabled ?? DEFAULTS.defaultEnabled);
      }
      const entry = sitesCanon[host] ?? sitesRaw[rawHost] ?? null;
      finishedEnabledForHost = entry?.finishedEnabled ?? true;
    }
    const currentHideInactiveSetting = () => localHideInactiveOverride !== null ? !!localHideInactiveOverride : !!settings.hideWhenInactive;

    // ─── WATCH-TIME TRACKING ─────────────────────────────────────────────────
    function onWatchStarted() {
      if (!settings.trackWatchTime) return;
      if (!watchSegmentStart) watchSegmentStart = nowMs();
      if (!continuousSegStart) continuousSegStart = nowMs();
    }
    function onWatchPaused() {
      if (watchSegmentStart) { watchAccumSecs += (nowMs() - watchSegmentStart) / 1000; watchSegmentStart = null; }
      continuousWatchSecs = 0; continuousSegStart = null; breakReminderFired = false;
    }
    function getContinuousSecs() { return continuousWatchSecs + (continuousSegStart ? (nowMs() - continuousSegStart) / 1000 : 0); }
    async function reportWatchTime() {
      if (!settings.trackWatchTime) return;
      const snapshot = watchAccumSecs + (watchSegmentStart ? (nowMs() - watchSegmentStart) / 1000 : 0);
      if (snapshot < 5) return;
      watchAccumSecs = 0;
      if (watchSegmentStart) watchSegmentStart = nowMs();
      try {
        await chrome.runtime.sendMessage({ type: "WATCH_TIME_UPDATE", site: canonicalHost(location.hostname), seconds: Math.floor(snapshot) });
      } catch {}
    }
    function flushWatchTimeSync() {
      if (!settings.trackWatchTime) return;
      onWatchPaused();
      const secs = Math.floor(watchAccumSecs);
      if (secs < 5) return;
      watchAccumSecs = 0;
      chrome.runtime.sendMessage({ type: "WATCH_TIME_UPDATE", site: canonicalHost(location.hostname), seconds: secs }).catch(() => {});
    }
    function checkBreakReminder() {
      const mins = settings.breakReminderMins || 0; if (!mins || breakReminderFired) return;
      if (getContinuousSecs() >= mins * 60) { breakReminderFired = true; try { chrome.runtime.sendMessage({ type: "BREAK_REMINDER", seconds: Math.floor(getContinuousSecs()) }); } catch {} }
    }

    // ─── VIDEO LISTENERS (ended, watch-time) ─────────────────────────────────
    function attachVideoListeners(media) {
      if (!media || listenedVideos.has(media)) return;
      listenedVideos.add(media);
      media.addEventListener("ended", () => {
        onWatchPaused(); reportWatchTime();
        if (settings.endNotification) try { chrome.runtime.sendMessage({ type: "VIDEO_ENDED", title: currentBaseTitle() }); } catch {}
      });
      media.addEventListener("pause", () => {
        if (!settings.keepPlayingWhenInactive || !document.hidden || media.ended) return;
        setTimeout(() => {
          if (media.paused && !media.ended && document.hidden) media.play().catch(() => {});
        }, 100);
      });
    }

    // ─── PAGE OVERLAY ─────────────────────────────────────────────────────────
    function getOverlayCSS() {
      return `
        #tvt-overlay{position:fixed;z-index:2147483647;background:rgba(0,0,0,.82);color:#fff;border-radius:10px;padding:8px 10px;min-width:160px;max-width:240px;font:12px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.4);user-select:none;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.12);transition:opacity .2s}
        #tvt-overlay.tvt-hid{opacity:0;pointer-events:none}
        .tvt-ov-in{display:flex;align-items:center;gap:8px}
        .tvt-ov-ico{font-size:18px;flex-shrink:0}
        .tvt-ov-body{flex:1;min-width:0}
        .tvt-ov-st{font-size:10px;opacity:.7;margin-bottom:2px}
        .tvt-ov-tm{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
        .tvt-ov-bw{height:3px;background:rgba(255,255,255,.2);border-radius:99px;margin-top:4px;overflow:hidden}
        .tvt-ov-bf{height:100%;background:#3b82f6;border-radius:99px;transition:width .8s linear}
        .tvt-ov-cl{background:none;border:none;color:rgba(255,255,255,.6);cursor:pointer;font-size:16px;padding:0 0 0 4px;line-height:1;flex-shrink:0}
        .tvt-ov-cl:hover{color:#fff}
      `;
    }
    function applyOverlayPosition() {
      if (!overlayEl) return;
      const pos = settings.overlayPosition || "bottom-right";
      overlayEl.style.top = overlayEl.style.bottom = overlayEl.style.left = overlayEl.style.right = "";
      if (pos.includes("bottom")) overlayEl.style.bottom = "20px"; else overlayEl.style.top = "20px";
      if (pos.includes("right"))  overlayEl.style.right  = "20px"; else overlayEl.style.left = "20px";
    }
    function makeDraggable(el) {
      el.addEventListener("mousedown", (e) => {
        if (e.target.closest(".tvt-ov-cl")) return;
        const r = el.getBoundingClientRect(); let sl = r.left, st = r.top, sx = e.clientX, sy = e.clientY;
        const mv = (e) => { el.style.left = `${sl+e.clientX-sx}px`; el.style.top = `${st+e.clientY-sy}px`; el.style.right = el.style.bottom = "auto"; };
        const up = () => { document.removeEventListener("mousemove", mv); document.removeEventListener("mouseup", up); };
        document.addEventListener("mousemove", mv); document.addEventListener("mouseup", up); e.preventDefault();
      });
    }
    function ensureOverlay() {
      if (overlayEl && document.body.contains(overlayEl)) return;
      overlayEl = null;
      if (!document.getElementById("tvt-overlay-css")) {
        const s = document.createElement("style"); s.id = "tvt-overlay-css"; s.textContent = getOverlayCSS(); document.head.appendChild(s);
      }
      overlayEl = document.createElement("div"); overlayEl.id = "tvt-overlay";
      overlayEl.innerHTML = `<div class="tvt-ov-in"><span class="tvt-ov-ico">📺</span><div class="tvt-ov-body"><div class="tvt-ov-st"></div><div class="tvt-ov-tm">—</div><div class="tvt-ov-bw"><div class="tvt-ov-bf"></div></div></div><button class="tvt-ov-cl" title="Close">×</button></div>`;
      applyOverlayPosition(); makeDraggable(overlayEl);
      overlayEl.querySelector(".tvt-ov-cl").addEventListener("click", () => toggleOverlay(false));
      document.body.appendChild(overlayEl);
    }
    function updateOverlay(media, live, playing, originMs) {
      if (!overlayEl || !overlayVisible) return;
      const st = overlayEl.querySelector(".tvt-ov-st"), tm = overlayEl.querySelector(".tvt-ov-tm"), bf = overlayEl.querySelector(".tvt-ov-bf"), ico = overlayEl.querySelector(".tvt-ov-ico");
      if (!media) { ico.textContent = "📺"; st.textContent = "No video"; tm.textContent = "—"; bf.style.width = "0%"; return; }
      if (live) {
        ico.textContent = "🔴"; st.textContent = playing ? "LIVE · Playing" : "LIVE · Paused";
        const el = originMs ? clamp((nowMs() - originMs) / 1000, 0, 172800) : null;
        tm.textContent = el != null ? fmtHMS(el) + " elapsed" : "LIVE"; bf.style.width = "100%"; return;
      }
      ico.textContent = playing ? "▶" : "⏸";
      const dur = Number(media.duration), cur = media.currentTime || 0, rate = media.playbackRate || 1;
      const rateStr = (settings.speedAwareCountdown && rate !== 1) ? ` · ${rate}×` : "";
      st.textContent = (playing ? "Playing" : "Paused") + rateStr;
      if (Number.isFinite(dur) && dur > 0) {
        const raw = clamp(dur - cur, 0, dur);
        const adj = settings.speedAwareCountdown && rate > 0 ? raw / rate : raw;
        const vodMode = settings.vodTimerMode ?? "countdown";
        tm.textContent = vodMode === "elapsed" ? fmtHMS(cur) + " watched" : fmtHMS(adj) + " left";
        bf.style.width = Math.round((cur / dur) * 100) + "%";
      } else { tm.textContent = "—"; bf.style.width = "0%"; }
    }
    function toggleOverlay(vis) {
      overlayVisible = vis;
      if (vis) { ensureOverlay(); overlayEl.classList.remove("tvt-hid"); }
      else if (overlayEl) overlayEl.classList.add("tvt-hid");
    }

    // ─── HIDE GUARD ──────────────────────────────────────────────────────────
    function getTitleEl() { let t = document.querySelector("head > title"); if (!t) { t = document.createElement("title"); (document.head || document.documentElement).appendChild(t); } return t; }
    function attachTitleObserver(base) {
      try { const t = getTitleEl(); titleObserver?.disconnect(); const e = () => { if (document.title !== base) document.title = base; }; e(); titleObserver = new MutationObserver(e); titleObserver.observe(t, { childList: true, characterData: true, subtree: true }); } catch {}
    }
    function attachHeadObserver(base) {
      try { const h = document.head || document.documentElement; headObserver?.disconnect(); headObserver = new MutationObserver(() => attachTitleObserver(base)); headObserver.observe(h, { childList: true, subtree: true }); } catch {}
    }
    function hideGuardStart() {
      if (hideGuardActive) return;
      hideBaseTitle = currentBaseTitle(); try { document.title = hideBaseTitle; } catch {}
      attachTitleObserver(hideBaseTitle); attachHeadObserver(hideBaseTitle);
      if (hideEnforcerId) clearInterval(hideEnforcerId);
      hideEnforcerId = setInterval(() => { try { if (document.title !== hideBaseTitle) document.title = hideBaseTitle; attachTitleObserver(hideBaseTitle); } catch {} }, 800);
      hideGuardActive = true;
    }
    function hideGuardStop() {
      if (!hideGuardActive) return;
      try { titleObserver?.disconnect(); headObserver?.disconnect(); } catch {}
      titleObserver = null; headObserver = null;
      if (hideEnforcerId) { clearInterval(hideEnforcerId); hideEnforcerId = null; }
      hideGuardActive = false; hideBaseTitle = "";
    }
    function maybeToggleHideGuard() {
      const hide = currentHideInactiveSetting();
      const hidden = document.visibilityState === "hidden";
      if (hide && hidden) hideGuardStart();
      else if (hideGuardActive) { hideGuardStop(); setTimeout(() => { try { tick(); } catch {} }, 0); }
    }
    document.addEventListener("visibilitychange", () => { maybeToggleHideGuard(); }, { capture: true });
    window.addEventListener("pagehide",   () => maybeToggleHideGuard(), { capture: true });
    window.addEventListener("pageshow",   () => maybeToggleHideGuard(), { capture: true });
    window.addEventListener("blur",       () => maybeToggleHideGuard(), { capture: true });
    window.addEventListener("focus",      () => maybeToggleHideGuard(), { capture: true });

    // ─── MAIN TICK ────────────────────────────────────────────────────────────
    function tick() {
      updateBaseTitleIfNavigated();
      computeEnabledFlags();

      const visible = document.visibilityState === "visible";
      const hiddenPolicy = currentHideInactiveSetting() && !visible;
      const effectiveEnabled = enabledForHost && !hiddenPolicy;

      if (!effectiveEnabled) {
        // Flush the active watch segment but don't reset the break-reminder state
        // (the video may still be playing; only a real pause should clear that).
        if (watchSegmentStart) { watchAccumSecs += (nowMs() - watchSegmentStart) / 1000; watchSegmentStart = null; }
        // Only lock the title when the tab is actually hidden; leave it unlocked
        // for visible-but-disabled pages so the site can manage its own title.
        if (!visible) hideGuardStart();
        else if (hideGuardActive) hideGuardStop();
        return;
      }
      else if (hideGuardActive) hideGuardStop();

      if (isTwitch()) {
        const ident = `${twitchChannelLogin()}::${findTwitchStreamIdFromApollo(getApollo())||"?"}`;
        if (ident !== lastTwitchIdentity) { lastTwitchIdentity = ident; hardResetLiveState(); finishedUntil = 0; lastApplied = ""; }
      }
      if (isYouTube() && !isYouTubeWatch()) return;

      const mediaPlaying = getPlayingMedia();
      const anyMedia = mediaPlaying || getAnyRelevantMedia();

      if (anyMedia) { attachVideoListeners(anyMedia); }
      if (anyMedia && anyMedia !== currentVideoNode) { currentVideoNode = anyMedia; hardResetLiveState(); lastApplied = ""; }

      const sep = settings.separator ?? " • ";
      const baseTitle = effectiveBaseTitle();

      // Report watch time every 30s
      if (nowMs() - lastWatchReport > 30000) { lastWatchReport = nowMs(); reportWatchTime(); }

      // ── PLAYING ──
      if (mediaPlaying) {
        sessionActive = true;
        onWatchStarted();
        checkBreakReminder();

        const dur = Number(mediaPlaying.duration);
        const strongLive = isStrongLive(mediaPlaying);

        if (isYouTubeWatch() && !strongLive && looksLikeDvrHour(dur)) {
          const sinceNav = nowMs() - navAtMs;
          const grace = Number(settings.ytNavGraceMs) || 2500;
          const qMs = Number(settings.dvrQuarantineMs) || 10000;
          if (sinceNav < grace || dvrQuarantineUntil < nowMs()) dvrQuarantineUntil = nowMs() + qMs;
        }

        if (strongLive && settings.liveShowElapsed) {
          isLive = true;
          if (isYouTube()) { const { startMs } = getYouTubeLiveInfo(); if (startMs && (liveStartMs == null || Math.abs(liveStartMs - startMs) > 1000)) liveStartMs = startMs; }
          else if (isTwitch()) { const maybe = findLiveStartMsFromApollo(getApollo()) || parseStartFromJsonLd() || findLiveStartMsFromMeta(); if (maybe && nowMs()-maybe <= 172800000) liveStartMs = maybe; maybeSnapToTwitchUIElapsed(); }
          else { const maybe = parseStartFromJsonLd() || findLiveStartMsFromMeta(); if (maybe && nowMs()-maybe <= 172800000) liveStartMs = maybe; }
          if (!liveStartMs && !fallbackLiveStartMs) fallbackLiveStartMs = nowMs();
          const originMs = liveStartMs ?? fallbackLiveStartMs ?? nowMs();
          const elapsedSec = clamp((nowMs() - originMs) / 1000, 0, 172800);
          lastElapsedShownSec = elapsedSec;
          try { chrome.runtime.sendMessage({ type: "FG_LIVE_STATE", live: true, tabId: undefined }); } catch {}
          safeSetTitle(`${settings.prefixLivePlaying ?? settings.prefixPlaying ?? "🔴"} ${fmtHMS(elapsedSec)}${sep}${baseTitle}`);
          updateOverlay(mediaPlaying, true, true, liveStartMs ?? fallbackLiveStartMs);
          lastIsPlaying = true; pausedSnapshot = null; return;
        }

        // VOD playing
        hardResetLiveState();
        if (inDvrQuarantine()) return;
        if (!Number.isFinite(dur) || dur <= 0) return;
        const cur = Number.isFinite(mediaPlaying.currentTime) ? mediaPlaying.currentTime : 0;
        const rate = (settings.speedAwareCountdown && mediaPlaying.playbackRate > 0) ? mediaPlaying.playbackRate : 1;
        const vodMode = settings.vodTimerMode ?? "countdown";
        let timeVal;
        if (vodMode === "elapsed") { timeVal = cur; }
        else { const raw = clamp(dur - cur, 0, dur); timeVal = rate !== 1 ? clamp(raw / rate, 0, raw) : raw; }
        const pfx = settings.prefixVODPlaying ?? settings.prefixPlaying ?? "⏳";
        let timeStr = fmtHMS(timeVal);
        if (settings.showPercent && dur > 0) timeStr += ` (${Math.round((cur/dur)*100)}%)`;
        if (settings.speedAwareCountdown && rate !== 1 && vodMode === "countdown") timeStr += ` @${rate}×`;
        safeSetTitle(`${pfx} ${timeStr}${sep}${baseTitle}`);
        updateOverlay(mediaPlaying, false, true, null);
        lastIsPlaying = true; return;
      }

      // ── NOT PLAYING ──
      if (watchSegmentStart) onWatchPaused();

      if (anyMedia) {
        const dur = Number(anyMedia.duration);
        const strongLive = isStrongLive(anyMedia);

        if (strongLive && settings.liveShowElapsed) {
          if (isYouTube()) { const { startMs } = getYouTubeLiveInfo(); if (startMs && (liveStartMs == null || Math.abs(liveStartMs-startMs)>1000)) liveStartMs = startMs; }
          else { const maybe = (isTwitch() && (findLiveStartMsFromApollo(getApollo())||parseStartFromJsonLd()||findLiveStartMsFromMeta())) || parseStartFromJsonLd() || findLiveStartMsFromMeta(); if (maybe && nowMs()-maybe<=172800000) liveStartMs = maybe; if (isTwitch()) maybeSnapToTwitchUIElapsed(); }
          if (!liveStartMs && !fallbackLiveStartMs) fallbackLiveStartMs = nowMs();
          const originMs = liveStartMs ?? fallbackLiveStartMs ?? nowMs();
          const elapsedSec = lastIsPlaying ? lastElapsedShownSec : clamp((nowMs()-originMs)/1000, 0, 172800);
          pausedSnapshot = { kind: "live", elapsedSec };
          safeSetTitle(`${settings.prefixPaused||"⏸"} ${fmtHMS(elapsedSec)}${sep}${baseTitle}`);
          updateOverlay(anyMedia, true, false, liveStartMs ?? fallbackLiveStartMs);
          return;
        }

        hardResetLiveState();
        if (Number.isFinite(dur) && dur > 0 && !anyMedia.ended && !inDvrQuarantine()) {
          const cur = Number.isFinite(anyMedia.currentTime) ? anyMedia.currentTime : 0;
          const vodMode = settings.vodTimerMode ?? "countdown";
          let timeVal = vodMode === "elapsed" ? cur : clamp(dur - cur, 0, dur);
          let timeStr = fmtHMS(timeVal);
          if (settings.showPercent && dur > 0) timeStr += ` (${Math.round((cur/dur)*100)}%)`;
          safeSetTitle(`${settings.prefixPaused||"⏸"} ${timeStr}${sep}${baseTitle}`);
          updateOverlay(anyMedia, false, false, null);
          sessionActive = true; return;
        }

        if (anyMedia.ended) {
          pausedSnapshot = null; dvrQuarantineUntil = 0;
          if (!finishedEnabledForHost) return;
          const holdMs = Number(settings.finishedHoldMs) || 0;
          const t = nowMs();
          if (finishedUntil === 0) finishedUntil = holdMs === 0 ? Infinity : t + holdMs;
          if (t <= finishedUntil) safeSetTitle(`${settings.finishedPrefix||"✓ Finished"}${sep}${baseTitle}`);
          return;
        }
      }
    }

    // ─── OBSERVERS ───────────────────────────────────────────────────────────
    let bodyObserver = null, metaObserver = null;
    function startObservers() {
      if (!bodyObserver) { bodyObserver = new MutationObserver(() => { const v = getAnyRelevantMedia(); if (v && v !== currentVideoNode) { currentVideoNode = v; hardResetLiveState(); lastApplied = ""; finishedUntil = 0; } }); bodyObserver.observe(document.body, { childList: true, subtree: true }); }
      if (!metaObserver) { metaObserver = new MutationObserver(() => setTimeout(tick, 0)); metaObserver.observe(document.head || document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true }); }
    }

    // ─── SETTINGS LOAD ───────────────────────────────────────────────────────
    async function loadSettings() {
      try {
        const store = await chrome.storage.sync.get(["settings", "sites"]);
        const stored = store.settings || {};
        settings = { ...DEFAULTS, ...stored };
        const raw = store.sites || {};
        sitesRaw = raw; sitesCanon = {};
        for (const [k, v] of Object.entries(raw)) sitesCanon[canonicalHost(k)] = v;
        currentVid = ytVideoIdFromUrl(location.href);
        if (isTwitch()) lastTwitchIdentity = `${twitchChannelLogin()}::${findTwitchStreamIdFromApollo(getApollo())||"?"}`;
        computeEnabledFlags();
        if (settings.showOverlay && enabledForHost) toggleOverlay(true);
      } catch {}
    }

    function startLoop() {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(tick, clamp(Number(settings.updateIntervalMs)||250, 100, 5000));
      setTimeout(tick, 80);
    }

    // ─── SPA NAVIGATION ──────────────────────────────────────────────────────
    window.addEventListener("yt-navigate-start",  () => { navAtMs = nowMs(); dvrQuarantineUntil = 0; });
    window.addEventListener("yt-navigate-finish", () => {
      navAtMs = nowMs(); dvrQuarantineUntil = 0;
      const v = ytVideoIdFromUrl(location.href); if (v !== currentVid) { currentVid = v; hardResetLiveState(); sessionActive = false; }
      lastApplied = ""; setTimeout(tick, 200);
    });
    document.addEventListener("yt-page-data-updated", () => setTimeout(tick, 150));
    document.addEventListener("visibilitychange", tick);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.settings?.newValue) { const s = changes.settings.newValue || {}; const prevShow = settings.showOverlay; const prevEnabled = enabledForHost; settings = { ...DEFAULTS, ...s }; computeEnabledFlags(); const showNow = settings.showOverlay && enabledForHost; const showBefore = prevShow && prevEnabled; if (showNow !== showBefore) toggleOverlay(showNow); }
      if (changes.sites?.newValue) { const r = changes.sites.newValue || {}; sitesRaw = r; sitesCanon = {}; for (const [k,v] of Object.entries(r)) sitesCanon[canonicalHost(k)] = v; computeEnabledFlags(); }
      startLoop();
    });

    // ─── MESSAGES ────────────────────────────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "APPLY_SETTINGS") {
        loadSettings().then(() => { startObservers(); startLoop(); sendResponse?.({ ok: true }); });
        return true;
      }
      if (msg.type === "SET_LOCAL_ENABLED") {
        localEnabledOverride = typeof msg.enabled === "boolean" ? msg.enabled : null;
        computeEnabledFlags(); prevEffectiveEnabled = null; startLoop(); sendResponse?.({ ok: true, enabled: localEnabledOverride }); return;
      }
      if (msg.type === "GET_LOCAL_ENABLED") {
        computeEnabledFlags(); sendResponse?.({ override: localEnabledOverride, effective: enabledForHost }); return;
      }
      if (msg.type === "TOGGLE_SITE_ENABLED") {
        localEnabledOverride = !enabledForHost; computeEnabledFlags(); startLoop(); sendResponse?.({ ok: true, enabled: enabledForHost }); return;
      }
      if (msg.type === "SET_LOCAL_HIDE_INACTIVE") {
        localHideInactiveOverride = msg.enabled === null || msg.enabled === undefined ? null : !!msg.enabled;
        maybeToggleHideGuard(); setTimeout(() => { try { tick(); } catch {} }, 0);
        sendResponse?.({ ok: true, override: localHideInactiveOverride, effectiveHide: currentHideInactiveSetting() }); return;
      }
      if (msg.type === "GET_LOCAL_HIDE_INACTIVE") {
        sendResponse?.({ ok: true, override: localHideInactiveOverride ?? null, global: !!settings.hideWhenInactive, effective: currentHideInactiveSetting() }); return;
      }
      if (msg.type === "TOGGLE_MUTE") {
        const media = getPlayingMedia() || getAnyRelevantMedia();
        if (media) media.muted = !media.muted; sendResponse?.({ ok: true, muted: media?.muted ?? false }); return;
      }
      if (msg.type === "SELECT_VIDEO") {
        const all = Array.from(document.querySelectorAll("video,audio"));
        const idx = typeof msg.index === "number" ? msg.index : 0;
        if (idx >= 0 && idx < all.length) { selectedVideoIndex = idx; sendResponse?.({ ok: true, index: selectedVideoIndex }); }
        else sendResponse?.({ ok: false }); return;
      }
      if (msg.type === "SET_OVERLAY_VISIBLE") {
        toggleOverlay(!!msg.visible); sendResponse?.({ ok: true, visible: overlayVisible }); return;
      }
      if (msg.type === "GET_VIDEO_STATE") {
        const media = getPlayingMedia() || getAnyRelevantMedia();
        if (!media) { sendResponse?.({ hasMedia: false, enabled: enabledForHost }); return; }
        const dur = Number(media.duration); const cur = media.currentTime || 0; const rate = media.playbackRate || 1;
        const live = isStrongLive(media); const playing = !media.paused && !media.ended && media.readyState >= 2;
        const originMs = liveStartMs ?? fallbackLiveStartMs ?? null;
        const rawLeft = (Number.isFinite(dur) && dur > 0) ? clamp(dur - cur, 0, dur) : null;
        const adjLeft = (rawLeft != null && settings.speedAwareCountdown && rate > 0) ? clamp(rawLeft / rate, 0, rawLeft) : rawLeft;
        sendResponse?.({
          hasMedia: true, isPlaying: playing, isLive: live,
          currentTime: cur,
          duration: Number.isFinite(dur) ? dur : null,
          percent: (Number.isFinite(dur) && dur > 0) ? Math.round((cur / dur) * 100) : null,
          timeLeft: adjLeft, timeLeftRaw: rawLeft,
          liveElapsed: (live && originMs) ? clamp((nowMs() - originMs) / 1000, 0, 172800) : null,
          enabled: enabledForHost,
          vodTimerMode: settings.vodTimerMode ?? "countdown",
          playbackRate: rate,
          chapterTitle: getChapterTitle(),
          videoList: buildVideoList(),
          selectedVideoIndex,
          continuousWatchSecs: Math.floor(getContinuousSecs()),
        }); return;
      }
    });

    // ─── INIT ─────────────────────────────────────────────────────────────────
    (async () => { await loadSettings(); startObservers(); startLoop(); })();
    window.addEventListener("beforeunload", () => {
      flushWatchTimeSync();
      try { hideGuardStop(); } catch {}
    });

  })();
}
