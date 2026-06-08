import { loadLocale, translateDOM, getSystemLanguage } from './i18n.js';

const PRESETS = {
    recommended: { threshold: -24, ratio: 8, attack: 0.010, release: 0.300, knee: 15 },
    dynamicRange: { threshold: -18, ratio: 4, attack: 0.020, release: 0.200, knee: 10 },
    vocalEnhancement: { threshold: -12, ratio: 3, attack: 0.015, release: 0.150, knee: 5 },
    smooth: { threshold: -30, ratio: 1.5, attack: 0.030, release: 0.250, knee: 20 },
    custom: { threshold: -24, ratio: 12, attack: 0.003, release: 0.250, knee: 30 }
};

const DEFAULT_AUDIO_SETTINGS = {
    enabled: false,
    compressor: {
        enabled: false,
        preset: 'recommended',
        customParams: { ...PRESETS.custom }
    }
};
const PARAM_LIMITS = {
    threshold: { min: -60, max: 0 },
    knee: { min: 0, max: 40 },
    ratio: { min: 1, max: 20 },
    attack: { min: 0, max: 1 },
    release: { min: 0, max: 1 }
};

const elements = {
    audioEnabled: document.getElementById('audioEnabled'),
    compressorEnabled: document.getElementById('compressorEnabled'),
    presetInputs: Array.from(document.querySelectorAll('input[name="preset"]')),
    controlRows: Array.from(document.querySelectorAll('.control-row'))
};

let saveTimer = null;
let isRendering = false;

function cloneDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_AUDIO_SETTINGS));
}

let currentSettings = cloneDefaultSettings();

function mergeAudioSettings(settings = {}) {
    const safeSettings = settings && typeof settings === 'object' ? settings : {};
    const defaults = cloneDefaultSettings();
    return {
        ...defaults,
        ...safeSettings,
        compressor: {
            ...defaults.compressor,
            ...(safeSettings.compressor || {}),
            customParams: {
                ...defaults.compressor.customParams,
                ...(safeSettings.compressor?.customParams || {})
            }
        }
    };
}

function debounceSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        chrome.storage.sync.set({ audioSettings: currentSettings });
    }, 40);
}

function getParamValue(param, value, isMsInput = false) {
    const parsed = Number(value);
    const candidate = Number.isFinite(parsed)
        ? (isMsInput ? parsed / 1000 : parsed)
        : currentSettings.compressor.customParams[param];
    const limits = PARAM_LIMITS[param];
    if (!limits) return candidate;
    return Math.min(limits.max, Math.max(limits.min, candidate));
}

function formatNumber(value, param, isMsInput = false) {
    if (isMsInput) return Math.round(value * 1000);
    if (param === 'ratio') return Number(value).toFixed(1).replace(/\.0$/, '');
    return value;
}

function render() {
    isRendering = true;
    elements.audioEnabled.checked = currentSettings.enabled === true;
    elements.compressorEnabled.checked = currentSettings.compressor.enabled === true;

    const selectedPreset = currentSettings.compressor.preset || 'recommended';
    elements.presetInputs.forEach(input => {
        input.checked = input.value === selectedPreset;
    });

    const params = selectedPreset === 'custom'
        ? currentSettings.compressor.customParams
        : PRESETS[selectedPreset] || PRESETS.recommended;

    elements.controlRows.forEach(row => {
        const param = row.dataset.param;
        const range = row.querySelector('input[type="range"]');
        const number = row.querySelector('input[type="number"]');
        const value = params[param];
        range.value = value;
        number.value = formatNumber(value, param, number.dataset.msInput === 'true');
    });
    isRendering = false;
}

function setPreset(preset) {
    currentSettings.compressor.preset = preset;
    if (preset === 'custom') {
        currentSettings.compressor.customParams = {
            ...PRESETS.custom,
            ...currentSettings.compressor.customParams
        };
    }
    render();
    debounceSave();
}

function setCustomParam(param, value) {
    currentSettings.compressor.preset = 'custom';
    currentSettings.compressor.customParams[param] = getParamValue(param, value);
    render();
    debounceSave();
}

async function init() {
    const syncData = await chrome.storage.sync.get(['audioSettings', 'locale']);
    const lang = syncData.locale || getSystemLanguage();
    await loadLocale(lang);
    translateDOM();

    currentSettings = mergeAudioSettings(syncData.audioSettings);
    render();
}

elements.audioEnabled.addEventListener('change', () => {
    currentSettings.enabled = elements.audioEnabled.checked;
    if (currentSettings.enabled && !currentSettings.compressor.enabled) {
        currentSettings.compressor.enabled = true;
    }
    render();
    debounceSave();
});

elements.compressorEnabled.addEventListener('change', () => {
    currentSettings.compressor.enabled = elements.compressorEnabled.checked;
    if (currentSettings.compressor.enabled) currentSettings.enabled = true;
    render();
    debounceSave();
});

elements.presetInputs.forEach(input => {
    input.addEventListener('change', () => {
        if (input.checked) setPreset(input.value);
    });
});

elements.controlRows.forEach(row => {
    const param = row.dataset.param;
    const range = row.querySelector('input[type="range"]');
    const number = row.querySelector('input[type="number"]');

    range.addEventListener('input', () => {
        if (isRendering) return;
        setCustomParam(param, getParamValue(param, range.value));
    });

    number.addEventListener('input', () => {
        if (isRendering) return;
        setCustomParam(param, getParamValue(param, number.value, number.dataset.msInput === 'true'));
    });
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.audioSettings) return;
    currentSettings = mergeAudioSettings(changes.audioSettings.newValue);
    render();
});

init().catch(err => {
    console.error('[AudioOptions] Failed to initialize:', err);
});
