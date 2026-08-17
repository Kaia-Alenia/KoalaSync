export const MEDIA_FRAME_ACCESS_REQUIRED = 'media_frame_access_required';
const MIN_PLAYER_FRAME_AREA = 320 * 180;
const MIN_PLAYER_ASPECT_RATIO = 1.15;
const MAX_PLAYER_ASPECT_RATIO = 2.6;

function normalizeFrameId(value) {
    return Number.isInteger(value) && value >= 0 ? value : 0;
}

function safeOrigin(value) {
    try {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin : null;
    } catch {
        return null;
    }
}

function originPattern(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        // WebExtension match patterns intentionally omit ports. Chromium treats
        // the host pattern port-independently; Firefox rejects explicit ports.
        return `${url.protocol}//${url.hostname}/*`;
    } catch {
        return null;
    }
}

function isGoogleDrivePlayerUrl(value) {
    try {
        const url = new URL(value);
        if (url.hostname.toLowerCase() !== 'youtube.googleapis.com'
            || (url.pathname !== '/embed' && !url.pathname.startsWith('/embed/'))) {
            return false;
        }
        const parentOrigin = url.searchParams.get('origin') || url.searchParams.get('post_message_origin');
        return parentOrigin === 'https://drive.google.com';
    } catch {
        return false;
    }
}

/**
 * Runs inside every frame through chrome.scripting.executeScript. Keep this
 * function self-contained: extension functions outside its body are not
 * available in the injected isolated world.
 */
