const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', 'extension', 'locales');
const enPath = path.join(localesDir, 'en.json');

if (!fs.existsSync(enPath)) {
  console.error('CRITICAL: en.json is missing!');
  process.exit(1);
}

let hasError = false;

// Verify SUPPORTED_LANGUAGES in extension/i18n.js matches JSON files
const i18nPath = path.join(__dirname, '..', 'extension', 'i18n.js');
try {
  if (fs.existsSync(i18nPath)) {
    const i18nContent = fs.readFileSync(i18nPath, 'utf8');
    const langMatch = i18nContent.match(/export const SUPPORTED_LANGUAGES = \[(.*?)\];/);
    if (!langMatch) {
      hasError = true;
      console.error('❌ Could not parse SUPPORTED_LANGUAGES from extension/i18n.js');
    } else {
      const supportedLangs = langMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
      const fileLangs = fs.readdirSync(localesDir)
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));

      for (const lang of fileLangs) {
        if (!supportedLangs.includes(lang)) {
          hasError = true;
          console.error(`❌ ${lang}.json exists in extension/locales but is missing from SUPPORTED_LANGUAGES in extension/i18n.js`);
        }
      }
      for (const lang of supportedLangs) {
        if (!fileLangs.includes(lang)) {
          hasError = true;
          console.error(`❌ ${lang} is in SUPPORTED_LANGUAGES in extension/i18n.js but ${lang}.json is missing from extension/locales`);
        }
      }
    }
  }
} catch (err) {
  hasError = true;
  console.error('❌ Failed to verify SUPPORTED_LANGUAGES synchronization:', err.message);
}

const enDict = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const enKeys = Object.keys(enDict);

const localeFiles = fs.readdirSync(localesDir).filter(file => file.endsWith('.json') && file !== 'en.json');

console.log(`Auditing i18n locales using ${enKeys.length} baseline keys from en.json...\n`);

for (const file of localeFiles) {
  const filePath = path.join(localesDir, file);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');

    // Check for duplicate keys in raw JSON before parsing
    const keyRe = /"(\w+)"\s*:/g;
    const seenKeys = {};
    let dupes = [];
    let m;
    while ((m = keyRe.exec(raw)) !== null) {
      if (seenKeys[m[1]]) {
        dupes.push(m[1]);
      }
      seenKeys[m[1]] = true;
    }
    if (dupes.length > 0) {
      hasError = true;
      console.error(`❌ ${file} has duplicate keys: ${[...new Set(dupes)].join(', ')}`);
      continue;
    }

    const dict = JSON.parse(raw);
    const keys = Object.keys(dict);

    const missingKeys = enKeys.filter(k => !keys.includes(k));
    const extraKeys = keys.filter(k => !enKeys.includes(k));

    if (missingKeys.length > 0 || extraKeys.length > 0) {
      hasError = true;
      console.error(`❌ ${file} has inconsistencies:`);
      if (missingKeys.length > 0) {
        console.error(`  Missing keys (${missingKeys.length}):`, missingKeys);
      }
      if (extraKeys.length > 0) {
        console.error(`  Extra keys (${extraKeys.length}):`, extraKeys);
      }
    } else {
      console.log(`✓ ${file} is fully consistent (matches all keys).`);
    }
  } catch (err) {
    hasError = true;
    console.error(`❌ Failed to parse ${file}:`, err.message);
  }
}

// ──────────────────────────────────────
// Verify Chrome _locales/*/messages.json
// ──────────────────────────────────────
console.log('\nVerifying Chrome _locales/messages.json structure...\n');

const chromeLocalesDir = path.join(__dirname, '..', 'extension', '_locales');

// Map custom locale codes to Chrome's underscore format
const chromeLocaleMap = {
  'en': 'en', 'de': 'de', 'fr': 'fr', 'es': 'es', 'it': 'it',
  'ja': 'ja', 'ko': 'ko', 'nl': 'nl', 'pl': 'pl',
  'pt-BR': 'pt_BR', 'pt': 'pt_PT', 'ru': 'ru', 'tr': 'tr'
};

