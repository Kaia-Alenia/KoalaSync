#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BLACKLIST_DOMAINS,
    BLACKLIST_OVERRIDES_STORAGE_KEY,
    BLACKLIST_SOURCE_DEFAULT,
    BLACKLIST_SOURCE_USER,
    CUSTOM_BLACKLIST_STORAGE_KEY,
    createEmptyBlacklistOverrides,
    deriveBlacklistOverrides,
    getBlacklistEntries,
    getEffectiveBlacklistDomains,
    isUrlBlacklisted,
    normalizeBlacklistDomain,
    normalizeBlacklistOverrides,
    parseBlacklistDomains
} from '../shared/blacklist.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(CUSTOM_BLACKLIST_STORAGE_KEY, 'customBlacklistDomains');
assert.equal(normalizeBlacklistDomain(' Example.COM. '), 'example.com');
assert.equal(normalizeBlacklistDomain('https://Video.Example.com/watch/123'), 'video.example.com');
assert.equal(normalizeBlacklistDomain('*.example.com'), null, 'wildcards are rejected');
assert.equal(normalizeBlacklistDomain('not a domain'), null, 'spaces are rejected');

const parsed = parseBlacklistDomains('Example.com\nhttps://sub.example.com/path\nexample.com\n');
assert.deepEqual(parsed.domains, ['example.com', 'sub.example.com'], 'domains are normalized and deduplicated');
assert.deepEqual(parsed.invalid, []);

const invalid = parseBlacklistDomains('example.com\nnot a domain');
assert.deepEqual(invalid.invalid, ['not a domain'], 'invalid entries are reported without partial silent saves');

assert.deepEqual(getEffectiveBlacklistDomains(undefined), BLACKLIST_DOMAINS, 'missing local setting uses shipped defaults');
assert.deepEqual(getEffectiveBlacklistDomains([]), [], 'an explicitly empty local list stays empty');
assert.equal(isUrlBlacklisted('https://mail.google.com/inbox', ['google.com']), true, 'subdomains match a parent domain');
assert.equal(isUrlBlacklisted('https://notgoogle.com/', ['google.com']), false, 'lookalike domains do not match');
assert.equal(isUrlBlacklisted('not a url', ['example.com']), false, 'invalid URLs are ignored');

// --- Delta storage: shipped defaults keep flowing in after the user edits ---

assert.equal(BLACKLIST_OVERRIDES_STORAGE_KEY, 'blacklistOverrides');
assert.deepEqual(createEmptyBlacklistOverrides(), { removedDefaults: [], addedDomains: [] });

// A user who removes two defaults and adds one of their own.
const edited = BLACKLIST_DOMAINS
    .filter(domain => domain !== 'reddit.com' && domain !== 'imgur.com')
    .concat(['videos.example']);
const overrides = deriveBlacklistOverrides(edited);
assert.deepEqual(overrides.removedDefaults, ['reddit.com', 'imgur.com'], 'only the removed defaults are stored');
assert.deepEqual(overrides.addedDomains, ['videos.example'], 'only the added domains are stored');

const effective = getEffectiveBlacklistDomains(overrides);
const effectiveDomains = new Set(effective);
assert.equal(effectiveDomains.has('reddit.com'), false, 'a removed default stays removed');
assert.equal(effectiveDomains.has('videos.example'), true, 'an added domain stays added');

// The property that makes newly shipped defaults reach existing users: every
// shipped domain the user did not explicitly remove is part of the result, so a
// default added in a later version cannot be missing from a stored delta.
const removedSet = new Set(overrides.removedDefaults);
for (const domain of BLACKLIST_DOMAINS) {
    assert.equal(
        effectiveDomains.has(domain) || removedSet.has(domain),
        true,
        `shipped default ${domain} must be present unless explicitly removed`
    );
}

// Legacy full-list snapshots migrate to the delta form.
assert.deepEqual(
    deriveBlacklistOverrides(edited),
    normalizeBlacklistOverrides(overrides),
    'a legacy snapshot produces the same delta'
);
assert.deepEqual(getEffectiveBlacklistDomains(undefined), BLACKLIST_DOMAINS, 'no stored delta uses shipped defaults');
assert.deepEqual(getEffectiveBlacklistDomains([]), [], 'a legacy empty snapshot still means no filtering');

