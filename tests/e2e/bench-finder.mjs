#!/usr/bin/env node
/**
 * Measures findVideo() on a page loaded with same-origin frames.
 *
 * Not a spec: timings are machine dependent and would only add noise to CI.
 * Run it by hand when the finder changes:
 *
 *   node tests/e2e/fixture-server.mjs 4173 &
 *   node tests/e2e/bench-finder.mjs
 *
 * The measured implementation is the shipped one, lifted out of content.js by
 * the same helper the specs use. The pre-v3.1.0 formula it is compared against
 * is transcribed here, since that code no longer exists in the tree.
 */
import { chromium } from '@playwright/test';
import { buildVideoFinderScript } from './helpers/content-source.mjs';

const url = process.env.KOALA_E2E_URL || 'http://localhost:4173/pages/ad-frame.html';
const FRAMES = Number(process.env.KOALA_BENCH_FRAMES || 40);
const CALLS = Number(process.env.KOALA_BENCH_CALLS || 200);

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => window.__fixtureReady === true);
await page.addScriptTag({ content: buildVideoFinderScript() });

const result = await page.evaluate(({ frames, calls }) => {
    // Pre-v3.1.0 scoring, kept only as the baseline for this measurement.
    function findVideoLegacy(root = document) {
        const candidates = window.__koalaCollect(root);
        if (!candidates.length) return null;
        if (candidates.length === 1) return candidates[0];
        let best = null;
        let bestScore = -1;
        for (const v of candidates) {
            if (v.tagName !== 'VIDEO') continue;
            const area = (v.videoWidth || v.offsetWidth || 0) * (v.videoHeight || v.offsetHeight || 0);
            const score = area + (v.muted ? 0 : 100000)
                + (v.duration && isFinite(v.duration) ? v.duration : 0) * 100;
            if (score > bestScore) { bestScore = score; best = v; }
        }
        return best;
    }
    window.__koalaCollect = (root) => window.collectVideoCandidates(root, 0, []);

    const holder = document.createElement('div');
    document.body.appendChild(holder);
    for (let i = 0; i < frames; i++) {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        holder.appendChild(frame);
    }

    // globalThis keeps this readable to a Node-configured linter: the body runs
    // in the page, where performance is a global.
    const clock = globalThis.performance;
    const bench = (fn) => {
        for (let i = 0; i < 20; i++) fn();
        const start = clock.now();
        for (let i = 0; i < calls; i++) fn();
        return (clock.now() - start) / calls;
    };

    const current = bench(() => window.__koalaFindVideo());
    const legacy = bench(() => findVideoLegacy());
    const frameCount = document.querySelectorAll('iframe, frame').length;
    holder.remove();
    return { frameCount, current, legacy };
}, { frames: FRAMES, calls: CALLS });

console.log(`frames on page:      ${result.frameCount}`);
console.log(`shipped findVideo:   ${result.current.toFixed(3)} ms/call`);
console.log(`pre-v3.1.0 formula:  ${result.legacy.toFixed(3)} ms/call`);

await browser.close();
