// content.js
// Twitch: prefer H:MM:SS from UI (if present) so hours never get dropped.
// - The UI elapsed parser scans ALL matches, prioritizes H:MM:SS,
//   and falls back to the longest plausible value when needed.
// - Adds separate prefixes: prefixLivePlaying, prefixVODPlaying (paused uses prefixPaused).
// - Keeps legacy prefixPlaying as a fallback for existing users.

if (window.top === window.self) {
  (function () {
    const DEFAULTS = {
      // NEW: split playing prefixes
      prefixPlaying: "⏳",           // legacy fallback for older settings
      prefixLivePlaying: "🔴 LIVE",  // live playing prefix
      prefixVODPlaying: "⏳",        // VOD playing prefix
      prefixPaused: "⏸",
      finishedPrefix: "✓ Finished",
      finishedHoldMs: 0,
      updateIntervalMs: 250,
      defaultEnabled: false, // OFF unless user enables in Options
      hideWhenInactive: false,
      liveShowElapsed: true,
      liveStickMs: 8000,
      ytNavGraceMs: 2500,
      dvrQuarantineMs: 10000
    };

    // ---------- host helpers ----------
    const canonicalHost = (h) => {
      const host = (h || "").toLowerCase();
      if (host.endsWith(".youtube.com") || host === "youtube.com" || host === "youtu.be") return "youtube.com";
      if (host.endsWith(".twitch.tv") || host === "twitch.tv") return "twitch.tv";
      return host;
    };
    const rawHost = location.hostname;
    const host = canonicalHost(rawHost);
    const isYouTube = () => host === "youtube.com";
    const isTwitch = () => host === "twitch.tv";
    const isYouTubeWatch = () => isYouTube() && location.pathname === "/watch";

    // ---------- state ----------
    let settings = { ...DEFAULTS };
    let sitesCanon = {};
    let sitesRaw = {};
    let enabledForHost = false;
    let finishedEnabledForHost = true;

    // Per-tab override (null => follow settings)
    let localEnabledOverride = null;

    let lastApplied = "";          // last full title we set (with timer)
    let finishedUntil = 0;
    let lastHref = location.href;

    const ytVideoIdFromUrl = (url) => { try { return new URL(url, location.origin).searchParams.get("v") || ""; } catch { return ""; } };
    let currentVid = ytVideoIdFromUrl(location.href);

    // Track the actual <video> node identity (resets on Twitch stream swap)
    let currentVideoNode = null;

    // live session
    let isLive = false;
    let liveStartMs = null;         // authoritative start timestamp
    let fallbackLiveStartMs = null; // "now" until we discover real start
    let lastElapsedShownSec = 0;

    // misc
    let sessionActive = false;
    let lastIsPlaying = false;
    let pausedSnapshot = null; // { kind: "live"|"vod", elapsedSec?|remainingSec? }
    let navAtMs = Date.now();
    let dvrQuarantineUntil = 0;
    let intervalId = null;

    // enablement transition tracking
    let prevEffectiveEnabled = null;

    // Twitch stream identity tracking (prevents carry-over across raids/host/switches)
    let lastTwitchIdentity = ""; // channel::streamId::title

    // ---------- utils ----------
    const clamp = (n, min, max) => Math.max(min, Math.min(n, max));
    const nowMs = () => Date.now();

    // decoration helpers
    // Matches:
    //   ⏳ 12:34[(:56)] • Title
    //   ⏸ 12:34[(:56)] • Title
    //   🔴 LIVE 1:23:45 • Title
    //   ✓ Finished • Title
    // Keep tight to avoid stripping legitimate titles.
    const DECOR_RE = /^(?:[\u23F3\u23F8]\uFE0F?\s+\d{1,2}:\d{2}(?::\d{2})?\s+•\s+|\u{1F534}\s+LIVE\s+\d{1,2}:\d{2}(?::\d{2})?\s+•\s+|✓\s+Finished\s+•\s+)/u;
    const isDecorated = (t) => DECOR_RE.test(t || "");
    const stripDecor = (t) => (t || "").replace(DECOR_RE, "");

    function fmtHMS(totalSeconds) {
      totalSeconds = Math.max(0, Math.floor(totalSeconds));
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      return `${m}:${String(s).padStart(2, "0")}`;
    }

    // ---- Base title resolvers (fresh every render) ----
    function getYouTubePlayerResponse() {
      try {
        const y = window.ytInitialPlayerResponse || window.ytplayer?.config?.args?.player_response;
        return typeof y === "string" ? JSON.parse(y) : (y || null);
      } catch { return null; }
    }
    function getYouTubeTitleFresh() {
      const pr = getYouTubePlayerResponse();
      const vdTitle = pr?.videoDetails?.title;
      if (vdTitle && typeof vdTitle === "string") return vdTitle.trim();

      const h1 = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                 document.querySelector('h1.title yt-formatted-string') ||
                 document.querySelector('h1.ytd-watch-metadata') ||
                 document.querySelector('#title h1') ||
                 document.querySelector('h1');
      const t = (h1?.textContent || "").trim();
      if (t) return t;

      const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (og && og.trim()) return og.trim();

      return stripDecor(document.title || "").trim();
    }

    // Twitch fresh title (prevents stale names)
    function getTwitchTitleFresh() {
      const candidates = [
        '[data-a-target="stream-title"]',
        '[data-test-selector="stream-info-card-component__title"]',
        'h2[class*="StreamInfo"]',
        'h2[class*="stream"], h2[class*="title"]',
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        const tx = (el?.textContent || "").trim();
        if (tx) return tx;
      }
      const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (og && og.trim()) return og.trim();
      return stripDecor(document.title || "").trim();
    }

    function currentBaseTitle() {
      if (isYouTube()) return getYouTubeTitleFresh();
      if (isTwitch()) return getTwitchTitleFresh();
      const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
      if (og && og.trim()) return og.trim();
      return stripDecor(document.title || "").trim();
    }

    // ---------- Twitch helpers ----------
    function twitchChannelLogin() {
      const seg = (location.pathname || "/").split("/").filter(Boolean)[0] || "";
      if (seg && !["videos", "directory", "p"].includes(seg)) return seg.toLowerCase();

      try {
        const cand = document.querySelector('meta[property="og:url"]')?.getAttribute("content") ||
                     document.querySelector('link[rel="canonical"]')?.href || "";
        if (cand) {
          const parts = new URL(cand, location.origin).pathname.split("/").filter(Boolean);
          if (parts[0] && !["videos", "directory", "p"].includes(parts[0])) return parts[0].toLowerCase();
        }
      } catch {}

      const link = document.querySelector('[data-a-target="profile-link"], a[href^="/"][data-test-selector="user-menu__toggle"]');
      if (link) {
        try {
          const u = new URL(link.href, location.origin);
          const p = u.pathname.split("/").filter(Boolean);
          if (p[0]) return p[0].toLowerCase();
        } catch {}
      }
      return "";
    }

    function getWindowApollo() {
      try {
        const w = window;
        const ap = w.__APOLLO_STATE__;
        if (ap && typeof ap === "object") return ap;
      } catch {}
      return null;
    }
    function parseApolloFromScripts() {
      const scripts = Array.from(document.scripts);
      for (const s of scripts) {
        const txt = s.textContent || "";
        if (!txt || txt.indexOf("__APOLLO_STATE__") === -1) continue;
        const m = txt.match(/__APOLLO_STATE__\s*=\s*({[\s\S]*?});/);
        if (!m) continue;
        try { return JSON.parse(m[1]); } catch {}
      }
      return null;
    }
    function getApollo() {
      return getWindowApollo() || parseApolloFromScripts();
    }

    function findLiveStartMsFromApollo(ap) {
      if (!ap) return null;
      let best = null;
      const consider = (obj) => {
        if (!obj || typeof obj !== "object") return;
        for (const key of ["startedAt", "createdAt", "publishedAt", "streamStartedAt"]) {
          const raw = obj[key];
          if (typeof raw === "string") {
            const t = Date.parse(raw);
            if (!Number.isNaN(t) && (nowMs() - t) <= 48 * 3600 * 1000) {
              if (best == null || t > best) best = t;
            }
          }
        }
      };
      for (const k in ap) consider(ap[k]);
      return best;
    }

    function findTwitchStreamIdFromApollo(ap) {
      if (!ap) return "";
      for (const k in ap) {
        const v = ap[k];
        if (!v || typeof v !== "object") continue;
        const typename = v.__typename || "";
        if (/stream/i.test(typename) && typeof v.id === "string" && v.id) return v.id;
      }
      for (const k in ap) {
        const v = ap[k];
        if (!v || typeof v !== "object") continue;
        const typename = v.__typename || "";
        if (/video/i.test(typename) && typeof v.id === "string" && v.broadcastType === "LIVE") return v.id;
      }
      return "";
    }

    function parseStartFromJsonLd() {
      const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
      const walk = (obj) => {
        if (!obj || typeof obj !== "object") return null;
        if (typeof obj.startDate === "string") {
          const ms = Date.parse(obj.startDate);
          if (!Number.isNaN(ms)) return ms;
        }
        for (const k of Object.keys(obj)) {
          const got = walk(obj[k]);
          if (got) return got;
        }
        return null;
      };
      for (const s of scripts) {
        try {
          const data = JSON.parse(s.textContent || "{}");
          const ms = walk(data);
          if (ms) return ms;
        } catch {}
      }
      return null;
    }
    function findLiveStartMsFromMeta() {
      const metaRelease = document.querySelector('meta[property="og:video:release_date"], meta[property="video:release_date"]');
      if (metaRelease?.content) {
        const t = Date.parse(metaRelease.content);
        if (!Number.isNaN(t)) return t;
      }
      const tEl = document.querySelector('time[datetime]');
      if (tEl) {
        const t = Date.parse(tEl.getAttribute('datetime') || "");
        if (!Number.isNaN(t)) return t;
      }
      return null;
    }
    function findLiveStartMsGeneric() {
      const ap = getApollo();
      return (
        findLiveStartMsFromApollo(ap) ||
        parseStartFromJsonLd() ||
        findLiveStartMsFromMeta()
      );
    }

    // ---------- Twitch UI elapsed-time reader ----------
    function parseBestClockishToSec(txt) {
      const re = /(\d{1,2}):([0-5]\d)(?::([0-5]\d))?/g;
      let best = null;
      for (let m; (m = re.exec(txt)) !== null; ) {
        const hasH = m[3] != null;
        const h = hasH ? Number(m[1]) : 0;
        const mm = hasH ? Number(m[2]) : Number(m[1]);
        const ss = hasH ? Number(m[3]) : Number(m[2]);
        if ([h, mm, ss].some(Number.isNaN)) continue;
        const sec = h * 3600 + mm * 60 + ss;
        if (sec <= 0 || sec > 48 * 3600) continue;
        if (best == null ||
            (h > 0 && best.h === 0) ||
            (h === best.h && sec > best.sec)) {
          best = { h, sec };
        }
      }
      return best ? best.sec : null;
    }

    function parseWordsToSec(txt) {
      const lower = txt.toLowerCase();
      const hm = /(\d+)\s*h(?:ou)?rs?/.exec(lower);
      const mm = /(\d+)\s*m(?:in)?(?:ute)?s?/.exec(lower);
      const ss = /(\d+)\s*s(?:ec)?(?:ond)?s?/.exec(lower);
      let total = 0, found = false;
      if (hm) { total += Number(hm[1]) * 3600; found = true; }
      if (mm) { total += Number(mm[1]) * 60;   found = true; }
      if (ss) { total += Number(ss[1]);        found = true; }
      if (!found || total <= 0 || total > 48 * 3600) return null;
      return total;
    }

    function candidateElapsedNodes() {
      const sel = [
        '[data-a-target="stream-title"]',
        '[data-test-selector="stream-info-card-component__title"]',
        '[data-a-target="stream-info-card-component__metadata"]',
        '[data-a-target="stream-info-card-component__subtitle"]',
        '[data-test-selector*="stream-info"], [data-test-selector*="metadata"]',
        '[data-a-target*="stream"], [data-a-target*="time"], [data-a-target*="duration"]',
        '[class*="stream"], [class*="time"], [class*="duration"]',
        'main section, aside, header'
      ].join(",");
      const nodes = Array.from(document.querySelectorAll(sel));
      return nodes.slice(0, 150);
    }

    function twitchUiElapsedSec() {
      let bestSec = null;
      let found3part = false;

      const regions = candidateElapsedNodes();
      for (const el of regions) {
        const texts = new Set();
        const t = (el.textContent || "").trim();
        if (t) texts.add(t);
        const aria = el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"));
        if (aria) texts.add(aria.trim());

        for (const txt of texts) {
          const clockSec = parseBestClockishToSec(txt);
          if (clockSec != null) {
            const hasH = /\d{1,2}:[0-5]\d:[0-5]\d/.test(txt);
            if (hasH) found3part = true;
            if (
              bestSec == null ||
              (found3part && !/\d{1,2}:[0-5]\d:[0-5]\d/.test(`00:${fmtHMS(bestSec)}`)) ||
              clockSec > bestSec
            ) {
              bestSec = clockSec;
            }
          }
          const wordSec = parseWordsToSec(txt);
          if (wordSec != null) {
            if (bestSec == null || (!found3part && wordSec > bestSec)) bestSec = wordSec;
          }
        }
      }

      if (bestSec == null) {
        const v = getAnyRelevantMedia();
        if (v) {
          let p = v.parentElement, hops = 0;
          while (p && hops < 6) {
            const txt = (p.textContent || "").trim();
            const sec = parseBestClockishToSec(txt) ?? parseWordsToSec(txt);
            if (sec != null) { bestSec = sec; break; }
            p = p.parentElement; hops++;
          }
        }
      }
      return bestSec;
    }

    function maybeSnapToTwitchUIElapsed() {
      if (!isTwitch() || !settings.liveShowElapsed) return;
      const elapsed = twitchUiElapsedSec();
      if (elapsed == null) return;
      const derivedStart = nowMs() - elapsed * 1000;

      const needSnap =
        liveStartMs == null ||
        Math.abs(derivedStart - liveStartMs) > 5000 ||
        elapsed + 15 < lastElapsedShownSec;

      if (needSnap) {
        liveStartMs = derivedStart;
        fallbackLiveStartMs = null;
      }
    }

    // ---------- title I/O ----------
    function safeSetTitle(newTitle) {
      if (document.title !== newTitle) document.title = newTitle;
      lastApplied = newTitle;
    }
    function restoreTitleOnceIfDecorated() {
      const raw = document.title || "";
      if (isDecorated(raw)) {
        const clean = stripDecor(raw);
        if (document.title !== clean) document.title = clean;
      }
      lastApplied = "";
    }

    function hardResetLiveState() {
      isLive = false;
      liveStartMs = null;
      fallbackLiveStartMs = null;
      lastElapsedShownSec = 0;
    }

    function updateBaseTitleIfNavigated() {
      if (location.href !== lastHref) {
        lastHref = location.href;
        navAtMs = nowMs();

        const vidNow = ytVideoIdFromUrl(location.href);
        const vidChanged = vidNow !== currentVid;
        currentVid = vidNow;

        sessionActive = false;
        finishedUntil = 0;
        dvrQuarantineUntil = 0;
        hardResetLiveState();
        pausedSnapshot = null;
        lastIsPlaying = false;
        lastApplied = "";

        if (vidChanged) hardResetLiveState();
      }
    }

    // ---------- enablement ----------
    function computeEnabledFlags() {
      if (localEnabledOverride !== null) {
        enabledForHost = !!localEnabledOverride;
      } else {
        const entryCanon = sitesCanon[host];
        const entryRaw  = sitesRaw[rawHost];
        const entry = entryCanon ?? entryRaw ?? null;
        const def = (settings.defaultEnabled !== undefined) ? !!settings.defaultEnabled : DEFAULTS.defaultEnabled;
        enabledForHost = entry ? !!entry.enabled : def;
      }
      const entryCanon = sitesCanon[host];
      const entryRaw  = sitesRaw[rawHost];
      const entry = entryCanon ?? entryRaw ?? null;
      finishedEnabledForHost = entry?.finishedEnabled ?? true;
    }

    // ---------- live detection ----------
    function isYouTubeLiveByBadge() {
      const mp = document.getElementById("movie_player");
      const badge = document.querySelector(".ytp-live-badge");
      const liveBtn = document.querySelector("button.ytp-live-button");
      const badgeVisible = !!(badge && (badge.offsetParent !== null) && /live/i.test(badge.textContent || ""));
      const liveClass = !!(mp && (mp.classList.contains("ytp-live") || mp.classList.contains("ytp-embed-live")));
      const liveButton = !!(liveBtn && /live/i.test(liveBtn.getAttribute("aria-label") || ""));
      return badgeVisible || liveClass || liveButton;
    }
    function getYouTubeLiveInfo() {
      let liveNow = false;
      let startMs = null;

      const pr = getYouTubePlayerResponse();
      if (pr) {
        const mf = pr.microformat?.playerMicroformatRenderer;
        const vd = pr.videoDetails || {};
        const lb = mf?.liveBroadcastDetails || {};
        if (vd.isLiveContent === true) liveNow = true;
        if (lb?.isLiveNow === true) liveNow = true;
        if (pr.playabilityStatus?.liveStreamability) liveNow = true;

        const ts = lb?.startTimestamp;
        if (ts) {
          const ms = Date.parse(ts);
          if (!Number.isNaN(ms)) startMs = ms;
        }
      }
      if (!startMs) {
        const metaStart = document.querySelector('meta[itemprop="startDate"]')?.getAttribute("content");
        if (metaStart) {
          const ms = Date.parse(metaStart);
          if (!Number.isNaN(ms)) startMs = ms;
        }
      }
      if (!startMs) startMs = parseStartFromJsonLd();

      if (!liveNow && isYouTube() && isYouTubeLiveByBadge()) liveNow = true;

      if (startMs && (nowMs() - startMs) > 48 * 3600 * 1000) startMs = null;

      return { liveNow, startMs };
    }
    function isStrongLive(media) {
      const dur = Number(media?.duration);
      const durationInfinite = media && Number.isFinite(dur) === false;
      if (isYouTube()) {
        const { liveNow } = getYouTubeLiveInfo();
        return durationInfinite || isYouTubeLiveByBadge() || liveNow;
      }
      return durationInfinite;
    }

    // DVR helpers
    const looksLikeDvrHour = (dur) => Number.isFinite(dur) && dur >= 3500 && dur <= 3700;
    const inDvrQuarantine = () => isYouTubeWatch() && nowMs() < dvrQuarantineUntil;

    // ---------- player helpers ----------
    function getPrimaryYouTubePlayer() {
      return (
        document.querySelector("ytd-player video") ||
        document.querySelector("#movie_player video") ||
        document.querySelector("video") || null
      );
    }
    function getPlayingMedia() {
      if (isYouTubeWatch()) {
        const v = getPrimaryYouTubePlayer();
        return v && !v.paused && !v.ended && v.readyState >= 2 ? v : null;
      }
      const els = Array.from(document.querySelectorAll("video,audio"));
      return els.find(e => !e.paused && !e.ended && e.readyState >= 2) || null;
    }
    function getAnyRelevantMedia() {
      if (isYouTubeWatch()) return getPrimaryYouTubePlayer();
      const els = Array.from(document.querySelectorAll("video,audio"));
      return els[0] || null;
    }

    // ---------- observers ----------
    let bodyObserver = null;
    let headObserver = null;

    function startObservers() {
      if (!bodyObserver) {
        bodyObserver = new MutationObserver(() => {
          const v = getAnyRelevantMedia();
          if (v && v !== currentVideoNode) {
            currentVideoNode = v;
            hardResetLiveState();
            lastApplied = "";
            finishedUntil = 0;
          }
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
      }
      if (!headObserver) {
        headObserver = new MutationObserver(() => { setTimeout(tick, 0); });
        headObserver.observe(document.head || document.documentElement, { childList: true, subtree: true, attributes: true });
      }
    }
    function stopObservers() {
      try { bodyObserver?.disconnect(); headObserver?.disconnect(); } catch {}
      bodyObserver = null; headObserver = null;
    }

    // ---------- main tick ----------
    function tick() {
      updateBaseTitleIfNavigated();
      computeEnabledFlags();

      const visible = document.visibilityState === "visible";
      const hiddenPolicy = settings.hideWhenInactive && !visible;
      const effectiveEnabled = enabledForHost && !hiddenPolicy;

      if (prevEffectiveEnabled !== effectiveEnabled) {
        if (!effectiveEnabled) {
          restoreTitleOnceIfDecorated();
        } else {
          lastApplied = "";
          hardResetLiveState();
        }
        prevEffectiveEnabled = effectiveEnabled;
      }
      if (!effectiveEnabled) return;

      if (isTwitch()) {
        const ident = currentTwitchStreamIdentity();
        if (ident && ident !== lastTwitchIdentity) {
          lastTwitchIdentity = ident;
          hardResetLiveState();
          finishedUntil = 0;
          lastApplied = "";
        }
      }

      if (isYouTube() && !isYouTubeWatch()) return;

      const mediaPlaying = getPlayingMedia();
      const anyMedia = mediaPlaying || getAnyRelevantMedia();

      if (anyMedia && anyMedia !== currentVideoNode) {
        currentVideoNode = anyMedia;
        hardResetLiveState();
        lastApplied = "";
      }

      const baseTitle = currentBaseTitle();

      // ----- PLAYING -----
      if (mediaPlaying) {
        sessionActive = true;

        const dur = Number(mediaPlaying.duration);
        const strongLive = isStrongLive(mediaPlaying);

        // YouTube-only DVR quarantine to avoid 59:59 false VOD
        if (isYouTubeWatch() && !strongLive && looksLikeDvrHour(dur)) {
          const sinceNav = nowMs() - navAtMs;
          const grace = Number(settings.ytNavGraceMs) || 2500;
          const quarantineMs = Number(settings.dvrQuarantineMs) || 10000;
          if (sinceNav < grace || dvrQuarantineUntil < nowMs()) dvrQuarantineUntil = nowMs() + quarantineMs;
        }

        if (strongLive && settings.liveShowElapsed) {
          isLive = true;

          // Acquire/refresh liveStartMs
          if (isYouTube()) {
            const { startMs } = getYouTubeLiveInfo();
            if (startMs && (liveStartMs == null || Math.abs(liveStartMs - startMs) > 1000)) liveStartMs = startMs;
          } else if (isTwitch()) {
            const ap = getApollo();
            const maybe = findLiveStartMsFromApollo(ap) || parseStartFromJsonLd() || findLiveStartMsFromMeta();
            if (maybe && (nowMs() - maybe) <= 48 * 3600 * 1000) liveStartMs = maybe;
            maybeSnapToTwitchUIElapsed();
          } else {
            const maybe = parseStartFromJsonLd() || findLiveStartMsFromMeta();
            if (maybe && (nowMs() - maybe) <= 48 * 3600 * 1000) liveStartMs = maybe;
          }

          if (liveStartMs == null && fallbackLiveStartMs == null) fallbackLiveStartMs = nowMs();
          const originMs = liveStartMs ?? fallbackLiveStartMs ?? nowMs();
          const elapsedSec = clamp((nowMs() - originMs) / 1000, 0, 60 * 60 * 48);
          lastElapsedShownSec = elapsedSec;

          const livePfx = (settings.prefixLivePlaying ?? settings.prefixPlaying ?? "🔴 LIVE");
          safeSetTitle(`${livePfx} ${fmtHMS(elapsedSec)} • ${baseTitle}`);
          lastIsPlaying = true;
          pausedSnapshot = null;
          return;
        }

        // Not strong-live -> VOD
        hardResetLiveState();

        if (inDvrQuarantine()) return;
        if (!Number.isFinite(dur) || dur <= 0) return;
        const cur = Number.isFinite(mediaPlaying.currentTime) ? mediaPlaying.currentTime : 0;
        const left = clamp(Math.ceil(dur - cur), 0, dur);
        const vodPfx = (settings.prefixVODPlaying ?? settings.prefixPlaying ?? "⏳");
        safeSetTitle(`${vodPfx} ${fmtHMS(left)} • ${baseTitle}`);
        lastIsPlaying = true;
        return;
      }

      // ----- NOT PLAYING -----
      if (anyMedia) {
        const dur = Number(anyMedia.duration);
        const strongLive = isStrongLive(anyMedia);

        if (strongLive && settings.liveShowElapsed) {
          // Keep probing for start while paused, too
          if (isYouTube()) {
            const { startMs } = getYouTubeLiveInfo();
            if (startMs && (liveStartMs == null || Math.abs(liveStartMs - startMs) > 1000)) liveStartMs = startMs;
          } else {
            const ap = getApollo();
            const maybe = (isTwitch() && (findLiveStartMsFromApollo(ap) || parseStartFromJsonLd() || findLiveStartMsFromMeta())) ||
                          parseStartFromJsonLd() || findLiveStartMsFromMeta();
            if (maybe && (nowMs() - maybe) <= 48 * 3600 * 1000) liveStartMs = maybe;
            if (isTwitch()) maybeSnapToTwitchUIElapsed();
          }

          if (liveStartMs == null && fallbackLiveStartMs == null) fallbackLiveStartMs = nowMs();
          const originMs = liveStartMs ?? fallbackLiveStartMs ?? nowMs();
          const elapsedSec = lastIsPlaying ? lastElapsedShownSec : clamp((nowMs() - originMs) / 1000, 0, 60 * 60 * 48);
          pausedSnapshot = { kind: "live", elapsedSec };

          const baseTitle2 = currentBaseTitle();
          safeSetTitle(`${settings.prefixPaused || "⏸"} ${fmtHMS(pausedSnapshot.elapsedSec)} • ${baseTitle2}`);
          return;
        }

        // VOD paused/preplay
        hardResetLiveState();
        if (Number.isFinite(dur) && dur > 0 && !anyMedia.ended && !inDvrQuarantine()) {
          const cur = Number.isFinite(anyMedia.currentTime) ? anyMedia.currentTime : 0;
          const left = clamp(Math.ceil(dur - cur), 0, dur);
          const baseTitle3 = currentBaseTitle();
          safeSetTitle(`${settings.prefixPaused || "⏸"} ${fmtHMS(left)} • ${baseTitle3}`);
          sessionActive = true;
          return;
        }

        if (anyMedia.ended) {
          pausedSnapshot = null;
          dvrQuarantineUntil = 0;
          if (!finishedEnabledForHost) return;
          const holdMs = Number(settings.finishedHoldMs) || 0;
          const t = nowMs();
          if (finishedUntil === 0) finishedUntil = holdMs === 0 ? Number.POSITIVE_INFINITY : t + holdMs;
          if (t <= finishedUntil) {
            const baseTitle4 = currentBaseTitle();
            safeSetTitle(`${settings.finishedPrefix || "✓ Finished"} • ${baseTitle4}`);
          }
          return;
        }
      }

      // No media -> do nothing (leave page title alone)
    }

    // ---------- wiring ----------
    async function loadSettings() {
      try {
        const store = await chrome.storage.sync.get(["settings", "sites"]);
        const stored = store.settings || {};
        // Merge with new defaults while preserving legacy prefixPlaying fallback
        settings = { ...DEFAULTS, ...stored };
        if (stored.defaultEnabled === undefined) settings.defaultEnabled = DEFAULTS.defaultEnabled;

        const raw = store.sites || {};
        sitesRaw = raw;
        const mapped = {};
        for (const [k, v] of Object.entries(raw)) mapped[canonicalHost(k)] = v;
        sitesCanon = mapped;

        currentVid = ytVideoIdFromUrl(location.href);

        if (isTwitch()) {
          lastTwitchIdentity = currentTwitchStreamIdentity();
        }
      } catch { /* fail-open */ }
    }

    function startLoop() {
      stopLoop();
      const ms = clamp(Number(settings.updateIntervalMs) || 250, 100, 5000);
      intervalId = setInterval(tick, ms);
      setTimeout(tick, 80);
    }
    function stopLoop() { if (intervalId) clearInterval(intervalId); intervalId = null; }

    window.addEventListener("yt-navigate-start", () => {
      navAtMs = nowMs();
      dvrQuarantineUntil = 0;
    });
    window.addEventListener("yt-navigate-finish", () => {
      navAtMs = nowMs();
      dvrQuarantineUntil = 0;

      const newVid = ytVideoIdFromUrl(location.href);
      if (newVid !== currentVid) {
        currentVid = newVid;
        hardResetLiveState();
        sessionActive = false;
      }
      lastApplied = "";
      setTimeout(tick, 200);
    });
    document.addEventListener("yt-page-data-updated", () => { setTimeout(tick, 150); });

    document.addEventListener("visibilitychange", tick);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (changes.settings?.newValue) {
        const stored = changes.settings.newValue || {};
        settings = { ...DEFAULTS, ...stored };
        if (stored.defaultEnabled === undefined) settings.defaultEnabled = DEFAULTS.defaultEnabled;
      }
      if (changes.sites?.newValue) {
        const raw = changes.sites.newValue || {};
        sitesRaw = raw;
        const mapped = {};
        for (const [k, v] of Object.entries(raw)) mapped[canonicalHost(k)] = v;
        sitesCanon = mapped;
      }
      startLoop();
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || typeof msg !== "object") return;

      if (msg.type === "APPLY_SETTINGS") {
        loadSettings().then(() => { startObservers(); startLoop(); });
      }

      // per-tab enable/disable from popup
      if (msg.type === "SET_LOCAL_ENABLED") {
        localEnabledOverride = !!msg.enabled;  // true/false
        prevEffectiveEnabled = null;           // force edge handling next tick
        startLoop();
        sendResponse?.({ ok: true, enabled: localEnabledOverride });
        return;
      }

      if (msg.type === "GET_LOCAL_ENABLED") {
        computeEnabledFlags();
        sendResponse?.({ override: localEnabledOverride, effective: enabledForHost });
        return;
      }
    });

    (async () => { await loadSettings(); startObservers(); startLoop(); })();

    window.addEventListener("beforeunload", () => { try { stopObservers(); } catch {} });

    // ---- identity helper (kept last to avoid hoist noise) ----
    function currentTwitchStreamIdentity() {
      if (!isTwitch()) return "";
      const channel = twitchChannelLogin();
      const ap = getApollo();
      const streamId = findTwitchStreamIdFromApollo(ap);
      const title = getTwitchTitleFresh();
      return `${channel || "?"}::${streamId || "?"}::${title || "?"}`;
    }
  })();
}
