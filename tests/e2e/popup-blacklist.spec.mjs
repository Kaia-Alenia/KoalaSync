import { test, expect, openPopup, readStorage, writeStorage } from './helpers/extension-fixture.mjs';
import { BLACKLIST_DOMAINS } from '../../shared/blacklist.js';

/**
 * Drives the real settings UI in the real popup. The shared module is unit
 * tested on its own; what this file covers is the wiring around it, which is
 * where a delta model can quietly fall back to snapshot behaviour.
 */

const OVERRIDES_KEY = 'blacklistOverrides';
const LEGACY_KEY = 'customBlacklistDomains';

/** The editor body without its comment headers, in order. */
async function readEditorDomains(page) {
    return page.evaluate(() => document.getElementById('blacklistDomains').value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')));
}

async function setEditorDomains(page, domains) {
    await page.evaluate(value => {
        document.getElementById('blacklistDomains').value = value;
    }, domains.join('\n'));
}

test('shows the shipped defaults grouped under section headers', async ({ context, extensionId }) => {
    const page = await openPopup(context, extensionId);

    const body = await page.inputValue('#blacklistDomains');
    const headers = body.split('\n').filter(line => line.startsWith('#'));
    expect(headers, 'both section headers should be present').toHaveLength(2);
    expect(headers[0].replace('#', '').trim(), 'the user section header should be translated').not.toBe('');

    const domains = await readEditorDomains(page);
    expect(domains).toEqual(BLACKLIST_DOMAINS);

    const stored = await readStorage(page, [OVERRIDES_KEY]);
    expect(stored[OVERRIDES_KEY], 'an untouched list stores nothing').toBeUndefined();
});

test('saves only the delta when a default is removed and a domain is added', async ({ context, extensionId }) => {
    const page = await openPopup(context, extensionId);

    const kept = BLACKLIST_DOMAINS.filter(domain => domain !== 'reddit.com');
    await setEditorDomains(page, [...kept, 'videos.example']);
    await page.click('#blacklistSave');
    await expect(page.locator('#blacklistStatus')).toHaveAttribute('data-state', 'success');

    const stored = await readStorage(page, [OVERRIDES_KEY]);
    expect(stored[OVERRIDES_KEY]).toEqual({
        removedDefaults: ['reddit.com'],
        addedDomains: ['videos.example']
    });
});

test('regroups a saved entry under the user section after reopening', async ({ context, extensionId }) => {
    const first = await openPopup(context, extensionId);
    await setEditorDomains(first, [...BLACKLIST_DOMAINS, 'videos.example']);
    await first.click('#blacklistSave');
    await expect(first.locator('#blacklistStatus')).toHaveAttribute('data-state', 'success');
    await first.close();

    const second = await openPopup(context, extensionId);
    const body = await second.inputValue('#blacklistDomains');
    const lines = body.split('\n').map(line => line.trim());
    const userHeaderIndex = lines.findIndex(line => line.startsWith('#'));
    const defaultHeaderIndex = lines.findIndex((line, i) => i > userHeaderIndex && line.startsWith('#'));

    expect(lines.indexOf('videos.example'), 'the user entry sits in the user section')
        .toBeLessThan(defaultHeaderIndex);
    expect(lines.indexOf('google.com'), 'a shipped default sits in the defaults section')
        .toBeGreaterThan(defaultHeaderIndex);
});

test('rejects an invalid entry without saving anything', async ({ context, extensionId }) => {
    const page = await openPopup(context, extensionId);

    await setEditorDomains(page, [...BLACKLIST_DOMAINS, 'not a domain']);
    await page.click('#blacklistSave');
    await expect(page.locator('#blacklistStatus')).toHaveAttribute('data-state', 'error');

    const stored = await readStorage(page, [OVERRIDES_KEY]);
    expect(stored[OVERRIDES_KEY], 'a rejected save must not write a partial delta').toBeUndefined();
});

test('restore defaults clears the stored delta', async ({ context, extensionId }) => {
    const page = await openPopup(context, extensionId);

    await setEditorDomains(page, ['videos.example']);
    await page.click('#blacklistSave');
    await expect(page.locator('#blacklistStatus')).toHaveAttribute('data-state', 'success');
    expect((await readStorage(page, [OVERRIDES_KEY]))[OVERRIDES_KEY]).toBeDefined();

    await page.click('#blacklistReset');
    await expect(page.locator('#blacklistStatus')).toHaveAttribute('data-state', 'success');

    const stored = await readStorage(page, [OVERRIDES_KEY, LEGACY_KEY]);
    expect(stored[OVERRIDES_KEY]).toBeUndefined();
    expect(stored[LEGACY_KEY]).toBeUndefined();
    expect(await readEditorDomains(page)).toEqual(BLACKLIST_DOMAINS);
});

test('migrates a pre-v3.1.0 snapshot and delivers defaults it never had', async ({ context, extensionId }) => {
    // A snapshot saved by an older version: the user removed one default and
    // added one of their own. 'reddit.com' stands in for a default that shipped
    // after they saved, so their frozen snapshot simply does not contain it.
    const snapshot = BLACKLIST_DOMAINS
        .filter(domain => domain !== 'imgur.com' && domain !== 'reddit.com')
        .concat(['videos.example']);

    const seed = await openPopup(context, extensionId);
    await writeStorage(seed, { [LEGACY_KEY]: snapshot });
    await seed.close();

    const page = await openPopup(context, extensionId);

    const stored = await readStorage(page, [OVERRIDES_KEY, LEGACY_KEY]);
    expect(stored[LEGACY_KEY], 'the legacy key is cleaned up').toBeUndefined();
    expect(stored[OVERRIDES_KEY].removedDefaults).toEqual(['reddit.com', 'imgur.com']);
    expect(stored[OVERRIDES_KEY].addedDomains).toEqual(['videos.example']);

    const domains = await readEditorDomains(page);
    expect(domains, 'their own entry survives migration').toContain('videos.example');
    expect(domains, 'their removals survive migration').not.toContain('imgur.com');
});

test('the tab list honours a removed default and an added domain', async ({ context, extensionId, baseURL }) => {
    const page = await openPopup(context, extensionId);

    // youtube.com is not a shipped default, so it is visible by default. Adding
    // it must hide it; the fixture host must stay visible either way.
    await setEditorDomains(page, [...BLACKLIST_DOMAINS, 'youtube.com']);
    await page.click('#blacklistSave');
    await expect(page.locator('#blacklistStatus')).toHaveAttribute('data-state', 'success');

    const filtered = await page.evaluate(async ({ fixture }) => {
        const { getEffectiveBlacklistDomains, isUrlBlacklisted } = await import('./shared/blacklist.js');
        const overrides = (await chrome.storage.local.get(['blacklistOverrides'])).blacklistOverrides;
        const domains = getEffectiveBlacklistDomains(overrides);
        return {
            youtube: isUrlBlacklisted('https://www.youtube.com/watch?v=x', domains),
            fixtureHost: isUrlBlacklisted(fixture, domains),
            drive: isUrlBlacklisted('https://drive.google.com/file/d/x/view', domains)
        };
    }, { fixture: `${baseURL}/pages/simple-player.html` });

    expect(filtered.youtube, 'an added domain is filtered').toBe(true);
    expect(filtered.fixtureHost, 'an unrelated host stays visible').toBe(false);
    expect(filtered.drive, 'drive keeps its player-path exception').toBe(false);
});