export function inspectMediaFrame(expectedVisibilityToken = null) {
    const elementIsVisible = (element, rect) => {
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const view = element.ownerDocument?.defaultView || window;
        const style = view.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
            return false;
        }
        if (typeof element.checkVisibility === 'function'
            && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
            return false;
        }
        const layoutWidth = Math.max(view.innerWidth, element.ownerDocument?.documentElement?.scrollWidth || 0);
        const layoutHeight = Math.max(view.innerHeight, element.ownerDocument?.documentElement?.scrollHeight || 0);
        const scrollX = Number(view.scrollX) || 0;
        const scrollY = Number(view.scrollY) || 0;
        return rect.bottom + scrollY > 0
            && rect.right + scrollX > 0
            && rect.top + scrollY < layoutHeight
            && rect.left + scrollX < layoutWidth;
    };

    const collectVideos = (doc, depth = 0, ancestorVisible = true, videos = [], seen = new Set()) => {
        if (depth >= 4 || typeof doc.querySelectorAll !== 'function') return videos;
        for (const video of doc.querySelectorAll('video')) {
            if (!seen.has(video)) {
                seen.add(video);
                videos.push({ video, ancestorVisible });
            }
        }
        const hosts = doc.querySelectorAll('[id*="player" i], [class*="player" i], [id*="video" i], [class*="video" i], [id*="media" i], [class*="media" i], [id*="stream" i], [class*="stream" i], ytd-player, netflix-player, emby-player, jellyfin-player, video-player');
        for (const host of hosts) {
            if (!host.shadowRoot) continue;
            for (const video of host.shadowRoot.querySelectorAll('video')) {
                if (!seen.has(video)) {
                    seen.add(video);
                    videos.push({ video, ancestorVisible });
                }
            }
        }

        for (const frame of doc.querySelectorAll('iframe, frame')) {
            try {
                const frameRect = frame.getBoundingClientRect();
                const frameVisible = ancestorVisible && elementIsVisible(frame, frameRect);
                const frameDoc = frame.contentDocument;
                if (frameDoc) collectVideos(frameDoc, depth + 1, frameVisible, videos, seen);
            } catch {
                // Cross-origin media is inspected in its own execution result.
            }
        }
        return videos;
    };

    const videoDetails = collectVideos(document).map(({ video, ancestorVisible }) => {
        const rect = video.getBoundingClientRect();
        const rendered = ancestorVisible && elementIsVisible(video, rect);
        const hasSource = !!(video.currentSrc || video.src || video.srcObject
            || video.querySelector?.('source[src]'));
        const background = !!video.loop && !!video.muted && !video.controls;
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
        const shortUncontrolled = !video.controls && duration > 0 && duration < 300;
        const renderedArea = Math.max(0, rect.width) * Math.max(0, rect.height);
        return {
            hasSource,
            rendered,
            background,
            shortUncontrolled,
            sizeBucket: Math.round(Math.sqrt(renderedArea) / 40),
            playing: video.paused === false && video.ended !== true,
            controls: !!video.controls,
            readyState: Number.isInteger(video.readyState) ? video.readyState : 0,
            duration,
            renderedArea
        };
    });

    const compareVideo = (left, right) => {
        const leftRank = [
            left.hasSource ? 1 : 0,
            left.rendered ? 1 : 0,
            left.background ? 0 : 1,
            left.shortUncontrolled ? 0 : 1,
            left.playing ? 1 : 0,
            left.controls ? 1 : 0,
            left.readyState,
            left.duration,
            left.sizeBucket
        ];
        const rightRank = [
            right.hasSource ? 1 : 0,
            right.rendered ? 1 : 0,
            right.background ? 0 : 1,
            right.shortUncontrolled ? 0 : 1,
            right.playing ? 1 : 0,
            right.controls ? 1 : 0,
            right.readyState,
            right.duration,
            right.sizeBucket
        ];
        for (let index = 0; index < leftRank.length; index++) {
            if (leftRank[index] !== rightRank[index]) return rightRank[index] - leftRank[index];
        }
        return 0;
    };
    videoDetails.sort(compareVideo);

    // Recursively list direct and same-origin-descendant frame elements. This
    // lets the background identify a large inaccessible player origin even if
    // an all-frame probe is rejected by the browser's site-access policy.
    const embeddedFrames = [];
    const collectEmbeddedFrames = (doc, depth = 0, ancestorVisible = true) => {
        if (depth >= 4 || typeof doc.querySelectorAll !== 'function') return;
        for (const frame of doc.querySelectorAll('iframe, frame')) {
            const rect = frame.getBoundingClientRect();
            const directVisible = elementIsVisible(frame, rect);
            const visible = ancestorVisible && directVisible;
            let href = '';
            try { href = new URL(frame.src || '', doc.location.href).href; } catch { href = ''; }
            embeddedFrames.push({
                href,
                origin: (() => { try { return new URL(href).origin; } catch { return null; } })(),
                area: Math.max(0, rect.width) * Math.max(0, rect.height),
                width: Math.max(0, rect.width),
                height: Math.max(0, rect.height),
                visible,
                depth: depth + 1,
                mediaHint: frame.allowFullscreen === true
                    || frame.hasAttribute?.('allowfullscreen')
                    || /autoplay|fullscreen|picture-in-picture|encrypted-media/i.test(frame.getAttribute('allow') || '')
                    || /player|video|stream|watch|embed|media|xfp/i.test([
                        frame.id,
                        frame.name,
                        frame.className,
                        frame.title,
                        href
                    ].join(' '))
            });
            try {
                const frameDoc = frame.contentDocument;
                if (frameDoc) collectEmbeddedFrames(frameDoc, depth + 1, visible);
            } catch {
                // Cross-origin descendants are represented by their frame URL.
            }
        }
    };
    collectEmbeddedFrames(document);

    const storedParentVisibility = window.__koalaParentFrameVisibility;
    const parentVisibility = expectedVisibilityToken
        && storedParentVisibility?.token === expectedVisibilityToken
        ? storedParentVisibility
        : null;
    return {
        href: window.location.href,
        origin: window.location.origin,
        isTop: window.top === window,
        videoCount: videoDetails.length,
        bestVideo: videoDetails[0] || null,
        frameArea: Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight),
        parentFrameVisible: window.top === window
            ? true
            : parentVisibility?.visible ?? null,
        parentFrameArea: window.top === window
            ? Math.max(0, window.innerWidth) * Math.max(0, window.innerHeight)
            : (Number.isFinite(parentVisibility?.area) ? parentVisibility.area : null),
        embeddedFrames
    };
}

/** Runs inside every frame before the visibility dispatch. */
export function installParentFrameVisibilityProbe(token) {
    try { window.__koalaFrameVisibilityCleanup?.(); } catch { /* stale probe */ }
    window.__koalaParentFrameVisibility = { token, visible: null, area: null };
    let timeout = null;
    const cleanup = () => {
        window.removeEventListener('message', handler);
        if (timeout !== null) clearTimeout(timeout);
        if (window.__koalaFrameVisibilityCleanup === cleanup) {
            delete window.__koalaFrameVisibilityCleanup;
        }
    };
    const handler = (event) => {
        if (event.source !== window.parent
            || event.data?.type !== 'KOALASYNC_FRAME_VISIBILITY'
            || event.data?.token !== token) {
            return;
        }
        window.__koalaParentFrameVisibility = {
            token,
            visible: event.data.visible === true,
            area: Number.isFinite(event.data.area) ? event.data.area : 0
        };
    };
    window.addEventListener('message', handler);
    timeout = setTimeout(cleanup, 1000);
    window.__koalaFrameVisibilityCleanup = cleanup;
}

