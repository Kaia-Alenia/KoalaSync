#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(repoRoot, 'extension/audio-options.js');
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
            onChanged: {
                addListener: () => {}
            }
        }
    },
    document: {
        getElementById: () => makeInput(),
        querySelectorAll: (selector) => selector === '.control-row' ? rows : [makeInput({ value: 'recommended' })]
    },
    setTimeout,
    clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(`${source}
globalThis.__audioSettingsTest = {
    mergeAudioSettings,
    getParamValue,
    setCustomParam,
    get currentSettings() { return currentSettings; }
};`, sandbox, { filename: sourcePath });

const helpers = sandbox.__audioSettingsTest;

assert.doesNotThrow(() => helpers.mergeAudioSettings(null), 'mergeAudioSettings tolerates null storage values');
assert.doesNotThrow(() => helpers.mergeAudioSettings('bad'), 'mergeAudioSettings tolerates non-object storage values');

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

console.log('audio settings tests passed');
