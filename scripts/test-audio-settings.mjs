#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(repoRoot, 'extension/audio-options.js');
const contentPath = path.join(repoRoot, 'extension/content.js');
const htmlPath = path.join(repoRoot, 'extension/audio-options.html');
const source = fs.readFileSync(sourcePath, 'utf8')
    .replace("import { loadLocale, translateDOM, getSystemLanguage } from './i18n.js';", '')
    .replace(/init\(\)\.catch[\s\S]*?;\n?$/, '');

function makeInput(overrides = {}) {
    return {
        checked: false,
        value: '',
        dataset: {},
        addEventListener() {},
        ...overrides
    };
}

const rows = [
    ['threshold', '-60', '0', '1', false],
    ['knee', '0', '40', '1', false],
    ['ratio', '1', '20', '0.5', false],
    ['attack', '0', '1', '0.001', true],
    ['release', '0', '1', '0.005', true]
].map(([param, min, max, step, ms]) => {
    const range = makeInput({ value: '0', min, max, step });
    const number = makeInput({ value: '0', min: ms ? '0' : min, max: ms ? '1000' : max, step, dataset: ms ? { msInput: 'true' } : {} });
    return {
        dataset: { param },
        querySelector(selector) {
            return selector === 'input[type="range"]' ? range : number;
        }
    };
});

const sandbox = {
    console,
    loadLocale: async () => {},
    translateDOM: () => {},
    getSystemLanguage: () => 'en',
    chrome: {
        storage: {
            sync: {
                get: async () => ({}),
                set: () => {},
            },
            local: {
                get: async () => ({}),
                set: () => {},
            },
            onChanged: {
                addListener: () => {}
            }
        }
    },
    document: {
        getElementById: () => makeInput(),
        querySelectorAll: (selector) => selector === '.control-row[data-param]' ? rows : [makeInput({ value: 'recommended' })]
    },
    window: {
        addEventListener: () => {},
        close: () => {}
    },
    setTimeout,
    clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(`${source}
globalThis.__audioSettingsTest = {
    mergeAudioSettings,
    normalizeBoostDb,
    getParamValue,
    setBoostDb,
    setCustomParam,
    get currentSettings() { return currentSettings; }
};`, sandbox, { filename: sourcePath });

const helpers = sandbox.__audioSettingsTest;

assert.doesNotThrow(() => helpers.mergeAudioSettings(null), 'mergeAudioSettings tolerates null storage values');
assert.doesNotThrow(() => helpers.mergeAudioSettings('bad'), 'mergeAudioSettings tolerates non-object storage values');
assert.equal(helpers.normalizeBoostDb(-5), 0, 'boost clamps to 0 dB minimum');
assert.equal(helpers.normalizeBoostDb(99), 20, 'boost clamps to 20 dB maximum');
assert.equal(helpers.normalizeBoostDb(7.26), 7.5, 'boost rounds to half-decibel steps');
assert.equal(helpers.normalizeBoostDb('bad'), 0, 'invalid boost falls back to 0 dB');
assert.equal(helpers.mergeAudioSettings({ boostDb: 8 }).boostDb, 8, 'boost persists independently of compressor');

assert.equal(helpers.getParamValue('threshold', '-999'), -60, 'threshold clamps to minimum');
assert.equal(helpers.getParamValue('threshold', '999'), 0, 'threshold clamps to maximum');
assert.equal(helpers.getParamValue('knee', '-1'), 0, 'knee clamps to minimum');
assert.equal(helpers.getParamValue('knee', '100'), 40, 'knee clamps to maximum');
assert.equal(helpers.getParamValue('ratio', '0'), 1, 'ratio clamps to minimum');
assert.equal(helpers.getParamValue('ratio', '999'), 20, 'ratio clamps to maximum');
assert.equal(helpers.getParamValue('attack', '-1', true), 0, 'attack ms input clamps to minimum seconds');
assert.equal(helpers.getParamValue('attack', '5000', true), 1, 'attack ms input clamps to maximum seconds');
assert.equal(helpers.getParamValue('release', '-1', true), 0, 'release ms input clamps to minimum seconds');
assert.equal(helpers.getParamValue('release', '5000', true), 1, 'release ms input clamps to maximum seconds');

helpers.setCustomParam('threshold', 999);
assert.equal(helpers.currentSettings.compressor.customParams.threshold, 0, 'setCustomParam stores clamped values');

helpers.setBoostDb(6);
assert.equal(helpers.currentSettings.boostDb, 6, 'setBoostDb stores the normalized boost');
assert.equal(helpers.currentSettings.enabled, true, 'positive boost enables audio processing');
helpers.setBoostDb(0);
assert.equal(helpers.currentSettings.enabled, false, 'zero boost disables processing when compressor is off');

const contentSource = fs.readFileSync(contentPath, 'utf8');
assert.match(contentSource, /const outputGain = ctx\.createGain\(\)/, 'content chain creates a shared output gain');
assert.match(contentSource, /const limiter = ctx\.createDynamicsCompressor\(\)/, 'content chain creates a post-boost limiter');
assert.match(contentSource, /outputGain\.connect\(limiter\)/, 'boost output feeds the limiter');
assert.match(contentSource, /limiter\.connect\(ctx\.destination\)/, 'limiter feeds the audio destination');
assert.match(contentSource, /chain\.limiter\.threshold\.setValueAtTime\(0, t\)/, 'audio bypass resets the limiter ceiling');
assert.match(contentSource, /Math\.pow\(10, boostDb \/ 20\)/, 'content chain converts decibels to linear gain');
assert.match(contentSource, /changes\.audioSettings\.newValue/, 'content updates active video when local audio settings change');
assert.match(source, /querySelectorAll\('\.control-row\[data-param\]'\)/, 'boost row is excluded from compressor parameter handling');
assert.match(source, /await flushPendingSave\(\);[\s\S]*?window\.close\(\)/, 'back navigation flushes the final audio setting');

const htmlSource = fs.readFileSync(htmlPath, 'utf8');
assert.match(htmlSource, /id="boostRange"[^>]+max="20"[^>]+step="0\.5"/, 'audio UI exposes a bounded half-decibel boost slider');

console.log('audio settings tests passed');