/** Runs inside every frame; each parent reports geometry to its direct children. */
export function dispatchParentFrameVisibilityProbe(token) {
    const ancestor = window.top === window ? { visible: true, area: Infinity } : window.__koalaParentFrameVisibility;
    for (const frame of document.querySelectorAll('iframe, frame')) {
        try {
            const rect = frame.getBoundingClientRect();
            const style = window.getComputedStyle(frame);
            const area = Math.max(0, rect.width) * Math.max(0, rect.height);
            const layoutWidth = Math.max(window.innerWidth, document.documentElement?.scrollWidth || 0);
            const layoutHeight = Math.max(window.innerHeight, document.documentElement?.scrollHeight || 0);
            const scrollX = Number(window.scrollX) || 0;
            const scrollY = Number(window.scrollY) || 0;
            const intersectsLayout = rect.bottom + scrollY > 0
                && rect.right + scrollX > 0
                && rect.top + scrollY < layoutHeight
                && rect.left + scrollX < layoutWidth;
            const browserReportsVisible = typeof frame.checkVisibility === 'function'
                ? frame.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
                : true;
            const directlyVisible = area > 0
                && intersectsLayout
                && browserReportsVisible
                && style.display !== 'none'
                && style.visibility !== 'hidden'
                && Number(style.opacity) !== 0;
            const visible = directlyVisible && ancestor?.visible !== false;
            const inheritedArea = Number.isFinite(ancestor?.area) ? ancestor.area : area;
            const effectiveArea = Math.min(area, inheritedArea);
            frame.contentWindow?.postMessage({
                type: 'KOALASYNC_FRAME_VISIBILITY',
                token,
                visible,
                area: effectiveArea
            }, '*');
        } catch {
            // A detached or browser-owned frame is not a candidate.
        }
    }
}

function mediaCandidateRank(entry) {
    const result = entry.result;
    const video = result.bestVideo;
    const visibility = result.parentFrameVisible === true
        ? 2
        : result.parentFrameVisible === false
            ? 0
            : 1;
    return [
        visibility,
        video.hasSource ? 1 : 0,
        video.rendered ? 1 : 0,
        video.background ? 0 : 1,
        video.shortUncontrolled ? 0 : 1,
        video.playing ? 1 : 0,
        video.controls ? 1 : 0,
        video.readyState,
        video.duration,
        video.sizeBucket,
        result.isTop ? 1 : 0,
        Number.isFinite(result.parentFrameArea) ? result.parentFrameArea : result.frameArea
    ];
}

function compareRanks(left, right) {
    const leftRank = mediaCandidateRank(left);
    const rightRank = mediaCandidateRank(right);
    for (let index = 0; index < leftRank.length; index++) {
        if (leftRank[index] !== rightRank[index]) return rightRank[index] - leftRank[index];
    }
    return 0;
}

function sameMeaningfulRank(left, right) {
    const leftRank = mediaCandidateRank(left);
    const rightRank = mediaCandidateRank(right);
    // Ignore duration, size, top-frame preference, and raw frame area. Two
    // otherwise identical frames are unsafe to distinguish by preload metadata.
    return leftRank.slice(0, 8).every((value, index) => value === rightRank[index]);
}

export function selectMediaFrame(injectionResults) {
    const candidates = (Array.isArray(injectionResults) ? injectionResults : [])
        .filter(entry => Number.isInteger(entry?.frameId)
            && entry?.result?.bestVideo?.rendered === true)
        .filter(entry => entry.result.parentFrameVisible !== false)
        .sort(compareRanks);
    if (candidates.length === 0) return null;
    if (candidates.length > 1
        && candidates[0].result.parentFrameVisible !== true
        && candidates[1].result.parentFrameVisible !== true
        && sameMeaningfulRank(candidates[0], candidates[1])) {
        return null;
    }
    return candidates[0];
}

