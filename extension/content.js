/**
 * KoalaSync Content Script
 * Injected into video tabs to control playback and detect events.
 */

(function() {
    // Injection Guard: Check if already injected AND context is valid
    try {
        if (window.koalaSyncInjected && chrome.runtime.id) {
            return;
        }
    } catch (_e) {
        // Context invalidated, proceed with re-injection
    }
    window.koalaSyncInjected = true;

    // --- SHARED_EVENTS_INJECT_START ---
    // This block is automatically updated by /scripts/build-extension.js
    const EVENTS = {
        PLAY: "play",
        PAUSE: "pause",
        SEEK: "seek",
        FORCE_SYNC_PREPARE: "force_sync_prepare",
        FORCE_SYNC_ACK: "force_sync_ack",
        FORCE_SYNC_EXECUTE: "force_sync_execute",
        PEER_STATUS: "peer_status",
        EPISODE_LOBBY: "episode_lobby",
        EPISODE_READY: "episode_ready"
    };
    // --- SHARED_EVENTS_INJECT_END ---

    // Suppresses native event reporting after a programmatic action.
    // Each entry is a per-type timer (key = 'playing'|'paused'|'seek').
    // While a timer exists, matching native events are consumed and not relayed.
    // Timers self-clean after 300ms if the native event never fires.
    let _suppressTimers = {};

    function _setSuppress(state) {
        if (_suppressTimers[state]) clearTimeout(_suppressTimers[state]);
        _suppressTimers[state] = setTimeout(() => {
            delete _suppressTimers[state];
        }, 300);
    }

    function _clearSuppress(state) {
        if (_suppressTimers[state]) {
            clearTimeout(_suppressTimers[state]);
            delete _suppressTimers[state];
        }
    }

    // --- Seek Relay Filtering ---
    // Minimum seek delta (seconds) to report. Prevents HLS/DASH buffering micro-seeks
    // from being relayed to peers as user-initiated seeks.
    const MIN_SEEK_DELTA = 2.0;
    let lastReportedSeekTime = null;  // last currentTime we relayed as a SEEK
    let seekDebounceTimer = null;     // debounce timer for rapid seek events

    // --- Episode Auto-Sync State ---
    let lastKnownMediaTitle = null;
    let episodeTransitionDebounce = null;
    let _pendingLobbyTitle = null; // Title we're waiting to match (from remote lobby)
    let lobbyPollTimer = null;
    let _autoSyncEnabled = true; // Cached setting, updated via storage.onChanged
    let _audioSettings = null;
    let _audioProcessingAllowed = true;

    // Cache the autoSyncNextEpisode setting
    chrome.storage.sync.get(['autoSyncNextEpisode', 'audioSettings'], (data) => {
        _autoSyncEnabled = data.autoSyncNextEpisode !== false; // default: enabled
        _audioSettings = mergeAudioSettings(data.audioSettings);
        const video = findVideo();
        if (video && _audioProcessingAllowed) applyAudioSettings(video, _audioSettings);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.autoSyncNextEpisode) {
            _autoSyncEnabled = changes.autoSyncNextEpisode.newValue !== false;
        }
    });

    function reportLog(message, level = 'info') {
        chrome.runtime.sendMessage({ type: 'LOG', message, level }).catch(() => {});
    }

    // --- Helper: find the best video element on the page ---
    // Prefers larger, visible videos over tiny preview/trailer elements.
    function findVideo(root = document) {
        const candidates = Array.from(root.querySelectorAll('video'));

        // Scan likely media hosts even when light-DOM videos exist; many players
        // expose a tiny preview/ad video outside Shadow DOM and the real player inside.
        const potentialHosts = root.querySelectorAll('[id*="player" i], [class*="player" i], [id*="video" i], [class*="video" i], [id*="media" i], [class*="media" i], [id*="stream" i], [class*="stream" i], ytd-player, netflix-player, emby-player, jellyfin-player, video-player');
        for (const el of potentialHosts) {
            if (el.shadowRoot) {
                const found = findVideo(el.shadowRoot);
                if (found) candidates.push(found);
            }
        }

        if (candidates.length === 0) return null;

        // Multiple videos found → pick the best one
        if (candidates.length === 1) return candidates[0];

        let best = null;
        let bestScore = -1;
        for (const v of candidates) {
            if (v.tagName !== 'VIDEO') continue;
            // Score: visible area + bonus for unmuted + bonus for longer duration
            const area = (v.videoWidth || v.offsetWidth || 0) * (v.videoHeight || v.offsetHeight || 0);
            const unmutedBonus = v.muted ? 0 : 100000;
            const durationBonus = (v.duration && isFinite(v.duration) ? v.duration : 0) * 100;
            const score = area + unmutedBonus + durationBonus;
            if (score > bestScore) {
                bestScore = score;
                best = v;
            }
        }
        return best;
    }

    // --- Audio Processing Module ---
    const AUDIO_PRESETS = {
        recommended: { threshold: -24, ratio: 8, attack: 0.010, release: 0.300, knee: 15 },
        dynamicRange: { threshold: -18, ratio: 4, attack: 0.020, release: 0.200, knee: 10 },
        vocalEnhancement: { threshold: -12, ratio: 3, attack: 0.015, release: 0.150, knee: 5 },
        smooth: { threshold: -30, ratio: 1.5, attack: 0.030, release: 0.250, knee: 20 },
        custom: { threshold: -24, ratio: 12, attack: 0.003, release: 0.250, knee: 30 }
    };
    const DEFAULT_AUDIO_SETTINGS = {
        enabled: false,
        compressor: {
            enabled: false,
            preset: 'recommended',
            customParams: { ...AUDIO_PRESETS.custom }
        }
    };
    let audioCtx = null;
    let audioChains = new WeakMap();
    let currentAudioVideo = null;

    function mergeAudioSettings(settings = {}) {
        const safeSettings = settings && typeof settings === 'object' ? settings : {};
        return {
            ...DEFAULT_AUDIO_SETTINGS,
            ...safeSettings,
            compressor: {
                ...DEFAULT_AUDIO_SETTINGS.compressor,
                ...(safeSettings.compressor || {}),
                customParams: {
                    ...DEFAULT_AUDIO_SETTINGS.compressor.customParams,
                    ...(safeSettings.compressor?.customParams || {})
                }
            }
        };
    }

    function initAudioContext() {
        if (!audioCtx) {
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                if (!AudioContextClass) return null;
                audioCtx = new AudioContextClass({ latencyHint: 'interactive' });
            } catch (e) {
                reportLog(`Audio Processing unavailable: ${e.message}`, 'warn');
                return null;
            }
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }

    function closeAudioContext() {
        if (audioCtx) {
            audioCtx.close().catch(() => {});
            audioCtx = null;
        }
        audioChains = new WeakMap();
        currentAudioVideo = null;
    }

    function setupAudioChain(videoEl) {
        if (audioChains.has(videoEl)) return audioChains.get(videoEl);
        const ctx = initAudioContext();
        if (!ctx) return null;

        try {
            const src = ctx.createMediaElementSource(videoEl);
            const compressor = ctx.createDynamicsCompressor();
            const dryGain = ctx.createGain();
            const compGain = ctx.createGain();

            src.connect(dryGain);
            dryGain.connect(ctx.destination);
            src.connect(compressor);
            compressor.connect(compGain);
            compGain.connect(ctx.destination);

            dryGain.gain.value = 1;
            compGain.gain.value = 0;

            const chain = { compressor, dryGain, compGain, active: false };
            audioChains.set(videoEl, chain);
            currentAudioVideo = videoEl;
            return chain;
        } catch (e) {
            reportLog(`Audio Processing setup failed: ${e.message}`, 'warn');
            return null;
        }
    }

    function rampGain(node, value, t) {
        const current = node.gain.value;
        node.gain.cancelScheduledValues(t);
        node.gain.setValueAtTime(current, t);
        node.gain.linearRampToValueAtTime(value, t + 0.04);
    }

    function applyAudioBypass(videoEl) {
        const chain = audioChains.get(videoEl);
        if (!chain || !chain.active) return;
        const t = chain.dryGain.context.currentTime;
        rampGain(chain.dryGain, 1, t);
        rampGain(chain.compGain, 0, t);
        chain.active = false;
    }

    function bypassCurrentAudioProcessing() {
        if (currentAudioVideo) applyAudioBypass(currentAudioVideo);
    }

    function applyAudioSettings(videoEl, settings) {
        const mergedSettings = mergeAudioSettings(settings);
        if (!mergedSettings.enabled || !mergedSettings.compressor?.enabled) {
            applyAudioBypass(videoEl);
            return;
        }

        const chain = setupAudioChain(videoEl);
        if (!chain) return;

        const cSettings = mergedSettings.compressor;
        const params = cSettings.preset === 'custom'
            ? cSettings.customParams
            : AUDIO_PRESETS[cSettings.preset] || AUDIO_PRESETS.recommended;

        chain.compressor.threshold.value = params.threshold ?? -24;
        chain.compressor.knee.value = params.knee ?? 15;
        chain.compressor.ratio.value = params.ratio ?? 8;
        chain.compressor.attack.value = params.attack ?? 0.010;
        chain.compressor.release.value = params.release ?? 0.300;

        if (!chain.active) {
            const t = chain.dryGain.context.currentTime;
            rampGain(chain.dryGain, 0, t);
            rampGain(chain.compGain, 1, t);
            chain.active = true;
        }
    }

    // --- Episode Auto-Sync: Detection ---
    function getMediaTitle() {
        return (navigator.mediaSession && navigator.mediaSession.metadata)
            ? navigator.mediaSession.metadata.title
            : null;
    }

    // Extract a canonical episode identifier from a title string.
    // Handles: S01E01, S1E1, S01 - E01, Season 1 Episode 1, "Folge 5", "Episode 5", "Ep. 5", "#5"
    // Returns null if no episode pattern found.
    function extractEpisodeId(title) {
        if (!title || typeof title !== 'string') return null;
        // S01E01 patterns (with any non-alphanumeric separator between season and E)
        const se = title.match(/S(?:eason\s*)?(\d+)[^a-zA-Z0-9]*E(?:pisode\s*)?(\d+)/i);
        if (se) return `S${String(se[1]).padStart(2, '0')}E${String(se[2]).padStart(2, '0')}`;
        // "Episode X", "Folge X", "Ep. X", "#X"
        const ep = title.match(/(?:Episode|Folge|Ep\.?|#)\s*(\d+)/i);
        if (ep) return `EP${String(ep[1]).padStart(3, '0')}`;
        return null;
    }

    // Returns true if two titles likely refer to the same episode.
    // Strict: both must have IDs and match, OR neither has IDs and exact match.
    function sameEpisode(titleA, titleB) {
        if (!titleA && !titleB) return true; // Both unknown → assume same (backward compat)
        if (!titleA || !titleB) return false; // One unknown, one known → different
        const idA = extractEpisodeId(titleA);
        const idB = extractEpisodeId(titleB);
        if (idA && idB) return idA === idB; // Both have parseable IDs → compare IDs
        if (idA || idB) return false;       // One has ID, other doesn't → different
        return titleA === titleB;            // Neither has ID → exact string match
    }

    // Returns true only when we are CERTAIN the episodes differ.
    // Permissive: only blocks if BOTH titles have parseable IDs AND they differ.
    // Films, music, unparseable titles always pass through.
    function isDifferentEpisode(titleA, titleB) {
        if (!titleA || !titleB) return false; // Unknown → allow
        const idA = extractEpisodeId(titleA);
        const idB = extractEpisodeId(titleB);
        if (!idA || !idB) return false; // At least one unparseable → allow
        return idA !== idB;             // Both parseable → only block if different
    }

    function checkEpisodeTransition() {
        const currentTitle = getMediaTitle();
        const video = findVideo();

        // Only trigger if: we had a previous title, the title changed,
        // a video exists, and we're near the start of new content.
        if (lastKnownMediaTitle && currentTitle
            && !sameEpisode(currentTitle, lastKnownMediaTitle)
            && video
            && video.currentTime < 5
            && video.readyState >= 1) {
            onEpisodeTransition(currentTitle);
        }

        // Always track the latest known title
        if (currentTitle) lastKnownMediaTitle = currentTitle;
    }

    function onEpisodeTransition(newTitle) {
        // Debounce: prevent duplicate fires from multiple signals
        if (episodeTransitionDebounce) return;
        episodeTransitionDebounce = setTimeout(() => {
            episodeTransitionDebounce = null;
        }, 2000);

        reportLog(`Episode transition detected: "${newTitle}"`, 'info');

        // Do NOT pause here. We notify background.js first.
        // Background checks the setting; if enabled it creates a lobby
        // and sends back PAUSE_FOR_LOBBY so we only freeze if the feature is on.
        chrome.runtime.sendMessage({
            type: 'EPISODE_CHANGED',
            payload: { newTitle }
        }).catch(() => {});
    }

    function checkAndReportLobbyReady(expectedTitle) {
        const video = findVideo();
        const currentTitle = getMediaTitle();

        if (video && currentTitle && sameEpisode(currentTitle, expectedTitle)
            && video.currentTime < 5 && video.readyState >= 1) {
            // Match! Pause at start and report ready.
            if (!video.paused) {
                _setSuppress('paused');
                video.pause();
            }
            stopLobbyPoll();
            chrome.runtime.sendMessage({
                type: 'EPISODE_READY_LOCAL',
                payload: { title: currentTitle }
            }).catch(() => {});
            reportLog(`Episode lobby: Ready for "${currentTitle}"`, 'success');
            return true;
        }
        return false;
    }

    function startLobbyPoll(expectedTitle) {
        stopLobbyPoll();
        _pendingLobbyTitle = expectedTitle;

        // NOTE: Do NOT pause here. Three callers reach this function:
        // 1. PAUSE_FOR_LOBBY (initiator): already paused by that handler before calling us.
        // 2. EPISODE_LOBBY (non-initiator): peer may still be on the PREVIOUS episode — pausing
        //    would freeze them mid-episode. The pause happens inside checkAndReportLobbyReady()
        //    only once their title actually matches.
        // 3. CONTENT_BOOT recovery: same reasoning as (2).

        // Check immediately
        if (checkAndReportLobbyReady(expectedTitle)) return;

        // Poll every 2 seconds — no log spam, internal only
        lobbyPollTimer = setInterval(() => {
            checkAndReportLobbyReady(expectedTitle);
        }, 2000);
    }


    function stopLobbyPoll() {
        _pendingLobbyTitle = null;
        if (lobbyPollTimer) {
            clearInterval(lobbyPollTimer);
            lobbyPollTimer = null;
        }
    }

    // --- Helper: YouTube/Twitch specific actions ---
    function tryMediaAction(action, data) {
        const video = findVideo();
        if (!video) return;

        if (action === EVENTS.SEEK) {
            const target = data ? (data.targetTime !== undefined ? data.targetTime : data.currentTime) : undefined;
            if (!Number.isFinite(target)) {
                reportLog(`Media Action Error: Invalid seek payload - ${JSON.stringify(data)}`, 'error');
                return;
            }
            data = { ...data, targetTime: target };
        }

        try {
            const host = window.location.hostname.toLowerCase();
            const isYouTube = host === 'youtube.com' || host.endsWith('.youtube.com');
            const isTwitch  = host === 'twitch.tv' || host.endsWith('.twitch.tv');

            if (isYouTube) {
                const ytButton = document.querySelector('.ytp-play-button');
                if (ytButton) {
                    const isCurrentlyPlaying = !video.paused;
                    if ((action === EVENTS.PLAY && !isCurrentlyPlaying) || (action === EVENTS.PAUSE && isCurrentlyPlaying)) {
                        _setSuppress(action === EVENTS.PLAY ? 'playing' : 'paused');
                        ytButton.click();
                    }
                    if (action === EVENTS.SEEK) {
                        _setSuppress('seek');
                        video.currentTime = data.targetTime;
                    }
                    return;
                }
            }

            if (isTwitch) {
                const twitchButton = document.querySelector('[data-a-target="player-play-pause-button"]');
                if (twitchButton) {
                    const isCurrentlyPlaying = !video.paused;
                    if ((action === EVENTS.PLAY && !isCurrentlyPlaying) || (action === EVENTS.PAUSE && isCurrentlyPlaying)) {
                        _setSuppress(action === EVENTS.PLAY ? 'playing' : 'paused');
                        twitchButton.click();
                    }
                    if (action === EVENTS.SEEK) {
                        _setSuppress('seek');
                        video.currentTime = data.targetTime;
                    }
                    return;
                }
            }

            // Fallback for native HTML5
            if (action === EVENTS.PLAY) {
                _setSuppress('playing');
                video.play().catch((e) => {
                    reportLog(`Playback prevented: ${e.message}`, 'warn');
                    _clearSuppress('playing');
                });
            } else if (action === EVENTS.PAUSE) {
                _setSuppress('paused');
                video.pause();
            } else if (action === EVENTS.SEEK) {
                _setSuppress('seek');
                video.currentTime = data.targetTime;
            }
    } catch (e) {
            reportLog(`Media Action Error: ${e.message}`, 'error');
        }
    }

    // --- Helper: Wait until video is ready for playback (buffered & seeked) ---
    function pollSeekReady(targetTime, timeoutMs = 8000) {
        return new Promise((resolve) => {
            const interval = 150;
            let elapsed = 0;
            const timer = setInterval(() => {
                const video = findVideo(); // Re-query DOM on every iteration
                if (!video) {
                    clearInterval(timer);
                    resolve(false);
                    return;
                }

                elapsed += interval;
                const timeDiff = Math.abs(video.currentTime - targetTime);
                const ready = video.readyState >= 3 && timeDiff < 2.0;
                if (ready) {
                    clearInterval(timer);
                    resolve(true);
                } else if (elapsed >= timeoutMs) {
                    clearInterval(timer);
                    resolve(false);
                }
            }, interval);
        });
    }

    // Listen for commands from background.js
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message) return;
        if (message.action === 'get_current_time') {
            const video = findVideo();
            sendResponse({ currentTime: video ? video.currentTime : null });
            return true;
        }

        if (message.action === 'APPLY_AUDIO_SETTINGS') {
            _audioProcessingAllowed = true;
            _audioSettings = mergeAudioSettings(message.settings);
            const video = findVideo();
            if (video) applyAudioSettings(video, _audioSettings);
            sendResponse({ ok: true });
            return true;
        }

        if (message.action === 'RESET_AUDIO_PROCESSING') {
            _audioProcessingAllowed = false;
            bypassCurrentAudioProcessing();
            sendResponse({ ok: true });
            return true;
        }

        if (message.type === 'SERVER_COMMAND') {
            const { action, payload } = message;
            let actionCompleted = false;

            // Guard: Don't execute sync commands if peers are on different episodes.
            // Only active when autoSyncNextEpisode setting is enabled (default: on).
            // Only blocks when BOTH sides have parseable S01E01-style IDs that differ.
            // Films and unparseable titles always pass through.
            const syncActions = [EVENTS.PLAY, EVENTS.PAUSE, EVENTS.SEEK,
                                 EVENTS.FORCE_SYNC_PREPARE, EVENTS.FORCE_SYNC_EXECUTE];
            if (_autoSyncEnabled && syncActions.includes(action)) {
                const senderTitle = payload?.mediaTitle;
                const myTitle = getMediaTitle();
                if (isDifferentEpisode(senderTitle, myTitle)) {
                    reportLog(`Episode mismatch: sender="${senderTitle || '?'}" vs mine="${myTitle || '?'}" — skipping ${action}. Disable "Auto-Sync next Episode" in settings if this causes issues.`, 'warn');
                    if (action !== EVENTS.FORCE_SYNC_PREPARE && action !== EVENTS.FORCE_SYNC_EXECUTE) {
                        chrome.runtime.sendMessage({ type: 'CMD_ACK', actionTimestamp: message.actionTimestamp, commandSenderId: message.commandSenderId }).catch(() => {});
                    }
                    return;
                }
            }
            
            if (action === EVENTS.PLAY) {
                tryMediaAction(EVENTS.PLAY);
                chrome.runtime.sendMessage({ type: 'CMD_ACK', actionTimestamp: message.actionTimestamp, commandSenderId: message.commandSenderId });
                actionCompleted = true;
            } else if (action === EVENTS.PAUSE) {
                tryMediaAction(EVENTS.PAUSE);
                chrome.runtime.sendMessage({ type: 'CMD_ACK', actionTimestamp: message.actionTimestamp, commandSenderId: message.commandSenderId });
                actionCompleted = true;
            } else if (action === EVENTS.SEEK) {
                tryMediaAction(EVENTS.SEEK, payload);
                chrome.runtime.sendMessage({ type: 'CMD_ACK', actionTimestamp: message.actionTimestamp, commandSenderId: message.commandSenderId });
                actionCompleted = true;
            } else if (action === EVENTS.FORCE_SYNC_PREPARE) {
                if (!payload || payload.targetTime === undefined) return;
                const video = findVideo();
                if (video) {
                    if (!Number.isFinite(payload.targetTime)) {
                        reportLog(`Media Action Error: Invalid force sync payload - ${JSON.stringify(payload)}`, 'error');
                        return;
                    }
                    _setSuppress('paused');
                    _setSuppress('seek');
                    video.pause();
                    try {
                        video.currentTime = payload.targetTime;
                    } catch (e) {
                        reportLog(`Force Sync Seek Error: ${e.message}`, 'error');
                    }
                    pollSeekReady(payload.targetTime).then((ready) => {
                        chrome.runtime.sendMessage({ type: 'FORCE_SYNC_ACK' }).catch(() => {});
                        if (ready) {
                            scheduleProactiveHeartbeat();
                        } else {
                            reportLog('Force Sync: Seek ready timeout, proceeding anyway', 'warn');
                        }
                    }).catch(() => {});
                }
            } else if (action === EVENTS.FORCE_SYNC_EXECUTE) {
                stopLobbyPoll();
                tryMediaAction(EVENTS.PLAY);
                chrome.runtime.sendMessage({ type: 'CMD_ACK', actionTimestamp: message.actionTimestamp, commandSenderId: message.commandSenderId });
                actionCompleted = true;
            }

            if (actionCompleted) {
                scheduleProactiveHeartbeat();
            }
        }

        // Episode Auto-Sync: Lobby notification from background
        if (message.type === 'EPISODE_LOBBY') {
            const expectedTitle = message.expectedTitle;
            if (expectedTitle) {
                reportLog(`Episode lobby received: waiting for "${expectedTitle}"`, 'info');
                startLobbyPoll(expectedTitle);
            }
            sendResponse({ status: 'ok' });
            return true;
        }

        // Episode Auto-Sync: Lobby cancelled by background
        if (message.type === 'EPISODE_LOBBY_CANCEL') {
            stopLobbyPoll();
            sendResponse({ status: 'ok' });
            return true;
        }

        // Episode Auto-Sync: Background confirmed lobby created, pause the video
        if (message.type === 'PAUSE_FOR_LOBBY') {
            const video = findVideo();
            if (video && !video.paused) {
                _setSuppress('paused');
                video.pause();
            }
            // Start lobby poll now that we know the feature is enabled
            if (message.expectedTitle) {
                startLobbyPoll(message.expectedTitle);
            }
            sendResponse({ status: 'ok' });
            return true;
        }

        if (message.type === 'GET_VIDEO_STATE') {
            const video = findVideo();

            const platform = (() => {
                const h = window.location.hostname.toLowerCase();
                if (h === 'youtube.com' || h.endsWith('.youtube.com')) return 'YouTube';
                if (h === 'twitch.tv' || h.endsWith('.twitch.tv')) return 'Twitch';
                if (h === 'netflix.com' || h.endsWith('.netflix.com')) return 'Netflix';
                if (h === 'primevideo.com' || h.endsWith('.primevideo.com') || /(^|\.)amazon\.(com\.[a-z]{2}|co\.[a-z]{2}|[a-z]{2,})$/.test(h)) return 'Prime Video';
                if (h === 'disneyplus.com' || h.endsWith('.disneyplus.com')) return 'Disney+';
                if (h === 'hulu.com' || h.endsWith('.hulu.com')) return 'Hulu';
                if (h === 'hbomax.com' || h.endsWith('.hbomax.com') || h === 'max.com' || h.endsWith('.max.com')) return 'Max/HBO';
                if (h === 'vimeo.com' || h.endsWith('.vimeo.com')) return 'Vimeo';
                if (h === 'dailymotion.com' || h.endsWith('.dailymotion.com')) return 'Dailymotion';
                return 'Generic';
            })();

            const networkStates = ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE'];
            const readyStates = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'];

            const videoCount = document.querySelectorAll('video').length;
            const inShadowDom = (() => {
                let el = video;
                while (el) {
                    if (el.toString() === '[object ShadowRoot]') return true;
                    el = el.parentNode;
                }
                // Also check if any potential host has shadow root (even if no video found)
                if (!video) {
                    const hosts = document.querySelectorAll('[id*="player" i], [class*="player" i], [id*="video" i], [class*="video" i]');
                    for (const host of hosts) {
                        if (host.shadowRoot) return true;
                    }
                }
                return false;
            })();

            // Build multi-video summary for debug reports
            const allVideos = [];
            const allVideoEls = document.querySelectorAll('video');
            for (let i = 0; i < allVideoEls.length; i++) {
                const v = allVideoEls[i];
                allVideos.push({
                    index: i,
                    width: v.videoWidth || v.offsetWidth || 0,
                    height: v.videoHeight || v.offsetHeight || 0,
                    muted: v.muted,
                    paused: v.paused,
                    duration: (v.duration && isFinite(v.duration)) ? Math.round(v.duration) : 0,
                    readyState: v.readyState,
                    src: (v.currentSrc || v.src || '').substring(0, 80),
                    selected: v === video
                });
            }

            if (video) {
                const dataAttributes = {};
                if (video.attributes) {
                    for (const attr of video.attributes) {
                        if (attr.name.startsWith('data-')) {
                            dataAttributes[attr.name] = attr.value;
                        }
                    }
                }

                const metadata = (navigator.mediaSession && navigator.mediaSession.metadata) ? {
                    title: navigator.mediaSession.metadata.title,
                    artist: navigator.mediaSession.metadata.artist,
                    album: navigator.mediaSession.metadata.album,
                    artwork: Array.from(navigator.mediaSession.metadata.artwork || []).map(a => a.src)
                } : null;

                const errorInfo = video.error ? {
                    code: video.error.code,
                    message: video.error.message
                } : null;

                sendResponse({
                    found: true,
                    paused: video.paused,
                    currentTime: video.currentTime,
                    duration: video.duration || 0,
                    readyState: video.readyState,
                    readyStateLabel: readyStates[video.readyState] || 'UNKNOWN',
                    networkState: video.networkState,
                    networkStateLabel: networkStates[video.networkState] || 'UNKNOWN',
                    muted: video.muted,
                    volume: video.volume,
                    playbackRate: video.playbackRate,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    seeking: video.seeking,
                    ended: video.ended,
                    error: errorInfo,
                    buffered: video.buffered && video.buffered.length > 0
                        ? Array.from({ length: video.buffered.length }, (_, i) =>
                            `${video.buffered.start(i).toFixed(1)}-${video.buffered.end(i).toFixed(1)}s`).join(', ')
                        : 'none',
                    loop: video.loop,
                    url: window.location.href,
                    pageTitle: document.title,
                    id: video.id || 'none',
                    className: video.className || 'none',
                    src: video.src || 'none',
                    currentSrc: video.currentSrc || 'none',
                    dataAttributes,
                    metadata,
                    videoCount,
                    inShadowDom,
                    platform,
                    allVideos
                });
            } else {
                sendResponse({
                    found: false,
                    videoCount,
                    inShadowDom,
                    platform,
                    allVideos,
                    url: window.location.href,
                    pageTitle: document.title,
                    metadata: (navigator.mediaSession && navigator.mediaSession.metadata) ? {
                        title: navigator.mediaSession.metadata.title,
                        artist: navigator.mediaSession.metadata.artist,
                        album: navigator.mediaSession.metadata.album
                    } : null
                });
            }
        }
    });

    // Detect native events
    function reportEvent(action) {
        if (seekDebounceTimer && (action === EVENTS.PLAY || action === EVENTS.PAUSE)) {
            clearTimeout(seekDebounceTimer);
            seekDebounceTimer = null;
            const v = findVideo();
            if (v && Number.isFinite(v.currentTime)) {
                lastReportedSeekTime = v.currentTime;
                reportLog(`[Seek] Debounce flushed immediately due to ${action.toUpperCase()}`, 'info');
                reportEvent(EVENTS.SEEK);
            }
        }

        const video = findVideo();
        if (!video) return;

        const current = video.currentTime;
        if (!Number.isFinite(current)) return;

        const mediaTitle = (navigator.mediaSession && navigator.mediaSession.metadata) ? navigator.mediaSession.metadata.title : null;

        const eventState = action === EVENTS.PLAY ? 'playing' : (action === EVENTS.PAUSE ? 'paused' : (action === EVENTS.SEEK ? 'seek' : null));
        
        if (_suppressTimers[eventState]) {
            _clearSuppress(eventState);
            return;
        }

        // Suppress only SEEK during visibility grace period (tab re-focus ghost jump).
        // Play/Pause pass through — user may want to immediately pause after tabbing back.
        if (Date.now() < visibilityGraceUntil && action === EVENTS.SEEK) return;
        
        chrome.runtime.sendMessage({
            type: 'CONTENT_EVENT',
            action,
            payload: {
                currentTime: current,
                targetTime: current,
                mediaTitle: mediaTitle,
                timestamp: Date.now()
            }
        }).catch(() => {});

        // Trigger proactive heartbeat to push stabilized state
        scheduleProactiveHeartbeat();
    }

    // --- Tab Visibility Handling ---
    // Browsers (especially Firefox) aggressively throttle background tabs.
    // When the user returns to a video tab, the video element may have lost
    // time-sync and fires spurious seek events as it recovers (jumping back).
    // We suppress only SEEK for a short grace period after tab re-focus.
    // Play/Pause are NOT suppressed — the user may legitimately want to
    // pause immediately after switching back.
    let pageVisible = !document.hidden;
    let visibilityGraceUntil = 0;
    const VISIBILITY_GRACE_MS = 300;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pageVisible = false;
        } else if (!pageVisible) {
            pageVisible = true;
            visibilityGraceUntil = Date.now() + VISIBILITY_GRACE_MS;
            reportLog(`Tab re-focused — suppressing seeks for ${VISIBILITY_GRACE_MS / 1000}s to prevent ghost relay`, 'warn');
        }
    });

    // Reset on page hide/show (bfcache, tab discard)
    window.addEventListener('pagehide', () => {
        pageVisible = false;
        closeAudioContext();
    });
    window.addEventListener('pageshow', (event) => {
        // event.persisted is true ONLY when restored from bfcache, not on initial load
        if (event.persisted && !pageVisible) {
            pageVisible = true;
            visibilityGraceUntil = Date.now() + VISIBILITY_GRACE_MS;
            reportLog(`Page restored from cache — suppressing seeks for ${VISIBILITY_GRACE_MS / 1000}s`, 'warn');
        }
    });

    const handlePlay = () => reportEvent(EVENTS.PLAY);
    const handlePause = () => reportEvent(EVENTS.PAUSE);

    // Seek filtering: ignore HLS/DASH buffering micro-seeks.
    // Only relay if delta >= MIN_SEEK_DELTA AND not already debouncing.
    const handleSeeked = () => {
        const video = findVideo();
        if (!video) return;
        const current = video.currentTime;
        if (!Number.isFinite(current)) return;

        // Step 1: Check _suppressTimers (programmatic seek from remote peer)
        if (_suppressTimers['seek']) {
            _clearSuppress('seek');
            lastReportedSeekTime = current;
            return;
        }

        // Step 2: Suppress during visibility grace period (tab re-focus ghost events)
        if (Date.now() < visibilityGraceUntil) return;

        const delta = lastReportedSeekTime !== null ? Math.abs(current - lastReportedSeekTime) : null;
        const deltaStr = delta !== null ? `Δ${delta.toFixed(2)}s` : 'Δ?';

        // Step 3: Delta check — skip micro-seeks (buffering, chapter markers, etc.)
        if (lastReportedSeekTime !== null && delta < MIN_SEEK_DELTA) {
            reportLog(`[Seek] Filtered (${deltaStr} < ${MIN_SEEK_DELTA}s threshold) @ ${current.toFixed(2)}s — not relayed`, 'warn');
            return;
        }

        // Step 4: Debounce rapid consecutive seeks (e.g. scrubbing)
        // — wait 300ms for the user to settle before relaying
        if (seekDebounceTimer) clearTimeout(seekDebounceTimer);
        seekDebounceTimer = setTimeout(() => {
            seekDebounceTimer = null;
            const v = findVideo();
            if (!v) return;
            const settled = v.currentTime;
            const finalDelta = lastReportedSeekTime !== null ? Math.abs(settled - lastReportedSeekTime) : null;
            const finalDeltaStr = finalDelta !== null ? `Δ${finalDelta.toFixed(2)}s` : 'Δ?';
            lastReportedSeekTime = settled;
            reportLog(`[Seek] Relayed @ ${settled.toFixed(2)}s (${finalDeltaStr})`, 'info');
            reportEvent(EVENTS.SEEK);
        }, 300);
    };


    let lastVideoSrc = undefined;

    // Episode detection handler for loadeddata event
    const handleLoadedData = () => {
        checkEpisodeTransition();
    };

    function setupListeners() {
        const video = findVideo();
        if (video) {
            if (currentAudioVideo && currentAudioVideo !== video) {
                bypassCurrentAudioProcessing();
            }
            const existing = video._koalaHandlers;
            if (existing) {
                video.removeEventListener('play', existing.play);
                video.removeEventListener('pause', existing.pause);
                video.removeEventListener('seeked', existing.seeked);
                video.removeEventListener('loadeddata', existing.loadeddata);
            }
            video._koalaHandlers = { play: handlePlay, pause: handlePause, seeked: handleSeeked, loadeddata: handleLoadedData };

            video.addEventListener('play', handlePlay);
            video.addEventListener('pause', handlePause);
            video.addEventListener('seeked', handleSeeked);
            video.addEventListener('loadeddata', handleLoadedData);
            video.dataset.koalaAttached = 'true';
            lastVideoSrc = video.currentSrc || video.src || null;

            if (!lastKnownMediaTitle) {
                lastKnownMediaTitle = getMediaTitle();
            }

            if (_audioSettings && _audioProcessingAllowed) applyAudioSettings(video, _audioSettings);
        }
    }

    // SPA Navigation Handler (MutationObserver)
    let lastMutate = 0;
    let observerTimeout = null;

    function checkVideo() {
        lastMutate = Date.now();
        const video = findVideo();

        if (!video && lastVideoSrc !== undefined) {
            reportLog('Video element removed from page', 'warn');
            lastVideoSrc = undefined;
            closeAudioContext();
            return;
        }

        if (!video) return;

        const currentSrc = video.currentSrc || video.src || null;

        if (!video.dataset.koalaAttached || (lastVideoSrc !== undefined && currentSrc && lastVideoSrc !== currentSrc)) {
            if (lastVideoSrc !== undefined && currentSrc && lastVideoSrc !== currentSrc) {
                checkEpisodeTransition();
            }
            setupListeners();
        }
    }

    const observer = new MutationObserver(() => {
        const now = Date.now();
        if (now - lastMutate >= 1000) {
            checkVideo();
        } else {
            if (observerTimeout) clearTimeout(observerTimeout);
            observerTimeout = setTimeout(checkVideo, 1000 - (now - lastMutate));
        }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // --- SHARED_HEARTBEAT_INJECT_START ---
    const HEARTBEAT_INTERVAL_VAL = 15000;
    // --- SHARED_HEARTBEAT_INJECT_END ---

    // Heartbeat Refactoring (Self-scheduling setTimeout with proactive heartbeat scheduling)
    let heartbeatTimeout = null;
    let proactiveHeartbeatTimeout = null;
    let heartbeatErrorCount = 0;

    function sendHeartbeat() {
        const video = findVideo();
        if (!video) return;

        const mediaTitle = (navigator.mediaSession && navigator.mediaSession.metadata) ? navigator.mediaSession.metadata.title : null;
        chrome.runtime.sendMessage({
            type: 'HEARTBEAT',
            payload: {
                playbackState: video.paused ? 'paused' : 'playing',
                currentTime: video.currentTime,
                mediaTitle: mediaTitle,
                volume: video.volume,
                muted: video.muted
            }
        }).catch(err => {
            if (err.message.includes('Extension context invalidated')) {
                heartbeatErrorCount++;
                if (heartbeatErrorCount === 1) {
                    reportLog('Extension reloaded. Please refresh the page if sync stops working.', 'warn');
                }
                if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
                if (proactiveHeartbeatTimeout) clearTimeout(proactiveHeartbeatTimeout);
                observer.disconnect();
            }
        });
    }

    function schedulePeriodicHeartbeat() {
        if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
        heartbeatTimeout = setTimeout(() => {
            sendHeartbeat();
            schedulePeriodicHeartbeat();
        }, HEARTBEAT_INTERVAL_VAL);
    }

    function scheduleProactiveHeartbeat() {
        if (proactiveHeartbeatTimeout) clearTimeout(proactiveHeartbeatTimeout);
        proactiveHeartbeatTimeout = setTimeout(() => {
            sendHeartbeat();
            schedulePeriodicHeartbeat(); // Reschedules the next periodic check to be exactly 15s from now
        }, 500); // 500ms stabilization delay
    }

    // Initial Setup
    setupListeners();

    // Maintain a persistent keep-alive port connection to prevent background SW suspension
    let keepAlivePort = null;
    function connectKeepAlivePort() {
        try {
            if (chrome.runtime.id) {
                keepAlivePort = chrome.runtime.connect({ name: 'keepAlive' });
                keepAlivePort.onDisconnect.addListener(() => {
                    keepAlivePort = null;
                    setTimeout(connectKeepAlivePort, 1000);
                });
            }
        } catch (_e) {
            // Extension context invalidated or disabled
        }
    }
    connectKeepAlivePort();

    schedulePeriodicHeartbeat();

    // Immediate heartbeat on injection — populate peer data without waiting 15s
    setTimeout(() => sendHeartbeat(), 300);

    // Episode Auto-Sync: Boot recovery — check if background has an active lobby
    chrome.runtime.sendMessage({ type: 'CONTENT_BOOT' }, (res) => {
        if (chrome.runtime.lastError) return;
        if (res && res.lobbyActive && res.expectedTitle) {
            reportLog(`Boot: Active lobby detected for "${res.expectedTitle}"`, 'info');
            startLobbyPoll(res.expectedTitle);
        }
    });

})();
