#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = fs.readFileSync(path.join(repoRoot, 'website', 'template.html'), 'utf8');
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

console.log('Extension mockup theme-sensitive text uses theme-aware colors');
