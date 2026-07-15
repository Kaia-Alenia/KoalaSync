#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const template = read('website/template.html');
const foundationCss = read('website/styles/foundation.css');
const supportCss = read('website/styles/support.css');
const helpPage = read('website/site-access-help.html');
const build = read('website/build.cjs');
const localesDir = path.join(repoRoot, 'website', 'locales');

assert.equal((template.match(/class="site-access-banner"/g) || []).length, 1,
    'localized landing template must contain exactly one support banner');
assert.match(template, /href="\/site-access-help\.html"/,
    'every compiled language must link to the English root help page');
assert.match(template, /\{\{SUPPORT_BANNER_TEXT\}\}/);
assert.match(template, /\{\{SUPPORT_BANNER_CTA\}\}/);
assert.match(foundationCss, /\.site-access-banner\s*\{/,
    'landing bundle must style the support banner without deferred CSS');

for (const file of fs.readdirSync(localesDir).filter(file => file.endsWith('.json'))) {
    const locale = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
    assert.ok(locale.SUPPORT_BANNER_TEXT?.trim(), `${file} is missing SUPPORT_BANNER_TEXT`);
    assert.ok(locale.SUPPORT_BANNER_CTA?.trim(), `${file} is missing SUPPORT_BANNER_CTA`);
}

assert.match(helpPage, /<html lang="en"/);
assert.match(helpPage, /rel="canonical" href="https:\/\/sync\.koalastuff\.net\/site-access-help\.html"/);
assert.doesNotMatch(helpPage, /\{\{[A-Z0-9_-]+\}\}/,
    'English-only static help page must not contain unresolved template placeholders');
assert.match(helpPage, /Access requested/,
    'help page must explain the new Chromium access-request UI');
assert.match(helpPage, /Firefox/,
    'help page must include Firefox-specific recovery instructions');
assert.doesNotMatch(helpPage, /Peers \(1\)|Separate issue/,
    'website-access help must not include unrelated relay troubleshooting');
assert.match(helpPage, /video and audio stream never leave your browser/,
    'help page must explain the privacy boundary of the permission');
assert.match(helpPage, /support\.google\.com\/chrome/);
assert.match(helpPage, /support\.mozilla\.org/);
assert.match(supportCss, /html\.theme-light \.support-card/,
    'support cards must define a readable light-theme surface');

assert.match(build, /\{ src: 'site-access-help\.html', dest: 'site-access-help\.html' \}/,
    'website build must copy the help page to the root output');
assert.match(build, /'styles\/support\.css'/,
    'website build must include support page styles in style.min.css');
assert.match(build, /https:\/\/sync\.koalastuff\.net\/site-access-help\.html/,
    'sitemap must include the English-only help page');

console.log('Site-access help page and localized landing banner are complete');
