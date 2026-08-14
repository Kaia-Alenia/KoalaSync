import { test, expect } from './helpers/extension-fixture.mjs';

/**
 * Drives the packed extension itself: real background service worker, real
 * chrome.scripting injection, real runtime messaging. The detection specs cover
 * which element gets picked; this file covers whether the extension ever gets
 * far enough to pick one.
 */

/** Runs code in an extension page, where the privileged chrome.* APIs exist. */
async function withExtensionPage(context, extensionId, fn) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    const result = await fn(page);
    await page.close();
    return result;
}

async function selectTargetTab(context, extensionId, pageUrl) {
    return withExtensionPage(context, extensionId, page => page.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        if (!tab) throw new Error(`no tab matched ${url}`);
        const response = await chrome.runtime.sendMessage({ type: 'SET_TARGET_TAB', tabId: tab.id });
        return { tabId: tab.id, response };
    }, pageUrl));
}

async function sendServerCommand(context, extensionId, tabId, action, payload) {
    return withExtensionPage(context, extensionId, page => page.evaluate(async ({ tabId, action, payload }) => {
        return chrome.tabs.sendMessage(tabId, {
            type: 'SERVER_COMMAND',
            action,
            payload,
            actionTimestamp: Date.now(),
            commandSenderId: 'e2e'
        });
    }, { tabId, action, payload }));
}

test('injects into the target tab and attaches to a same-origin frame player', async ({ context, extensionId, baseURL }) => {
    const url = `${baseURL}/pages/iframe-player.html`;
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__fixtureReady === true);

    const { response } = await selectTargetTab(context, extensionId, url);
    expect(response?.status, 'SET_TARGET_TAB should not report a failure').not.toBe('error');

    await expect.poll(
        () => page.evaluate(() => {
            const video = document.querySelector('iframe').contentDocument.querySelector('video');
            return video ? video.dataset.koalaAttached : null;
        }),
        { message: 'content script should attach to the video inside the frame' }
    ).toBe('true');
});

test('applies remote play, pause and seek to the framed player', async ({ context, extensionId, baseURL }) => {
    const url = `${baseURL}/pages/iframe-player.html`;
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__fixtureReady === true);

    const { tabId } = await selectTargetTab(context, extensionId, url);
    await expect.poll(() => page.evaluate(() => {
        const video = document.querySelector('iframe').contentDocument.querySelector('video');
        return video ? video.dataset.koalaAttached : null;
    })).toBe('true');

    await sendServerCommand(context, extensionId, tabId, 'play');
    await expect.poll(() => page.evaluate(FRAMED_VIDEO_PAUSED), { message: 'remote play should start playback' }).toBe(false);

    await sendServerCommand(context, extensionId, tabId, 'pause');
    await expect.poll(() => page.evaluate(FRAMED_VIDEO_PAUSED), { message: 'remote pause should stop playback' }).toBe(true);

    await sendServerCommand(context, extensionId, tabId, 'seek', { targetTime: 6 });
    await expect.poll(
        () => page.evaluate(() => document.querySelector('iframe').contentDocument.querySelector('video').currentTime),
        { message: 'remote seek should move the framed player' }
    ).toBeGreaterThan(5);
});

test('reinjects after the target tab navigates', async ({ context, extensionId, baseURL }) => {
    const first = `${baseURL}/pages/iframe-player.html`;
    const page = await context.newPage();
    await page.goto(first);
    await page.waitForFunction(() => window.__fixtureReady === true);
    await selectTargetTab(context, extensionId, first);
    await expect.poll(() => page.evaluate(() => {
        const video = document.querySelector('iframe').contentDocument.querySelector('video');
        return video ? video.dataset.koalaAttached : null;
    })).toBe('true');

    await page.goto(`${baseURL}/pages/simple-player.html`);
    await page.waitForFunction(() => window.__fixtureReady === true);

    await expect.poll(
        () => page.evaluate(() => {
            const video = document.getElementById('player');
            return video ? video.dataset.koalaAttached : null;
        }),
        { message: 'the content script should come back after a navigation' }
    ).toBe('true');
});

test('re-attaches after the player frame swaps its document', async ({ context, extensionId, baseURL }) => {
    const url = `${baseURL}/pages/reloading-frame.html`;
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__fixtureReady === true);
    await selectTargetTab(context, extensionId, url);

    await expect.poll(() => page.evaluate(() => {
        const video = document.querySelector('iframe').contentDocument.getElementById('framed-player');
        return video ? video.dataset.koalaAttached : null;
    })).toBe('true');

    // Navigating the frame replaces its document without touching the top one,
    // so nothing but a load hook on the frame can notice the new player.
    await page.evaluate(() => {
        document.querySelector('iframe').src = 'frames/player-frame-2.html';
    });

    await expect.poll(
        () => page.evaluate(() => {
            const video = document.querySelector('iframe').contentDocument.getElementById('framed-player-2');
            return video ? video.dataset.koalaAttached : null;
        }),
        { message: 'the content script should follow the frame to its new document' }
    ).toBe('true');
});

test('re-attaches when a nested player frame swaps its document', async ({ context, extensionId, baseURL }) => {
    const url = `${baseURL}/pages/nested-frame.html`;
    const page = await context.newPage();
    await page.goto(url);
    await page.waitForFunction(() => window.__fixtureReady === true);
    await selectTargetTab(context, extensionId, url);

    const innerVideo = (id) => page.evaluate((videoId) => {
        const outer = document.querySelector('iframe').contentDocument;
        const inner = outer.querySelector('iframe').contentDocument;
        const video = inner.getElementById(videoId);
        return video ? video.dataset.koalaAttached : null;
    }, id);

    await expect.poll(() => innerVideo('framed-player')).toBe('true');

    // The reloading frame sits at depth two. A load hook that only covers
    // top-level frames would never fire for it.
    await page.evaluate(() => {
        const outer = document.querySelector('iframe').contentDocument;
        outer.querySelector('iframe').src = 'player-frame-2.html';
    });

    await expect.poll(
        () => innerVideo('framed-player-2'),
        { message: 'a frame two levels down should be watched for reloads too' }
    ).toBe('true');
});

function FRAMED_VIDEO_PAUSED() {
    return document.querySelector('iframe').contentDocument.querySelector('video').paused;
}
