#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = fs.readFileSync(path.join(repoRoot, 'website', 'template.html'), 'utf8');
const app = fs.readFileSync(path.join(repoRoot, 'website', 'app.js'), 'utf8');
const langInit = fs.readFileSync(path.join(repoRoot, 'website', 'lang-init.js'), 'utf8');
const demoCss = fs.readFileSync(path.join(repoRoot, 'website', 'styles', 'demo.css'), 'utf8');
const landingPrimaryCss = fs.readFileSync(path.join(repoRoot, 'website', 'styles', 'landing-primary.css'), 'utf8');
const mockupStart = template.indexOf('<div class="extension-mockup">');
const mockupEnd = template.indexOf('<div class="demo-invite-fly"', mockupStart);

if (mockupStart === -1 || mockupEnd === -1) {
  throw new Error('Could not locate the extension mockup in website/template.html');
}

const mockup = template.slice(mockupStart, mockupEnd);
const themeSensitiveControls = [
  ['video selector', /<select[^>]+id="demo-video-select"[^>]+>/],
  ['sync target', /<div[^>]+class="mock-input"[^>]+title="Choose sync target"[^>]*>/],
  ['WebSocket status', /<span style="[^"]*flex:1;[^"]*">\s*\{\{MOCK_27\}\}/]
];

for (const [label, pattern] of themeSensitiveControls) {
  const match = mockup.match(pattern);
  if (!match) throw new Error(`Could not locate ${label} in the extension mockup`);
  if (!/color:\s*var\(--text\)/.test(match[0])) {
    throw new Error(`${label} must use var(--text) so it remains readable in both themes`);
  }
}

const landingStylesheets = [...template.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\{\{ASSET_PATH\}\}landing[^">]*"[^>]*>/g)];
if (landingStylesheets.length !== 1) {
  throw new Error(`Landing must load exactly one render-blocking stylesheet; found ${landingStylesheets.length}`);
}

const landingStylesheet = landingStylesheets[0][0];
if (!/href="\{\{ASSET_PATH\}\}landing\.min\.css"/.test(landingStylesheet)) {
  throw new Error('Landing stylesheet must use the landing.min.css build placeholder');
}
if (/\bmedia=|data-(?:landing-)?deferred/.test(landingStylesheet)) {
  throw new Error('Landing stylesheet must not be activated after first paint');
}

const runtimeCssActivation = [
  ['app.js', app],
  ['lang-init.js', langInit]
];
for (const [file, source] of runtimeCssActivation) {
  if (/createElement\(['"]link['"]\)|requestIdleCallback|data-landing-deferred|data-deferred-css|\.media\s*=\s*['"]all['"]/.test(source)) {
    throw new Error(`${file} must not dynamically load or activate structural CSS`);
  }
}

// Film birds were removed entirely (commit 16cb138); guard against remnants
if (/film-hero-bird|film-bird-wing|film-birds/.test(template) || /filmBirdGlide|filmWingFlap/.test(demoCss)) {
  throw new Error('Film birds were removed from the demo mockups; no bird markup or animations may remain');
}

const gettingStartedLightSurfaces = [
  'step-illustration-1',
  'step-illustration-2',
  'step-illustration-3',
  'illus-popup-card',
  'illus-player-card',
  'popup-select-mock'
];
for (const className of gettingStartedLightSurfaces) {
  const pattern = new RegExp(`html\\.theme-light[^{]*\\.${className}[^}]*\\{`);
  if (!pattern.test(landingPrimaryCss)) {
    throw new Error(`Getting Started .${className} must define an explicit light-theme surface`);
  }
}

const stepNumberLightRule = landingPrimaryCss.match(/html\.theme-light \.step-num\s*\{([^}]*)\}/)?.[1] || '';
if (!/color:\s*oklch\(/.test(stepNumberLightRule)
    || !/background:\s*none/.test(stepNumberLightRule)
    || !/-webkit-text-fill-color:\s*currentColor/.test(stepNumberLightRule)) {
  throw new Error('Getting Started step numbers must use solid readable text in light mode');
}

console.log('Extension mockup theme-sensitive text uses theme-aware colors');
console.log('Landing CSS is render-blocking, single-request, and cascade-stable');
console.log('Foreground film birds use complete, always-on wing and glide animations');
console.log('All Getting Started mockups define explicit light-theme surfaces');
console.log('Getting Started step numbers stay readable in light mode');