function findMissingPlayerAccess(results) {
    const accessibleOrigins = new Set();
    for (const entry of results) {
        const origin = safeOrigin(entry?.result?.href);
        if (origin) accessibleOrigins.add(origin);
    }

    const missingByOrigin = new Map();
    for (const entry of results) {
        for (const frame of entry?.result?.embeddedFrames || []) {
            if (!frame.visible || accessibleOrigins.has(frame.origin) || !frame.origin) continue;
            const aspectRatio = frame.height > 0 ? frame.width / frame.height : 0;
            const drivePlayer = isGoogleDrivePlayerUrl(frame.href);
            const looksLikePlayer = frame.mediaHint === true
                && frame.area >= MIN_PLAYER_FRAME_AREA
                && aspectRatio >= MIN_PLAYER_ASPECT_RATIO
                && aspectRatio <= MAX_PLAYER_ASPECT_RATIO;
            if (!drivePlayer && !looksLikePlayer) continue;
            const previous = missingByOrigin.get(frame.origin);
            if (!previous || frame.area > previous.area || drivePlayer) {
                missingByOrigin.set(frame.origin, { ...frame, drivePlayer });
            }
        }
    }

    const missing = Array.from(missingByOrigin.values()).sort((left, right) => {
        if (left.drivePlayer !== right.drivePlayer) return left.drivePlayer ? -1 : 1;
        return right.area - left.area;
    });
    if (missing.length === 0) return null;
    if (!missing[0].drivePlayer && missing.length > 1 && missing[0].area < missing[1].area * 1.5) {
        return null;
    }
    return {
        host: new URL(missing[0].origin).hostname,
        originPattern: originPattern(missing[0].origin),
        area: missing[0].area,
        drivePlayer: missing[0].drivePlayer === true
    };
}

function shouldPreferMissingAccess(access, selected) {
    if (!access) return false;
    if (access.drivePlayer || !selected?.result?.bestVideo) return true;
    const video = selected.result.bestVideo;
    if (!video.hasSource || !video.rendered || video.background) return true;
    const selectedArea = Number.isFinite(video.renderedArea) ? video.renderedArea : 0;
    const weakAccessibleCandidate = !video.controls
        && video.duration > 0
        && video.duration < 300;
    return weakAccessibleCandidate
        && access.area >= Math.max(MIN_PLAYER_FRAME_AREA, selectedArea * 1.5);
}

function accessRequiredError(access) {
    const error = new Error(`Embedded player access is required for ${access.host}`);
    error.code = MEDIA_FRAME_ACCESS_REQUIRED;
    error.host = access.host;
    error.originPattern = access.originPattern;
    return error;
}

function contentTarget(tabId, selected, monitorTargets = null) {
    const frameId = normalizeFrameId(selected?.frameId);
    const documentId = typeof selected?.documentId === 'string' ? selected.documentId : null;
    const target = {
        frameId,
        documentId,
        frameUrl: typeof selected?.result?.href === 'string' ? selected.result.href : null,
        hasVideo: !!selected?.result?.bestVideo,
        scriptTarget: documentId
            ? { tabId, documentIds: [documentId] }
            : (frameId === 0 ? { tabId } : { tabId, frameIds: [frameId] })
    };
    if (Array.isArray(monitorTargets) && monitorTargets.length > 0) {
        target.monitorTargets = monitorTargets;
    }
    return target;
}

export function listMediaFrameScriptTargets(tabId) {
    return [{ tabId, allFrames: true }];
}

function listFrameProbeTargets(tabId, embeddedFrameCount = 0) {
    // Chromium can reject one all-frames executeScript call when a single
    // child frame is browser-owned or temporarily unavailable. Frame IDs are
    // not exposed without webNavigation, so probe a bounded range individually
    // after the top frame tells us that embedded frames exist. Each rejected
    // probe is isolated and cannot hide the other frames.
    const maxFrameId = Math.min(64, Math.max(8, (embeddedFrameCount * 4) + 4));
    return Array.from({ length: maxFrameId }, (_, frameId) => ({
        tabId,
        frameIds: [frameId]
    }));
}

function frameScriptTarget(tabId, entry) {
    const frameId = normalizeFrameId(entry?.frameId);
    return typeof entry?.documentId === 'string' && entry.documentId
        ? { tabId, documentIds: [entry.documentId] }
        : (frameId === 0 ? { tabId, frameIds: [0] } : { tabId, frameIds: [frameId] });
}

