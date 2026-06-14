#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'website', 'locales');
const enPath = path.join(localesDir, 'en.json');

if (!fs.existsSync(enPath)) {
  console.error('CRITICAL: website/locales/en.json is missing!');
  process.exit(1);
}

const enDict = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const enKeys = Object.keys(enDict).sort();

const localeFiles = fs.readdirSync(localesDir)
  .filter(file => file.endsWith('.json'))
  .sort();

let hasError = false;

console.log(`Auditing website i18n locales using ${enKeys.length} baseline keys from en.json...\n`);

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
    const keys = Object.keys(dict).sort();

    const missingKeys = enKeys.filter(k => !keys.includes(k));
    const extraKeys = keys.filter(k => !enKeys.includes(k));
    const emptyKeys = keys.filter(k => {
      if (file === 'en.json' && k === 'CANONICAL_PATH') return false;
      return typeof dict[k] === 'string' && dict[k].trim() === '';
    });
    const placeholderKeys = keys.filter(k => {
      if (typeof dict[k] !== 'string') return false;
      const val = dict[k];
      const lower = val.toLowerCase();
      return (
        lower.includes('placeholder') ||
        lower.includes('todo:') ||
        lower.includes('tbd:') ||
        /\bTODO\b/.test(val) ||
        /\bTBD\b/.test(val)
      );
    });

    if (missingKeys.length > 0 || extraKeys.length > 0 || emptyKeys.length > 0 || placeholderKeys.length > 0) {
      hasError = true;
      console.error(`❌ ${file} has inconsistencies:`);
      if (missingKeys.length > 0) {
        console.error(`  Missing keys (${missingKeys.length}):`, missingKeys);
      }
      if (extraKeys.length > 0) {
        console.error(`  Extra keys (${extraKeys.length}):`, extraKeys);
      }
      if (emptyKeys.length > 0) {
        console.error(`  Empty translation values (${emptyKeys.length}):`, emptyKeys);
      }
      if (placeholderKeys.length > 0) {
        console.error(`  Placeholder/TODO values (${placeholderKeys.length}):`, placeholderKeys);
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
  console.error('❌ Website locale consistency check failed! Fix the errors above.');
  process.exit(1);
} else {
  console.log('🎉 All website locale files are perfectly synchronized and consistent!');
  process.exit(0);
}
