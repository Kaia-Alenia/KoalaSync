import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { test as base, chromium } from '@playwright/test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const extensionPath = path.join(repoRoot, 'dist/chrome');

/**
 * A browser with the packed extension loaded, plus its extension id. Each test
 * gets a throwaway profile so storage from one test cannot leak into the next.
 */
export const test = base.extend({
    context: async ({}, use) => {
        if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
            throw new Error('dist/chrome is missing. Run: npm run build:extension');
        }
        const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koalasync-e2e-'));
        const context = await chromium.launchPersistentContext(userDataDir, {
            // The headless shell does not run MV3 service workers; the full
            // Chromium build in new headless mode does.
            channel: 'chromium',
            headless: true,
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
                '--autoplay-policy=no-user-gesture-required'
            ]
        });
        await use(context);
        await context.close();
        fs.rmSync(userDataDir, { recursive: true, force: true });
    },
    extensionId: async ({ context }, use) => {
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker');
        await use(worker.url().split('/')[2]);
    }
});

export { expect } from '@playwright/test';

/**
 * Opens the real popup page, waits for its settings to be populated and expands
 * the domain editor, which ships collapsed and therefore has no clickable
 * buttons until it is opened.
 */
export async function openPopup(context, extensionId, { openEditor = true } = {}) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await page.waitForFunction(() => {
        const textarea = document.getElementById('blacklistDomains');
        return !!textarea && textarea.value.length > 0;
    });

    if (!openEditor) return page;

    // A fresh profile has never seen onboarding, and its overlay sits on top of
    // the whole popup. Dismiss it the same way the tour's last step does.
    await page.evaluate(() => new Promise(resolve => {
        chrome.storage.sync.set({ onboardingComplete: true }, () => {
            const overlay = document.getElementById('onboarding-overlay');
            if (overlay) overlay.style.display = 'none';
            resolve();
        });
    }));

    // The controls live on the Settings tab, inside a collapsed accordion.
    await page.click('.tab-btn[data-tab="tab-settings"]');
    await page.evaluate(() => {
        const details = document.getElementById('blacklistEdit')?.closest('details');
        if (details) details.open = true;
    });

    await page.click('#blacklistEdit');
    await page.waitForSelector('#blacklistSave', { state: 'visible' });
    return page;
}

export async function readStorage(page, keys) {
    return page.evaluate(k => chrome.storage.local.get(k), keys);
}

export async function writeStorage(page, values) {
    return page.evaluate(v => chrome.storage.local.set(v), values);
}