function mergeFrameResults(...groups) {
    const merged = new Map();
    for (const group of groups) {
        for (const entry of Array.isArray(group) ? group : []) {
            if (!Number.isInteger(entry?.frameId)) continue;
            // A frame ID identifies the current slot. If its document changed
            // between the broad probe and the exact probe, the exact result
            // must replace the stale document rather than create a duplicate
            // candidate that can trigger a false ambiguity.
            const key = `frame:${entry.frameId}`;
            merged.set(key, entry);
        }
    }
    return Array.from(merged.values());
}

async function executeInAccessibleFrames(chromeApi, targets, func, args) {
    const settled = await Promise.all(targets.map(async target => {
        try {
            const result = await chromeApi.scripting.executeScript({ target, func, args });
            return Array.isArray(result) ? result : [];
        } catch {
            return [];
        }
    }));
    return settled.flat();
}

export async function resolveMediaContentTarget(chromeApi, tabId, {
    attempts = 8,
    retryDelayMs = 200,
    probeDelayMs = 60
} = {}) {
    let fallback = null;
    let missingAccess = null;
    let monitorTargets = [];

    for (let attempt = 0; attempt < attempts; attempt++) {
        const topResults = await executeInAccessibleFrames(
            chromeApi,
            [{ tabId, frameIds: [0] }],
            inspectMediaFrame,
            [null]
        );
        const allFrameResults = await executeInAccessibleFrames(
            chromeApi,
            listMediaFrameScriptTargets(tabId),
            inspectMediaFrame,
            [null]
        );
        let results = mergeFrameResults(topResults, allFrameResults);
        const embeddedFrameCount = topResults.reduce(
            (count, entry) => Math.max(count, entry?.result?.embeddedFrames?.length || 0),
            0
        );
        if (embeddedFrameCount > 0) {
            const individuallyProbed = await executeInAccessibleFrames(
                chromeApi,
                listFrameProbeTargets(tabId, embeddedFrameCount),
                inspectMediaFrame,
                [null]
            );
            results = mergeFrameResults(results, individuallyProbed);
        }
        if (results.length === 0) return contentTarget(tabId, null);

        if (results.length > 1) {
            const token = `${tabId}:${attempt}:${Date.now()}:${Math.random()}`;
            const frameTargets = results.map(entry => frameScriptTarget(tabId, entry));
            try {
                await executeInAccessibleFrames(
                    chromeApi,
                    frameTargets,
                    installParentFrameVisibilityProbe,
                    [token]
                );
                // Four passes match the maximum same-origin recursion depth.
                for (let pass = 0; pass < 4; pass++) {
                    await executeInAccessibleFrames(
                        chromeApi,
                        frameTargets,
                        dispatchParentFrameVisibilityProbe,
                        [token]
                    );
                    await new Promise(resolve => setTimeout(resolve, probeDelayMs));
                }
                const inspected = await executeInAccessibleFrames(
                    chromeApi,
                    frameTargets,
                    inspectMediaFrame,
                    [token]
                );
                if (inspected.length > 0) results = mergeFrameResults(results, inspected);
            } catch {
                // Initial results remain usable, but equally-ranked unknown
                // frames will be rejected below rather than guessed.
            }
        }
        // Rebuild these after the visibility refresh so a frame navigation that
        // replaced its document ID cannot leave a stale monitor target behind.
        monitorTargets = results.map(entry => frameScriptTarget(tabId, entry));

        const selected = selectMediaFrame(results);
        const currentMissingAccess = findMissingPlayerAccess(results);
        missingAccess = currentMissingAccess;
        fallback = selected;
        if (selected) {
            if (selected.result.bestVideo.hasSource
                && selected.result.bestVideo.rendered
                && !shouldPreferMissingAccess(currentMissingAccess, selected)) {
                return contentTarget(tabId, selected, monitorTargets);
            }
        }

        if (attempt < attempts - 1) {
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
    }

    if (missingAccess) throw accessRequiredError(missingAccess);
    if (fallback) return contentTarget(tabId, fallback, monitorTargets);
    // Selecting a tab must not depend on video detection. A page can be a
    // valid target before its player exists, and an ambiguous frame layout is
    // recoverable through the injected lifecycle monitor. Keep the top-frame
    // target active instead of discarding the user's selection.
    return contentTarget(tabId, null, monitorTargets);
}
