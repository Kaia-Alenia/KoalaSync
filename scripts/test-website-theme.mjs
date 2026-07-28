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
const helpPage = fs.readFileSync(path.join(repoRoot, 'website', 'help.html'), 'utf8');
const siteAccessHelpPage = fs.readFileSync(path.join(repoRoot, 'website', 'site-access-help.html'), 'utf8');
const websiteBuild = fs.readFileSync(path.join(repoRoot, 'website', 'build.cjs'), 'utf8');
const imprintPage = fs.readFileSync(path.join(repoRoot, 'website', 'imprint.html'), 'utf8');
const germanImprintPage = fs.readFileSync(path.join(repoRoot, 'website', 'impressum-de.html'), 'utf8');
const privacyPage = fs.readFileSync(path.join(repoRoot, 'website', 'privacy.html'), 'utf8');
const germanPrivacyPage = fs.readFileSync(path.join(repoRoot, 'website', 'datenschutz-de.html'), 'utf8');
const alternativesIndex = fs.readFileSync(path.join(repoRoot, 'website', 'alternatives', 'index.html'), 'utf8');
const alternativesCss = fs.readFileSync(path.join(repoRoot, 'website', 'styles', 'alternatives.css'), 'utf8');
const llmsText = fs.readFileSync(path.join(repoRoot, 'website', 'llms.txt'), 'utf8');
const websiteVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, 'website', 'version.json'), 'utf8')).version;
const mockupStart = template.indexOf('<div class="extension-mockup">');
const mockupEnd = template.indexOf('<div class="demo-invite-fly"', mockupStart);

if (mockupStart === -1 || mockupEnd === -1) {
  throw new Error('Could not locate the extension mockup in website/template.html');
}

const mockup = template.slice(mockupStart, mockupEnd);

const privacyChatContracts = [
  [privacyPage, 'English', [
    'end-to-end encrypted in the browser extension before transmission',
    '256-bit AES-GCM key',
    'the relay does not receive the chat secret',
    'does not create a server-side chat history',
    'maximum of 200 visible message or activity entries',
    "browser's notification API"
  ]],
  [germanPrivacyPage, 'German', [
    'vor der Übertragung Ende-zu-Ende verschlüsselt',
    '256-Bit-Schlüssel für AES-GCM',
    'der Relay das Chat-Secret nicht erhält',
    'keine serverseitige Chat-Historie',
    'höchstens 200 Nachrichten- oder Aktivitätseinträge',
    'Benachrichtigungs-API des Browsers'
  ]]
];
for (const [page, language, statements] of privacyChatContracts) {
  for (const statement of statements) {
    if (!page.includes(statement)) {
      throw new Error(`${language} privacy policy is missing encrypted-chat disclosure: ${statement}`);
    }
  }
}
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

const llmsLinks = [...template.matchAll(/<link\b[^>]*\brel="alternate"[^>]*\btype="text\/markdown"[^>]*\bhref="https:\/\/sync\.koalastuff\.net\/llms\.txt"[^>]*>/g)];
if (llmsLinks.length !== 1) {
  throw new Error(`Landing head must link exactly one canonical llms.txt document; found ${llmsLinks.length}`);
}

