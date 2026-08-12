#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BLACKLIST_DOMAINS,
    CUSTOM_BLACKLIST_STORAGE_KEY,
    getEffectiveBlacklistDomains,
    isUrlBlacklisted,
    normalizeBlacklistDomain,
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

const popupSource = fs.readFileSync(path.join(repoRoot, 'extension/popup.js'), 'utf8');
assert.match(popupSource, /chrome\.storage\.local\.set\(\{ \[CUSTOM_BLACKLIST_STORAGE_KEY\]: domains \}\)/, 'custom list is saved locally');
assert.doesNotMatch(popupSource, /chrome\.storage\.sync\.set\(\{ \[CUSTOM_BLACKLIST_STORAGE_KEY\]/, 'custom list is never synced');
assert.match(popupSource, /isUrlBlacklisted\(tab\.url, blacklistDomains\)/, 'tab filtering uses the effective custom list');

const popupHtml = fs.readFileSync(path.join(repoRoot, 'extension/popup.html'), 'utf8');
assert.match(popupHtml, /id="blacklistDomains"/, 'settings UI contains the editable domain list');
assert.match(popupHtml, /id="blacklistReset"/, 'settings UI contains a defaults reset');

console.log('blacklist settings tests passed');
