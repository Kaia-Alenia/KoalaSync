import assert from 'node:assert/strict';
import {
    TITLE_PRIVACY_MODES,
    applyTitlePrivacyToPayload,
    normalizeTitlePrivacyMode,
    sanitizeSharedTitle
} from '../extension/title-privacy.js';

assert.equal(normalizeTitlePrivacyMode(undefined), TITLE_PRIVACY_MODES.FULL);
assert.equal(normalizeTitlePrivacyMode('unknown'), TITLE_PRIVACY_MODES.FULL);
assert.equal(normalizeTitlePrivacyMode(TITLE_PRIVACY_MODES.HIDDEN), TITLE_PRIVACY_MODES.HIDDEN);

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
        tabTitle: 'S01E04',
        mediaTitle: 'S01E04',
        currentTime: 42
    }
);

assert.deepEqual(
    applyTitlePrivacyToPayload({
        tabTitle: 'Private Jellyfin - S01E04',
        status: 'heartbeat'
    }, 'episode'),
    {
        tabTitle: 'S01E04',
        status: 'heartbeat'
    },
    'privacy filtering must not add absent title keys'
);

assert.deepEqual(
    applyTitlePrivacyToPayload({
        tabTitle: 'Private Tab',
        mediaTitle: 'Private Media',
        expectedTitle: 'S01E04',
        title: 'S01E04'
    }, 'hidden'),
    {
        tabTitle: null,
        mediaTitle: null,
        expectedTitle: null,
        title: null
    }
);

console.log('title-privacy tests passed');