const requiredLlmsSections = [
  '## Quick fit assessment',
  '## How it works',
  '## Privacy and security',
  '## Supported environments',
  '## Install KoalaSync',
  '## Technical information'
];
for (const section of requiredLlmsSections) {
  if (!llmsText.includes(section)) throw new Error(`llms.txt is missing ${section}`);
}
if (/\bWebRTC\b|\bport 54000\b|peer-to-peer by design/i.test(llmsText)) {
  throw new Error('llms.txt must describe the current WebSocket relay architecture without obsolete WebRTC or port claims');
}
if (!llmsText.includes('- built-in voice, video or webcam chat') || llmsText.includes('- built-in text, voice or webcam chat')) {
  throw new Error('llms.txt must distinguish built-in encrypted text chat from unsupported voice, video or webcam chat');
}
if (!llmsText.includes(`Current website release: ${websiteVersion}`)) {
  throw new Error(`llms.txt release must match website/version.json (${websiteVersion})`);
}
const requiredSupportSocialMetadata = [
  'name="twitter:card" content="summary_large_image"',
  'name="twitter:title"',
  'name="twitter:description"',
  'name="twitter:image"',
  '"datePublished"',
  '"dateModified"',
  '"mainEntityOfPage"'
];
for (const metadata of requiredSupportSocialMetadata) {
  if (!siteAccessHelpPage.includes(metadata)) {
    throw new Error(`site-access-help.html is missing SEO metadata: ${metadata}`);
  }
}
const requiredHelpMetadata = [
  '<link rel="canonical" href="https://sync.koalastuff.net/help">',
  'type="text/markdown" href="https://sync.koalastuff.net/llms.txt"',
  'name="twitter:card" content="summary_large_image"',
  'property="og:image:alt"',
  'name="twitter:image:alt"',
  '"@type": ["CollectionPage", "FAQPage"]',
  '"@type": "BreadcrumbList"',
  '"datePublished"',
  '"dateModified"'
];
for (const metadata of requiredHelpMetadata) {
  if (!helpPage.includes(metadata)) {
    throw new Error(`help.html is missing SEO/AEO metadata: ${metadata}`);
  }
}
if (!llmsText.includes('[Help Center](https://sync.koalastuff.net/help)')
    || !llmsText.includes('[Website access guide](https://sync.koalastuff.net/site-access-help.html)')) {
  throw new Error('llms.txt must expose the Help Center and website-access guide');
}
if (!websiteBuild.includes("['log', '-1', '--format=%cs', '--', ...sourceFiles]")
    || !websiteBuild.includes("lastmod(['website/help.html', 'website/styles/support.css'])")
    || !websiteBuild.includes("lastmod(['website/site-access-help.html'])")
    || !websiteBuild.includes("['rev-parse', '--is-shallow-repository']")
    || !websiteBuild.includes("['diff', '--name-only', '--']")
    || !websiteBuild.includes("['diff', '--cached', '--name-only', '--']")
    || !websiteBuild.includes("['ls-files', '--others', '--exclude-standard', '--']")
    || !websiteBuild.includes('sourceFiles.some(file => dirtySourceFiles.has(file))')) {
  throw new Error('Sitemap lastmod values must come from the mapped source files in Git');
}
const documentedRelayUrls = [...llmsText.matchAll(/`(wss:\/\/[^`\s]+)`/g)].map(([, value]) => new URL(value));
const hasCanonicalPublicRelay = documentedRelayUrls.some((url) => (
  url.protocol === 'wss:' &&
  url.hostname === 'syncserver.koalastuff.net' &&
  url.port === '' &&
  url.pathname === '/' &&
  url.search === '' &&
  url.hash === ''
));
if (!hasCanonicalPublicRelay || !llmsText.includes('internally on port 3000')) {
  throw new Error('llms.txt must distinguish the public TLS relay URL from the internal self-hosting port');
}

const selfHostingStart = template.indexOf('<div id="pane-docker"');
const selfHostingEnd = template.indexOf('</section>', selfHostingStart);
if (selfHostingStart === -1 || selfHostingEnd === -1) {
  throw new Error('Could not locate the self-hosting examples in website/template.html');
}
const selfHostingExamples = template.slice(selfHostingStart, selfHostingEnd);
const requiredSelfHostingValues = [
  'SERVER_SALT:',
  'REPLACE_WITH_OPENSSL_RAND_BASE64_32_OUTPUT',
  'ADMIN_METRICS_TOKEN:',
  'DEBUG_LOGGING:',
  '127.0.0.1:3000:3000'
];
for (const value of requiredSelfHostingValues) {
  if (!selfHostingExamples.includes(value)) {
    throw new Error(`Website self-hosting compose example is missing ${value}`);
  }
}
if ((selfHostingExamples.match(/localhost:3000/g) || []).length !== 2 || selfHostingExamples.includes('KoalaSync:3000')) {
  throw new Error('Both Caddy examples must match the compose loopback port binding');
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
  if (!/rel="canonical" href="https:\/\/koalastuff\.net\/legal"/.test(page)
      || !/href="https:\/\/koalastuff\.net\/legal"/.test(page)) {
    throw new Error(`${name} must point to the central KoalaStuff legal notice`);
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
console.log('Landing head discovers a complete and architecture-accurate llms.txt');
console.log('Support-page social metadata and Git-derived sitemap dates remain truthful');
console.log('Website self-hosting examples include production secrets and consistent networking');
console.log('Foreground film birds use complete, always-on wing and glide animations');
console.log('All Getting Started mockups define explicit light-theme surfaces');
console.log('Getting Started step numbers stay readable in light mode');
console.log('Accessibility regressions stay fixed across legal, alternatives, and reduced-motion views');