// Read SUPPORTED_LANGUAGES from i18n.js
const i18nContent = fs.readFileSync(i18nPath, 'utf8');
const langMatch = i18nContent.match(/export const SUPPORTED_LANGUAGES = \[(.*?)\];/);
const supportedLangs = langMatch
  ? langMatch[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
  : [];

// Verify default_locale in manifest.base.json
const manifestPath = path.join(__dirname, '..', 'extension', 'manifest.base.json');
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.default_locale) {
    hasError = true;
    console.error('❌ manifest.base.json is missing "default_locale"');
  } else if (manifest.default_locale !== 'en') {
    hasError = true;
    console.error(`❌ manifest.base.json default_locale is "${manifest.default_locale}", expected "en"`);
  } else {
    console.log('✓ manifest.base.json has default_locale: "en"');
  }
} catch (err) {
  hasError = true;
  console.error('❌ Failed to read manifest.base.json:', err.message);
}

// Verify _locales structure for each supported language
const expectedKeys = ['appName', 'appDesc'];
for (const lang of supportedLangs) {
  const chromeLocale = chromeLocaleMap[lang];
  if (!chromeLocale) {
    hasError = true;
    console.error(`❌ No Chrome locale mapping for "${lang}" in chromeLocaleMap`);
    continue;
  }

  const msgPath = path.join(chromeLocalesDir, chromeLocale, 'messages.json');

  if (!fs.existsSync(msgPath)) {
    hasError = true;
    console.error(`❌ Missing _locales/${chromeLocale}/messages.json for language "${lang}"`);
    continue;
  }

  try {
    const raw = fs.readFileSync(msgPath, 'utf8');
    const messages = JSON.parse(raw);
    const keys = Object.keys(messages);

    // Detect duplicate top-level keys via regex (JSON.parse silently keeps last value)
    const topKeyRe = /^\s{2}"(\w+)"\s*:/gm;
    const topSeen = {};
    let topDupes = [];
    let tm;
    while ((tm = topKeyRe.exec(raw)) !== null) {
      if (topSeen[tm[1]]) topDupes.push(tm[1]);
      topSeen[tm[1]] = true;
    }
    if (topDupes.length > 0) {
      hasError = true;
      console.error(`❌ _locales/${chromeLocale}/messages.json has duplicate keys: ${[...new Set(topDupes)].join(', ')}`);
      continue;
    }

    // Validate each entry has a "message" field
    for (const key of keys) {
      if (!messages[key].message || typeof messages[key].message !== 'string') {
        hasError = true;
        console.error(`❌ _locales/${chromeLocale}/messages.json: "${key}" is missing a valid "message" field`);
      }
    }

    // Check for missing or extra keys vs expected baseline
    const missing = expectedKeys.filter(k => !keys.includes(k));
    const extra = keys.filter(k => !expectedKeys.includes(k));
    if (missing.length > 0) {
      hasError = true;
      console.error(`❌ _locales/${chromeLocale}/messages.json missing keys: ${missing.join(', ')}`);
    }
    if (extra.length > 0) {
      console.log(`ℹ️  _locales/${chromeLocale}/messages.json has extra keys (ok): ${extra.join(', ')}`);
    }
    if (missing.length === 0) {
      console.log(`✓ _locales/${chromeLocale}/messages.json is valid and complete`);
    }
  } catch (err) {
    hasError = true;
    console.error(`❌ Failed to parse _locales/${chromeLocale}/messages.json:`, err.message);
  }
}

// Detect orphan _locales directories (no matching supported language)
if (fs.existsSync(chromeLocalesDir)) {
  const chromeCodes = supportedLangs.map(l => chromeLocaleMap[l]).filter(Boolean);
  const dirs = fs.readdirSync(chromeLocalesDir);
  for (const dir of dirs) {
    const dirPath = path.join(chromeLocalesDir, dir);
    if (fs.statSync(dirPath).isDirectory() && dir !== '.git' && !chromeCodes.includes(dir)) {
      hasError = true;
      console.error(`❌ Orphan _locales/${dir}/ directory exists but no matching language in SUPPORTED_LANGUAGES`);
    }
  }
}

console.log('');
if (hasError) {
  console.error('❌ Locale consistency check failed! Please fix the errors listed above.');
  process.exit(1);
} else {
  console.log('🎉 All locale files (locales/ and _locales/) are valid and consistent!');
  process.exit(0);
}
