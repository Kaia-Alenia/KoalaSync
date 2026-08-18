/**
 * Lightweight per-frame sentinel. It does not control media; it only tells the
 * background that the selected tab's candidate set or frame layout changed.
 */
(function installKoalaMediaFrameMonitor() {
    try { window.__koalaMediaFrameMonitorCleanup?.(); } catch { /* stale monitor */ }

    let destroyed = false;
    let notifyTimer = null;
    const hookedFrames = new Set();
    let lastCandidateSignature = null;

    function geometryBucket(value) {
        return Math.round(value / 8);
    }

    function elementStylesAllowRendering(element) {
        let current = element;
        while (current) {
            try {
                const style = window.getComputedStyle(current);
                if (style.display === 'none'
                    || style.visibility === 'hidden'
                    || Number(style.opacity) === 0) {
                    return false;
                }
            } catch { /* detached or browser-owned node */ }
            const parent = current.parentElement;
            if (parent) {
                current = parent;
                continue;
            }
            try { current = current.getRootNode?.().host || null; } catch { current = null; }
        }
        return true;
    }

    function candidateSignature() {
        const parts = [];
        for (const element of document.querySelectorAll('video, iframe, frame')) {
            try {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                const browserReportsVisible = typeof element.checkVisibility === 'function'
                    ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
                    : true;
                const layoutWidth = Math.max(window.innerWidth, document.documentElement?.scrollWidth || 0);
                const layoutHeight = Math.max(window.innerHeight, document.documentElement?.scrollHeight || 0);
                const scrollX = Number(window.scrollX) || 0;
                const scrollY = Number(window.scrollY) || 0;
                const visible = rect.width > 0
                    && rect.height > 0
                    && rect.bottom + scrollY > 0
                    && rect.right + scrollX > 0
                    && rect.top + scrollY < layoutHeight
                    && rect.left + scrollX < layoutWidth
                    && browserReportsVisible
                    && elementStylesAllowRendering(element)
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && Number(style.opacity) !== 0;
                const source = element.tagName === 'VIDEO'
                    ? (element.currentSrc || element.src || element.querySelector?.('source[src]')?.src || '')
                    : (element.src || '');
                // Deliberately coarse. This signature answers "which frame is a
                // candidate", not "what is it doing". Including paused/readyState
                // /duration made every play, pause and buffering tick look like a
                // layout change, so ordinary playback retriggered a full target
                // reactivation and re-injected the content script under the user.
                const mediaState = element.tagName === 'VIDEO'
                    ? [
                        element.readyState > 0 ? 1 : 0,
                        Number.isFinite(element.duration) && element.duration > 0 ? 1 : 0
                    ].join(',')
                    : '';
                parts.push([
                    element.tagName,
                    source,
                    visible ? 1 : 0,
                    geometryBucket(rect.left),
                    geometryBucket(rect.top),
                    geometryBucket(rect.width),
                    geometryBucket(rect.height),
                    mediaState
                ].join(':'));
            } catch {
                parts.push('detached');
            }
        }
        return parts.join('|');
    }

    function send(reason) {
        if (destroyed) return;
        try {
            chrome.runtime.sendMessage({ type: 'MEDIA_FRAME_CANDIDATE_CHANGED', reason }).catch(() => {});
        } catch {
            cleanup();
        }
    }

    function schedule(reason, { force = false } = {}) {
        if (destroyed || notifyTimer !== null) return;
        notifyTimer = setTimeout(() => {
            notifyTimer = null;
            const nextSignature = candidateSignature();
            if (!force && nextSignature === lastCandidateSignature) return;
            lastCandidateSignature = nextSignature;
            send(reason);
        }, 0);
    }

    function containsAddedMediaNode(node) {
        return node?.nodeType === 1
            && (node.matches?.('video, iframe, frame') || node.querySelector?.('video, iframe, frame'));
    }

    function attributeAffectsCandidate(node) {
        return node?.nodeType === 1
            && (node.matches?.('video, iframe, frame') || node.querySelector?.('video, iframe, frame'));
    }

    function hookFrames() {
        for (const frame of hookedFrames) {
            if (frame.isConnected) continue;
            frame.removeEventListener('load', handleFrameLoad);
            hookedFrames.delete(frame);
        }
        for (const frame of document.querySelectorAll('iframe, frame')) {
            if (hookedFrames.has(frame)) continue;
            hookedFrames.add(frame);
            frame.addEventListener('load', handleFrameLoad);
        }
    }

    function handleFrameLoad() {
        hookFrames();
        schedule('frame_load', { force: true });
    }

    const observer = new MutationObserver((mutations) => {
        let relevant = false;
        for (const mutation of mutations) {
            if (mutation.type === 'attributes') {
                if (attributeAffectsCandidate(mutation.target)) relevant = true;
            } else if ([...mutation.addedNodes, ...mutation.removedNodes].some(containsAddedMediaNode)) {
                relevant = true;
            }
            if (relevant) break;
        }
        if (!relevant) return;
        hookFrames();
        schedule('media_dom_changed');
    });

    function handlePageHide() { send('frame_pagehide'); }
    function handlePageShow() { schedule('frame_pageshow', { force: true }); }
    function handleResize() { schedule('frame_resize'); }
    function handleMediaState(event) {
        if (event.target?.tagName === 'VIDEO') schedule(`media_${event.type}`);
    }
    function handleMessage(message) {
        if (message?.type === 'MEDIA_MONITOR_DEACTIVATE') cleanup();
    }

    function cleanup() {
        if (destroyed) return;
        destroyed = true;
        if (notifyTimer !== null) clearTimeout(notifyTimer);
        notifyTimer = null;
        observer.disconnect();
        for (const frame of hookedFrames) frame.removeEventListener('load', handleFrameLoad);
        hookedFrames.clear();
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('pageshow', handlePageShow);
        window.removeEventListener('resize', handleResize);
        for (const type of MEDIA_STATE_EVENTS) {
            document.removeEventListener(type, handleMediaState, true);
        }
        try { chrome.runtime.onMessage.removeListener(handleMessage); } catch { /* invalidated */ }
        if (window.__koalaMediaFrameMonitorCleanup === cleanup) {
            delete window.__koalaMediaFrameMonitorCleanup;
        }
    }

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'src', 'controls']
    });
    hookFrames();
    lastCandidateSignature = candidateSignature();
    // A monitor installed after the player already exists would otherwise take
    // that player as its baseline and never mention it. Frames get a monitor
    // late all the time — a rebuilt document, a reinstall — so announce an
    // already-present video once instead of staying silent about it.
    if (document.querySelector('video')) schedule('monitor_installed', { force: true });
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('resize', handleResize, { passive: true });
    const MEDIA_STATE_EVENTS = ['play', 'pause', 'loadedmetadata', 'loadeddata', 'canplay', 'durationchange', 'emptied'];
    for (const type of MEDIA_STATE_EVENTS) {
        document.addEventListener(type, handleMediaState, true);
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    window.__koalaMediaFrameMonitorCleanup = cleanup;
})();
