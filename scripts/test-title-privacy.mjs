import assert from 'node:assert/strict';
import {
    TITLE_PRIVACY_MODES,
    applyTitlePrivacyToPayload,
    normalizeSendTabTitle,
    normalizeTitlePrivacyMode,
    sanitizeSharedTitle,
    sanitizeTabTitle
} from '../extension/title-privacy.js';

assert.equal(normalizeTitlePrivacyMode(undefined), TITLE_PRIVACY_MODES.FULL);
assert.equal(normalizeTitlePrivacyMode('unknown'), TITLE_PRIVACY_MODES.FULL);
assert.equal(normalizeTitlePrivacyMode(TITLE_PRIVACY_MODES.HIDDEN), TITLE_PRIVACY_MODES.HIDDEN);
assert.equal(normalizeSendTabTitle(undefined, TITLE_PRIVACY_MODES.FULL), true);
assert.equal(normalizeSendTabTitle(undefined, TITLE_PRIVACY_MODES.EPISODE), false);
assert.equal(normalizeSendTabTitle(true, TITLE_PRIVACY_MODES.HIDDEN), true);
assert.equal(normalizeSendTabTitle(false, TITLE_PRIVACY_MODES.FULL), false);

assert.equal(sanitizeTabTitle('Private Tab', true), 'Private Tab');
assert.equal(sanitizeTabTitle('Private Tab', false), null);
assert.equal(sanitizeTabTitle('', true), null);

assert.equal(sanitizeSharedTitle('Example Movie', 'full'), 'Example Movie');
assert.equal(sanitizeSharedTitle('', 'full'), null);
assert.equal(sanitizeSharedTitle(null, 'full'), null);

assert.equal(sanitizeSharedTitle('Show Name - S01/E04 - Title', 'episode'), 'S01E04');
assert.equal(sanitizeSharedTitle('Folge 7 - Private Server', 'episode'), 'EP007');
assert.equal(sanitizeSharedTitle('Example Movie', 'episode'), null);

assert.equal(sanitizeSharedTitle('Show Name - S01E04', 'hidden'), null);
assert.equal(sanitizeSharedTitle('Private Tab Title', 'hidden'), null);

assert.deepEqual(
    applyTitlePrivacyToPayload({
        tabTitle: 'Private Jellyfin - S01E04',
        mediaTitle: 'Show Name - S01E04',
        currentTime: 42
    }, 'episode'),
    {
        tabTitle: 'Private Jellyfin - S01E04',
        mediaTitle: 'S01E04',
        currentTime: 42
    },
    'media privacy must not rewrite tabTitle'
);

assert.deepEqual(
    applyTitlePrivacyToPayload({
        tabTitle: 'Private Jellyfin - S01E04',
        status: 'heartbeat'
    }, 'episode'),
    {
        tabTitle: 'Private Jellyfin - S01E04',
        status: 'heartbeat'
    },
    'media privacy must not rewrite tabTitle or add absent media keys'
);

assert.deepEqual(
    applyTitlePrivacyToPayload({
        tabTitle: 'Private Tab',
        mediaTitle: 'Private Media',
        expectedTitle: 'S01E04',
        title: 'S01E04'
    }, 'hidden'),
    {
        tabTitle: 'Private Tab',
        mediaTitle: null,
        expectedTitle: null,
        title: null
    },
    'hidden media privacy must not clear tabTitle'
);

console.log('title-privacy tests passed');
