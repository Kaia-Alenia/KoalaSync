#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [
  ['server ops', 'node', ['scripts/test-server-ops.mjs']],
  ['server routes', 'node', ['scripts/test-server-routes.mjs'], {
    env: { ADMIN_METRICS_TOKEN: 'verify-admin-token-with-more-than-32-chars' }
  }],
  ['content video finder', 'node', ['scripts/test-content-video-finder.js']],
  ['audio settings', 'node', ['scripts/test-audio-settings.mjs']],
  ['popup refresh cooldown', 'node', ['scripts/test-popup-refresh-cooldown.mjs']],
  ['server syntax index', 'node', ['-c', 'server/index.js']],
  ['server syntax ops', 'node', ['-c', 'server/ops.js']],
  ['content syntax', 'node', ['-c', 'extension/content.js']],
  ['popup syntax', 'node', ['-c', 'extension/popup.js']],
  ['background syntax', 'node', ['-c', 'extension/background.js']],
  ['locale coverage', 'node', ['scripts/test-locales.js']],
  ['lint', 'npm', ['run', 'lint']],
  ['root production audit', 'npm', ['audit', '--omit=dev']],
  ['server production audit', 'npm', ['audit', '--omit=dev'], { cwd: path.join(repoRoot, 'server') }],
  ['extension build', 'npm', ['run', 'build:extension']],
  ['website build', 'node', ['website/build.js']]
];

function runCheck([label, command, args, options = {}]) {
  return new Promise((resolve, reject) => {
    console.log(`\n==> ${label}`);
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...(options.env || {}) },
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

for (const check of checks) {
  await runCheck(check);
}

console.log('\nRelease verification passed');
