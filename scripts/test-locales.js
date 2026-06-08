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

console.log('');
if (hasError) {
  console.error('❌ Locale consistency check failed! Please fix the errors listed above.');
  process.exit(1);
} else {
  console.log('🎉 All locale files are perfectly synchronized and consistent!');
  process.exit(0);
}
