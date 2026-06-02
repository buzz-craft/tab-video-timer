// popup.js — Tab Video Timer v2.0

(async () => {
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  };

  const getHost = (url) => {
    try { return new URL(url).hostname; } catch { return ""; }
  };

  /** Format seconds as H:MM:SS or M:SS */
  function fmtSec(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    return `${m}:${String(ss).padStart(2, "0")}`;
  }

  /** Format seconds as human-readable watch time: "2h 34m", "45m", "< 1m" */
  function fmtWatch(s) {
    s = Math.max(0, Math.floor(s || 0));
    if (s < 60) return "< 1m";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    return `${m}m`;
  }

  // -------------------------------------------------------------------------
  // Tab / host setup
  // -------------------------------------------------------------------------
  const tab = await getActiveTab();
  const rawHost = getHost(tab?.url || "");
  const displayHost = rawHost.replace(/^www\./, "") || "";
  const canonHost = displayHost.toLowerCase();

  // -------------------------------------------------------------------------
  // Tab switching
  // -------------------------------------------------------------------------
  let statsLoaded = false;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panelId = btn.dataset.panel;

      // Update tab buttons
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });

      // Update panels
      document.querySelectorAll(".tab-panel").forEach((p) => {
        p.classList.toggle("active", p.id === `panel-${panelId}`);
      });

      // Lazy-load stats on first open
      if (panelId === "stats" && !statsLoaded) {
        statsLoaded = true;
        loadStats();
      }
    });
  });

  // -------------------------------------------------------------------------
  // Mute toggle
  // -------------------------------------------------------------------------
  async function tryContentScriptToggle(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "TOGGLE_MUTE" });
      return true;
    } catch {
      return false;
    }
  }

  async function forcePageToggle(tabId) {
    try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const media = Array.from(document.querySelectorAll("video,audio"));
        if (media.length === 0) return { muted: false };

        const anyAudible = media.some((v) => !v.muted && v.volume > 0);
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
            if (!wantMute && v.volume === 0) v.volume = 0.5;
          } catch {}
        }

        const nowAudible = media.some((v) => !v.muted && v.volume > 0);
        return { muted: !nowAudible };
      },
    });
    return result ?? null;
    } catch { return null; }
  }

  function updateMuteLabel(muted) {
    const btn = $("mute");
    const lbl = $("muteLabel");
    if (!btn || !lbl) return;
    lbl.textContent = muted ? "Unmute" : "Mute";
    btn.querySelector(".btn-icon").textContent = muted ? "🔇" : "🔊";
    btn.setAttribute("aria-pressed", muted ? "true" : "false");
  }

  async function initMuteLabel(tabId) {
    try {
      const res = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const media = Array.from(document.querySelectorAll("video,audio"));
          return { muted: !media.some((v) => !v.muted && v.volume > 0) };
        },
      });
      updateMuteLabel(res?.[0]?.result?.muted ?? false);
    } catch {}
  }

  const muteBtn = $("mute");
  if (muteBtn) {
    muteBtn.addEventListener("click", async () => {
      if (!tab?.id) return;
      const res = await forcePageToggle(tab.id);
      updateMuteLabel(res?.muted ?? false);
    });
  }

  // -------------------------------------------------------------------------
  // Enable / disable timer for this tab
  // -------------------------------------------------------------------------
  async function queryTabEnable(tabId) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "GET_LOCAL_ENABLED" });
      const override = res?.override ?? null;
      const effective = !!res?.effective;
      return { ok: true, enabledForLabel: effective, override, effective };
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

  function setEnableButtonUI(isEnabled) {
    const btn = $("toggleSiteBtn");
    const lbl = $("toggleSiteLabel");
    if (!btn || !lbl) return;
    lbl.textContent = isEnabled ? "Disable timer" : "Enable timer";
    btn.setAttribute("aria-pressed", isEnabled ? "true" : "false");
  }

  const toggleSiteBtn = $("toggleSiteBtn");
  if (toggleSiteBtn) {
    toggleSiteBtn.addEventListener("click", async () => {
      if (!tab?.id) return;
      const current = await queryTabEnable(tab.id);
      const next = !current.effective;
      await setTabEnable(tab.id, next);
      setEnableButtonUI(next);
    });
  }

  // -------------------------------------------------------------------------
  // Hide-when-inactive (per tab)
  // -------------------------------------------------------------------------
  async function loadHideInactiveFromTab(tabId) {
    const el = $("hideWhenInactive");
    if (!el) return;
    const prev = el.checked;
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: "GET_LOCAL_HIDE_INACTIVE" });
      if (!res) return;
      const hasOverride = "override" in res && res.override !== null;
      el.checked = hasOverride ? !!res.override : !!res.effective;
    } catch {
      try {
        const { settings = {} } = await chrome.storage.sync.get("settings");
        el.checked = typeof settings.hideWhenInactive === "boolean" ? settings.hideWhenInactive : prev;
      } catch {
        el.checked = prev;
      }
    }
  }

  const hideInactiveEl = $("hideWhenInactive");
  if (hideInactiveEl) {
    hideInactiveEl.addEventListener("change", async () => {
      if (!tab?.id) return;
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, {
          type: "SET_LOCAL_HIDE_INACTIVE",
          enabled: !!hideInactiveEl.checked,
        });
        if (resp && "override" in resp) {
          hideInactiveEl.checked = resp.override === null ? !!resp.effectiveHide : !!resp.override;
        } else {
          await loadHideInactiveFromTab(tab.id);
        }
        try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS" }); } catch {}
      } catch {
        await loadHideInactiveFromTab(tab.id);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Finished toggle (per site)
  // -------------------------------------------------------------------------
  async function loadFinishedForSite() {
    const el = $("finishedEnabledThisSite");
    if (!el || !canonHost) return;
    try {
      const { sites = {}, settings = {} } = await chrome.storage.sync.get(["sites", "settings"]);
      const entry = sites[canonHost];
      const val = entry?.finishedEnabled ?? (settings.finishedEnabled ?? true);
      el.checked = !!val;
    } catch {}
  }

  const finishedSiteEl = $("finishedEnabledThisSite");
  if (finishedSiteEl) {
    finishedSiteEl.addEventListener("change", async () => {
      try {
        const { sites = {}, settings = {} } = await chrome.storage.sync.get(["sites", "settings"]);
        const entry = sites[canonHost] || { enabled: settings.defaultEnabled ?? true, finishedEnabled: true };
        await chrome.storage.sync.set({
          sites: { ...sites, [canonHost]: { ...entry, finishedEnabled: !!finishedSiteEl.checked } },
        });
        try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS" }); } catch {}
      } catch {}
    });
  }

  // -------------------------------------------------------------------------
  // Overlay visibility
  // -------------------------------------------------------------------------
  async function loadOverlayState() {
    const el = $("overlayVisible");
    if (!el) return;
    try {
      const { settings = {} } = await chrome.storage.sync.get("settings");
      el.checked = !!settings.showOverlay;
    } catch {}
  }

  const overlayEl = $("overlayVisible");
  if (overlayEl) {
    overlayEl.addEventListener("change", async () => {
      if (!tab?.id) return;
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: "SET_OVERLAY_VISIBLE",
          visible: !!overlayEl.checked,
        });
        try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS" }); } catch {}
      } catch {}
    });
  }

  // -------------------------------------------------------------------------
  // Keep playing when inactive (global setting)
  // -------------------------------------------------------------------------
  async function loadKeepPlayingState() {
    const el = $("keepPlayingWhenInactive");
    if (!el) return;
    try {
      const { settings = {} } = await chrome.storage.sync.get("settings");
      el.checked = !!settings.keepPlayingWhenInactive;
    } catch {}
  }

  const keepPlayingEl = $("keepPlayingWhenInactive");
  if (keepPlayingEl) {
    keepPlayingEl.addEventListener("change", async () => {
      try {
        const { settings = {} } = await chrome.storage.sync.get("settings");
        const updated = { ...settings, keepPlayingWhenInactive: !!keepPlayingEl.checked };
        await chrome.storage.sync.set({ settings: updated });
        try { await chrome.tabs.sendMessage(tab.id, { type: "APPLY_SETTINGS" }); } catch {}
      } catch {}
    });
  }

  // -------------------------------------------------------------------------
  // Options / Shortcuts
  // -------------------------------------------------------------------------
  const openOptionsBtn = $("openOptions");
  if (openOptionsBtn) {
    openOptionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
  }

  const openShortcutsBtn = $("openShortcuts");
  if (openShortcutsBtn) {
    openShortcutsBtn.addEventListener("click", () =>
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" })
    );
  }

  // -------------------------------------------------------------------------
  // Video state rendering
  // -------------------------------------------------------------------------
  function renderVideoState(state) {
    const iconEl       = $("statusIcon");
    const textEl       = $("statusText");
    const rateBadgeEl  = $("rateBadge");
    const chapterEl    = $("chapterTitle");
    const tvEl         = $("timeValue");
    const pwEl         = $("progressWrap");
    const fillEl       = $("progressFill");
    const elapsedEl    = $("timeElapsed");
    const durEl        = $("timeDuration");
    const badgeEl      = $("liveBadge");
    const pickerCard   = $("videoPickerCard");
    const videoListEl  = $("videoList");

    if (!iconEl || !textEl) return;

    // --- No media ---
    if (!state?.hasMedia) {
      iconEl.textContent = "📺";
      textEl.textContent = state?.enabled === false
        ? "Timer disabled for this site"
        : "No video detected";
      if (rateBadgeEl) rateBadgeEl.hidden = true;
      if (chapterEl)   chapterEl.hidden   = true;
      if (tvEl)        tvEl.hidden        = true;
      if (pwEl)        pwEl.hidden        = true;
      if (badgeEl)     badgeEl.hidden     = true;
      if (pickerCard)  pickerCard.hidden  = true;
      return;
    }

    // --- Playback rate badge ---
    if (rateBadgeEl) {
      const rate = state.playbackRate ?? 1;
      if (rate !== 1) {
        rateBadgeEl.textContent = `${rate}×`;
        rateBadgeEl.hidden = false;
      } else {
        rateBadgeEl.hidden = true;
      }
    }

    // --- Chapter title ---
    if (chapterEl) {
      if (state.chapterTitle) {
        chapterEl.textContent = state.chapterTitle;
        chapterEl.hidden = false;
      } else {
        chapterEl.hidden = true;
      }
    }

    // --- Live stream ---
    if (state.isLive) {
      if (badgeEl) badgeEl.hidden = false;
      iconEl.textContent = "🔴";
      textEl.textContent = state.isPlaying ? "Live · Playing" : "Live · Paused";
      if (tvEl) {
        if (state.liveElapsed != null) {
          tvEl.textContent = fmtSec(state.liveElapsed) + " elapsed";
          tvEl.hidden = false;
        } else {
          tvEl.hidden = true;
        }
      }
      if (pwEl) pwEl.hidden = true;
    } else {
      // --- VOD ---
      if (badgeEl) badgeEl.hidden = true;
      iconEl.textContent = state.isPlaying ? "▶" : "⏸";
      textEl.textContent = state.isPlaying ? "Playing" : "Paused";

      if (tvEl) {
        if (state.timeLeft != null && state.duration != null) {
          const vodMode = state.vodTimerMode ?? "countdown";
          tvEl.textContent = vodMode === "elapsed"
            ? fmtSec(state.currentTime) + " watched"
            : fmtSec(state.timeLeft)    + " remaining";
          tvEl.hidden = false;
        } else {
          tvEl.hidden = true;
        }
      }

      if (pwEl && fillEl && elapsedEl && durEl) {
        if (state.duration != null) {
          const pct = state.percent ?? 0;
          fillEl.style.width = pct + "%";
          elapsedEl.textContent = fmtSec(state.currentTime);
          durEl.textContent     = fmtSec(state.duration);
          pwEl.hidden = false;
        } else {
          pwEl.hidden = true;
        }
      }
    }

    // --- Video picker ---
    if (pickerCard && videoListEl) {
      const vl = state.videoList ?? [];
      if (vl.length > 1) {
        pickerCard.hidden = false;
        // only re-render if list shape or selection changed to avoid picker flicker
        const key = vl.map(v => `${v.index}:${v.duration}:${v.width}x${v.height}`).join("|") + "|sel:" + (state.selectedVideoIndex ?? 0);
        if (key !== lastVideoListKey) {
          lastVideoListKey = key;
          renderVideoList(vl, state.selectedVideoIndex ?? 0, tab.id);
        }
      } else {
        pickerCard.hidden = true;
        lastVideoListKey = "";
      }
    }
  }

  function renderVideoList(videoList, selectedIndex, tabId) {
    const el = $("videoList");
    if (!el) return;

    el.innerHTML = "";
    videoList.forEach((v) => {
      const item = document.createElement("div");
      item.className = "video-item" + (v.index === selectedIndex ? " selected" : "");
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.dataset.videoIndex = v.index;

      const idxSpan = document.createElement("span");
      idxSpan.className = "vi-index";
      idxSpan.textContent = v.index + 1;

      const infoSpan = document.createElement("span");
      infoSpan.style.flex = "1";
      infoSpan.style.minWidth = "0";

      if (v.width && v.height) {
        const sizeSpan = document.createElement("span");
        sizeSpan.className = "vi-size";
        sizeSpan.textContent = `${v.width}×${v.height}`;
        infoSpan.appendChild(sizeSpan);
      }

      const durSpan = document.createElement("span");
      durSpan.className = "vi-dur";
      durSpan.textContent = v.duration ? fmtSec(v.duration) : "—";

      item.appendChild(idxSpan);
      item.appendChild(infoSpan);
      item.appendChild(durSpan);

      const select = async () => {
        try {
          await chrome.tabs.sendMessage(tabId, { type: "SELECT_VIDEO", index: v.index });
          el.querySelectorAll(".video-item").forEach((child) => {
            child.classList.toggle("selected", Number(child.dataset.videoIndex) === v.index);
          });
        } catch {}
      };

      item.addEventListener("click", select);
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
      });

      el.appendChild(item);
    });
  }

  // -------------------------------------------------------------------------
  // Video state polling (Now Playing tab)
  // -------------------------------------------------------------------------
  let vsTimer = null;
  let lastVideoListKey = "";

  async function pollVideoState() {
    try {
      const state = await chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_STATE" });
      renderVideoState(state);
    } catch {
      renderVideoState(null);
    }
  }

  pollVideoState();
  vsTimer = setInterval(pollVideoState, 1000);
  window.addEventListener("unload", () => clearInterval(vsTimer));

  // -------------------------------------------------------------------------
  // Stats tab
  // -------------------------------------------------------------------------
  async function loadStats() {
    await Promise.all([loadTodayStats(), loadWeekStats()]);
  }

  async function loadTodayStats() {
    try {
      const [todayData, usageData] = await Promise.all([
        chrome.runtime.sendMessage({ type: "GET_STATS", period: "today" }).catch(() => ({})),
        chrome.runtime.sendMessage({ type: "GET_DAILY_USAGE" }).catch(() => ({ totalSecs: 0, limitSecs: 0 })),
      ]);

      const totalSecs = todayData?._total ?? 0;

      // Total display
      const statTotalEl = $("statTotal");
      if (statTotalEl) statTotalEl.textContent = fmtWatch(totalSecs);

      // Daily limit bar
      const limitWrap = $("limitBarWrap");
      const limitFill = $("limitBarFill");
      const limitLbl  = $("limitLabel");
      const limitSecs = usageData?.limitSecs ?? 0;

      if (limitWrap && limitFill && limitLbl) {
        if (limitSecs > 0) {
          const pct = Math.min(100, (totalSecs / limitSecs) * 100);
          limitFill.style.width = pct + "%";
          limitFill.classList.toggle("over", totalSecs >= limitSecs);
          limitLbl.textContent = `${fmtWatch(totalSecs)} of ${fmtWatch(limitSecs)}`;
          limitWrap.hidden = false;
        } else {
          limitWrap.hidden = true;
        }
      }

      // Per-site breakdown
      const breakdownEl = $("siteBreakdown");
      if (breakdownEl) {
        breakdownEl.innerHTML = "";
        const sites = Object.entries(todayData || {})
          .filter(([k]) => k !== "_total")
          .sort((a, b) => b[1] - a[1]);

        const maxSecs = sites.length > 0 ? sites[0][1] : 1;

        sites.forEach(([site, secs]) => {
          const row = document.createElement("div");
          row.className = "site-row-stat";

          const nameEl = document.createElement("span");
          nameEl.className = "site-name";
          nameEl.textContent = site;
          nameEl.title = site;

          const barWrap = document.createElement("div");
          barWrap.className = "site-bar-wrap";

          const bar = document.createElement("div");
          bar.className = "site-bar";
          bar.style.width = Math.max(2, (secs / maxSecs) * 100) + "%";
          barWrap.appendChild(bar);

          const timeEl = document.createElement("span");
          timeEl.className = "site-time";
          timeEl.textContent = fmtWatch(secs);

          row.appendChild(nameEl);
          row.appendChild(barWrap);
          row.appendChild(timeEl);
          breakdownEl.appendChild(row);
        });

        if (sites.length === 0) {
          const empty = document.createElement("div");
          empty.style.cssText = "font-size:12px;color:var(--fg-dim);padding:4px 0";
          empty.textContent = "No watch time recorded today.";
          breakdownEl.appendChild(empty);
        }
      }
    } catch (err) {
      console.error("[popup] loadTodayStats error", err);
    }
  }

  async function loadWeekStats() {
    try {
      const weekData = await chrome.runtime.sendMessage({ type: "GET_STATS", period: "week" }).catch(() => ({}));
      const chartEl = $("weekChart");
      if (!chartEl) return;
      chartEl.innerHTML = "";

      // Build last 7 days (Mon first if the week aligns, otherwise just last 7 in order)
      const days = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
        const dayLabel = d.toLocaleDateString(undefined, { weekday: "short" });
        const total = weekData?.[iso]?._total ?? 0;
        days.push({ iso, dayLabel, total });
      }

      const maxSecs = Math.max(1, ...days.map((d) => d.total));

      days.forEach((d) => {
        const row = document.createElement("div");
        row.className = "week-row";

        const dayLbl = document.createElement("span");
        dayLbl.className = "week-day";
        dayLbl.textContent = d.dayLabel;

        const barWrap = document.createElement("div");
        barWrap.className = "week-bar-wrap";

        const bar = document.createElement("div");
        bar.className = "week-bar";
        bar.style.width = d.total > 0 ? Math.max(2, (d.total / maxSecs) * 100) + "%" : "0%";
        barWrap.appendChild(bar);

        const timeLbl = document.createElement("span");
        timeLbl.className = "week-time";
        timeLbl.textContent = d.total > 0 ? fmtWatch(d.total) : "—";

        row.appendChild(dayLbl);
        row.appendChild(barWrap);
        row.appendChild(timeLbl);
        chartEl.appendChild(row);
      });
    } catch (err) {
      console.error("[popup] loadWeekStats error", err);
    }
  }

  // Clear stats button
  const clearStatsBtn = $("clearStats");
  if (clearStatsBtn) {
    clearStatsBtn.addEventListener("click", async () => {
      if (!confirm("Clear all watch time statistics? This cannot be undone.")) return;
      try {
        await chrome.runtime.sendMessage({ type: "CLEAR_STATS" });
        await loadStats();
      } catch {}
    });
  }

  // -------------------------------------------------------------------------
  // Init: run all initialization in parallel
  // -------------------------------------------------------------------------
  await Promise.all([
    // Enable button
    (async () => {
      setEnableButtonUI(false);
      const q = await queryTabEnable(tab.id);
      setEnableButtonUI(q.enabledForLabel);
    })(),
    // Hide-when-inactive
    loadHideInactiveFromTab(tab.id),
    // Finished-for-site
    loadFinishedForSite(),
    // Mute label
    initMuteLabel(tab.id),
    // Overlay checkbox
    loadOverlayState(),
    // Keep playing
    loadKeepPlayingState(),
  ]);

  // Refresh mute label slightly after load (media may not be settled immediately)
  setTimeout(() => initMuteLabel(tab.id), 700);

})();
