/**
 * Fixture helper. Marks the page ready once every <video> that is supposed to
 * carry metadata has it, and once every video marked data-autoplay is actually
 * playing. Tests wait for window.__fixtureReady instead of sleeping, so the
 * scoring signals (videoWidth, duration, paused) are settled before we look.
 */
(function () {
    window.__fixtureReady = false;

    function collectVideos(doc, out) {
        for (const video of doc.querySelectorAll('video')) out.push(video);
        for (const frame of doc.querySelectorAll('iframe')) {
            let frameDoc = null;
            try { frameDoc = frame.contentDocument; } catch (_e) { frameDoc = null; }
            if (frameDoc) collectVideos(frameDoc, out);
        }
        for (const host of doc.querySelectorAll('*')) {
            if (host.shadowRoot) collectVideos(host.shadowRoot, out);
        }
        return out;
    }

    function metadataReady(video) {
        if (video.dataset.sourceless !== undefined) return true;
        return video.readyState >= 1;
    }

    function playbackReady(video) {
        if (video.dataset.autoplay === undefined) return true;
        return !video.paused;
    }

    function check() {
        const videos = collectVideos(document, []);
        if (!videos.length) return false;
        if (!videos.every(v => metadataReady(v) && playbackReady(v))) return false;
        window.__fixtureReady = true;
        return true;
    }

    function start() {
        for (const video of collectVideos(document, [])) {
            if (video.dataset.autoplay !== undefined) video.play().catch(() => {});
        }
        if (check()) return;
        const timer = setInterval(() => { if (check()) clearInterval(timer); }, 50);
    }

    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
})();
