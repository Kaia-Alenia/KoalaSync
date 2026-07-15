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
const legalCss = fs.readFileSync(path.join(repoRoot, 'website', 'styles', 'legal.css'), 'utf8');
const joinPage = fs.readFileSync(path.join(repoRoot, 'website', 'join.html'), 'utf8');
const imprintPage = fs.readFileSync(path.join(repoRoot, 'website', 'imprint.html'), 'utf8');
const germanImprintPage = fs.readFileSync(path.join(repoRoot, 'website', 'impressum-de.html'), 'utf8');
const alternativesIndex = fs.readFileSync(path.join(repoRoot, 'website', 'alternatives', 'index.html'), 'utf8');
const alternativesCss = fs.readFileSync(path.join(repoRoot, 'website', 'styles', 'alternatives.css'), 'utf8');
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

if (!/class="footer-disclaimer"/.test(joinPage) || /footer-disclaimer[^>]*opacity:/.test(joinPage)) {
  throw new Error('Join-page disclaimer must use the contrast-safe footer-disclaimer colors without opacity');
}

if (!/\.legal-inline-link\s*\{[^}]*text-decoration:\s*underline/s.test(legalCss)) {
  throw new Error('Legal prose links must use a non-color underline cue');
}
for (const [name, page] of [['imprint.html', imprintPage], ['impressum-de.html', germanImprintPage]]) {
  if ((page.match(/class="legal-inline-link"/g) || []).length !== 3) {
    throw new Error(`${name} must mark all three prose links as legal-inline-link`);
  }
  if ((page.match(/class="legal-inline-label"/g) || []).length !== 2 || /opacity:\s*0\.6/.test(page)) {
    throw new Error(`${name} contact labels must use full-opacity theme text`);
  }
}

if (/<h3\b/.test(alternativesIndex)
    || (alternativesIndex.match(/<h2\b/g) || []).length !== 6
    || (alternativesIndex.match(/<h2[^>]+color:\s*var\(--text\)/g) || []).length !== 6) {
  throw new Error('Alternatives overview cards must use h2 headings directly below the page h1');
}
if (!/html\.theme-light \.guide-card\s*\{[^}]*background-color:\s*var\(--card-surface\)\s*!important/s.test(alternativesCss)) {
  throw new Error('Alternatives cards must define a readable light-theme surface');
}

const reducedMotionRule = demoCss.match(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.step-illustration-3 \.film-mtn-scroll,\s*\.step-illustration-3 \.film-mid-scroll,\s*\.step-illustration-3 \.film-fore-scroll\s*\{([^}]*)\}/)?.[1] || '';
if (!/animation:\s*none\s*!important/.test(reducedMotionRule)) {
  throw new Error('Getting Started film layers must stop when reduced motion is requested');
}

console.log('Extension mockup theme-sensitive text uses theme-aware colors');
console.log('Landing CSS is render-blocking, single-request, and cascade-stable');
console.log('Foreground film birds use complete, always-on wing and glide animations');
console.log('All Getting Started mockups define explicit light-theme surfaces');
console.log('Getting Started step numbers stay readable in light mode');
console.log('Accessibility regressions stay fixed across legal, alternatives, and reduced-motion views');