// Re-adding a removed default clears the removal instead of stacking state.
const readded = deriveBlacklistOverrides(effective.concat(['reddit.com']), overrides);
const readdedRemovedDefaults = new Set(readded.removedDefaults);
assert.equal(readdedRemovedDefaults.has('reddit.com'), false, 're-adding a default clears its removal');

// A domain the user added explicitly stays tagged as theirs even once the same
// domain ships as a default, so dropping the default does not drop their entry.
const stillUser = deriveBlacklistOverrides(['google.com'], { removedDefaults: [], addedDomains: ['google.com'] });
assert.deepEqual(stillUser.addedDomains, ['google.com'], 'an explicit addition survives becoming a default');

// Contradictory stored state resolves in favour of the addition.
assert.deepEqual(
    normalizeBlacklistOverrides({ removedDefaults: ['example.com'], addedDomains: ['example.com'] }),
    { removedDefaults: [], addedDomains: ['example.com'] },
    'a domain cannot be removed and added at once'
);
assert.deepEqual(normalizeBlacklistOverrides('nonsense'), createEmptyBlacklistOverrides(), 'garbage storage falls back to defaults');

// Entries are tagged so the editor can show what came from where.
const entries = getBlacklistEntries(overrides);
assert.equal(entries.find(e => e.domain === 'videos.example').source, BLACKLIST_SOURCE_USER);
assert.equal(entries.find(e => e.domain === 'google.com').source, BLACKLIST_SOURCE_DEFAULT);

// Comment lines are editor notes, not domains, and never count as invalid.
const withComments = parseBlacklistDomains('# your entries\nvideos.example\n\n#shipped defaults\ngoogle.com');
assert.deepEqual(withComments.domains, ['videos.example', 'google.com'], 'comment lines are skipped');
assert.deepEqual(withComments.invalid, [], 'comment lines are not reported as invalid');

// Round trip through the grouped editor body: rendering with comment headers
// and saving it again must not change the stored delta.
const rendered = [
    '# Your entries',
    ...entries.filter(e => e.source === BLACKLIST_SOURCE_USER).map(e => e.domain),
    '',
    '# Shipped defaults',
    ...entries.filter(e => e.source === BLACKLIST_SOURCE_DEFAULT).map(e => e.domain)
].join('\n');
const roundTripped = parseBlacklistDomains(rendered);
assert.deepEqual(roundTripped.invalid, [], 'the rendered editor body contains no invalid entries');
assert.deepEqual(
    deriveBlacklistOverrides(roundTripped.domains, overrides),
    normalizeBlacklistOverrides(overrides),
    'render then save leaves the delta unchanged'
);

const popupSource = fs.readFileSync(path.join(repoRoot, 'extension/popup.js'), 'utf8');
assert.match(popupSource, /chrome\.storage\.local\.set\(\{ \[BLACKLIST_OVERRIDES_STORAGE_KEY\]: overrides \}\)/, 'the delta is saved locally');
assert.doesNotMatch(popupSource, /chrome\.storage\.sync\.set\(\{ \[(?:BLACKLIST_OVERRIDES|CUSTOM_BLACKLIST)_STORAGE_KEY\]/, 'the list is never synced');
assert.match(popupSource, /chrome\.storage\.local\.remove\(CUSTOM_BLACKLIST_STORAGE_KEY\)/, 'the legacy snapshot is cleaned up after migration');
assert.match(popupSource, /isUrlBlacklisted\(tab\.url, blacklistDomains\)/, 'tab filtering uses the effective custom list');

// A broad parent domain must not hide a host with a dedicated player path,
// but an exact user entry for that host still filters it.
assert.equal(isUrlBlacklisted('https://drive.google.com/file/d/x/view', BLACKLIST_DOMAINS), false);
assert.equal(isUrlBlacklisted('https://drive.google.com/file/d/x/view', ['drive.google.com']), true);
assert.equal(isUrlBlacklisted('https://docs.google.com/document/d/x', BLACKLIST_DOMAINS), true);
assert.equal(isUrlBlacklisted('https://mail.google.com/mail/u/0', BLACKLIST_DOMAINS), true);

const popupHtml = fs.readFileSync(path.join(repoRoot, 'extension/popup.html'), 'utf8');
assert.match(popupHtml, /id="blacklistDomains"/, 'settings UI contains the editable domain list');
assert.match(popupHtml, /id="blacklistReset"/, 'settings UI contains a defaults reset');

console.log('blacklist settings tests passed');
