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
  .filter(file => file.endsWith('.json') && file !== 'en.json')
  .sort();

let hasError = false;

console.log(`Auditing website i18n locales using ${enKeys.length} baseline keys from en.json...\n`);

for (const file of localeFiles) {
  const filePath = path.join(localesDir, file);
  try {
    const dict = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const keys = Object.keys(dict).sort();

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
  console.error('❌ Website locale consistency check failed! Fix the errors above.');
  process.exit(1);
} else {
  console.log('🎉 All website locale files are perfectly synchronized and consistent!');
  process.exit(0);
}
