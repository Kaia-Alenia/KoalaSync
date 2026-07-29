import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [popupHtml, popupJs, overlayJs, backgroundJs] = await Promise.all([
    readFile(path.join(repoRoot, 'extension', 'popup.html'), 'utf8'),
    readFile(path.join(repoRoot, 'extension', 'popup.js'), 'utf8'),
    readFile(path.join(repoRoot, 'extension', 'chat-overlay.js'), 'utf8'),
    readFile(path.join(repoRoot, 'extension', 'background.js'), 'utf8')
]);

function detailsSection(marker) {
    const markerIndex = popupHtml.indexOf(marker);
    assert.notEqual(markerIndex, -1, `missing settings marker: ${marker}`);
    const start = popupHtml.lastIndexOf('<details', markerIndex);
    const end = popupHtml.indexOf('</details>', markerIndex);
    assert.ok(start >= 0 && end > markerIndex, `invalid details section: ${marker}`);
    return popupHtml.slice(start, end + '</details>'.length);
}

const chatSection = detailsSection('data-i18n="CHAT_TITLE"');
const syncSection = detailsSection('data-i18n="LABEL_SETTINGS_GROUP_SYNC"');

for (const id of ['chatEnabled', 'chatNotifications', 'chatPosition', 'chatSize', 'chatStartMode', 'chatReactionDisplay']) {
    assert.match(chatSection, new RegExp(`id="${id}"`), `${id} belongs in the dedicated chat settings section`);
}
assert.doesNotMatch(syncSection, /id="chatEnabled"/, 'chat enablement must not remain under Playback & Sync');

for (const value of ['right', 'left', 'detached']) {
    assert.match(chatSection, new RegExp(`<option value="${value}"`), `chat position supports ${value}`);
}
for (const value of ['compact', 'standard', 'large', 'custom']) {
    assert.match(chatSection, new RegExp(`<option value="${value}"`), `chat size supports ${value}`);
}
for (const value of ['bubble', 'open']) {
    assert.match(chatSection, new RegExp(`<option value="${value}"`), `chat start mode supports ${value}`);
}
for (const value of ['chat', 'video']) {
    assert.match(chatSection, new RegExp(`<option value="${value}"`), `chat reaction display supports ${value}`);
}

for (const key of ['chatEnabled', 'chatNotifications', 'chatPosition', 'chatSize', 'chatStartMode', 'chatReactionDisplay']) {
    assert.match(popupJs, new RegExp(`chrome\\.storage\\.local\\.set\\(\\{ ${key}`), `popup persists ${key}`);
    assert.ok(backgroundJs.includes(`'${key}'`), `legacy sync purge includes ${key}`);
}
for (const key of ['chatPosition', 'chatSize', 'chatStartMode', 'chatReactionDisplay']) {
    assert.ok(overlayJs.includes(`'${key}'`), `overlay reads ${key}`);
}
assert.match(backgroundJs, /chatEnabled:\s*data\.chatEnabled === true/, 'background reads chatEnabled with an off-by-default contract');
assert.match(backgroundJs, /chatNotifications:\s*data\.chatNotifications !== false/, 'chat message notifications default on');
assert.match(popupJs, /elements\.chatNotifications\.checked = localData\.chatNotifications !== false/, 'popup shows chat notifications on by default');
assert.match(popupJs, /elements\.browserNotifications\.checked = localData\.browserNotifications === true/, 'activity notifications remain off by default');
assert.match(overlayJs, /context\?\.enabled/, 'overlay consumes chat enablement from the validated background context');

assert.match(overlayJs, /SIZE_PRESETS[\s\S]*compact[\s\S]*standard[\s\S]*large/, 'overlay defines all size presets');
assert.match(
    overlayJs,
    /} else {\s*layout\.width = Number\(layout\.customWidth\) \|\| DEFAULT_WIDTH;\s*layout\.height = Number\(layout\.customHeight\) \|\| DEFAULT_HEIGHT;/,
    'custom size restores its dedicated dimensions'
);
assert.match(overlayJs, /layout\.customWidth = rect\.width[\s\S]*layout\.customHeight = rect\.height/, 'detached resize updates the custom-size snapshot');
assert.match(overlayJs, /changes\.chatPosition[\s\S]*setMode/, 'position changes apply live');
assert.match(overlayJs, /changes\.chatSize[\s\S]*setSize/, 'size changes apply live');
assert.match(overlayJs, /changes\.chatStartMode[\s\S]*setOpened/, 'startup-mode changes apply live');
assert.match(overlayJs, /changes\.chatReactionDisplay[\s\S]*chatReactionDisplay/, 'reaction display changes apply live');

console.log('chat settings tests passed');
