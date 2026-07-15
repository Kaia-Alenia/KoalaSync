/**
 * Shared helpers for the country-flag font subset.
 * Used by build.cjs (validation) and tools/subset-flag-font.mjs (generation).
 *
 * Flags are regional-indicator pairs; tag-sequence flags (🏴 England etc.)
 * are NOT extracted or subset — if one is ever added it will render via the
 * system emoji font.
 */
const fs = require('fs');
const path = require('path');

const FLAG_PAIR_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

function collectFlagSourceFiles(websiteDir) {
    const files = [];
    for (const entry of fs.readdirSync(websiteDir)) {
        if (entry.endsWith('.html')) files.push(path.join(websiteDir, entry));
    }
    for (const dir of ['alternatives', 'locales']) {
        const p = path.join(websiteDir, dir);
        if (!fs.existsSync(p)) continue;
        for (const entry of fs.readdirSync(p)) {
            if (/\.(html|json)$/.test(entry)) files.push(path.join(p, entry));
        }
    }
    return files;
}

function extractUsedFlags(files) {
    const flags = new Set();
    for (const file of files) {
        for (const m of fs.readFileSync(file, 'utf8').matchAll(FLAG_PAIR_RE)) {
            flags.add(m[0]);
        }
    }
    return [...flags].sort();
}

// 🇩🇪 → "DE" (for readable manifests and tool output)
function flagToCountryCode(flag) {
    return [...flag].map(c => String.fromCharCode(c.codePointAt(0) - 0x1F1E6 + 65)).join('');
}

function countryCodeToFlag(code) {
    return [...code].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

module.exports = { FLAG_PAIR_RE, collectFlagSourceFiles, extractUsedFlags, flagToCountryCode, countryCodeToFlag };
