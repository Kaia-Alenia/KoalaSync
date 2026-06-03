import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';

const popupPath = path.join(cwd(), 'extension', 'popup.js');
const source = fs.readFileSync(popupPath, 'utf8');

assert.match(
  source,
  /const ROOM_LIST_REFRESH_COOLDOWN_MS\s*=\s*11000;/,
  'popup should define an 11 second room-list refresh cooldown'
);

assert.match(
  source,
  /elements\.refreshRooms\.disabled\s*=\s*true;/,
  'refresh button should be disabled while cooldown is active'
);

assert.match(
  source,
  /setTimeout\(\(\)\s*=>\s*{\s*elements\.refreshRooms\.disabled\s*=\s*false;/s,
  'refresh button should be re-enabled after the cooldown'
);

console.log('popup refresh cooldown tests passed');
