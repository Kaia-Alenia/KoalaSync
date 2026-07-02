const fs = require('fs');
const path = require('path');
const assert = require('assert');

const contentPath = path.join(__dirname, '..', 'extension', 'content.js');
const source = fs.readFileSync(contentPath, 'utf8');

function extractFunction(name, text) {
  const start = text.indexOf(`function ${name}`);
  assert.notStrictEqual(start, -1, `${name} not found`);

  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  for (let i = bodyStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}') depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`${name} body did not terminate`);
}

function makeSeekable(ranges = []) {
  return {
    length: ranges.length,
    start(i) { return ranges[i][0]; },
    end(i) { return ranges[i][1]; }
  };
}

function makeVideo(name, width, height, options = {}) {
  return {
    name,
    tagName: 'VIDEO',
    videoWidth: width,
    videoHeight: height,
    offsetWidth: width,
    offsetHeight: height,
    muted: options.muted ?? true,
    duration: options.duration ?? 0,
    currentTime: options.currentTime ?? 0,
    seekable: options.seekable ?? makeSeekable()
  };
}

const lightPreview = makeVideo('light-preview', 160, 90, { muted: false, duration: 30 });
const shadowPlayer = makeVideo('shadow-player', 1920, 1080, { muted: false, duration: 3600 });

const shadowRoot = {
  querySelectorAll(selector) {
    if (selector === 'video') return [shadowPlayer];
    return [];
  }
};

const shadowHost = { shadowRoot };

const fakeDocument = {
  querySelectorAll(selector) {
    if (selector === 'video') return [lightPreview];
    return [shadowHost];
  }
};

const fnSource = extractFunction('findVideo', source);
const findVideo = Function('document', `${fnSource}; return findVideo;`)(fakeDocument);

const selected = findVideo(fakeDocument);
assert.strictEqual(
  selected,
  shadowPlayer,
  'findVideo should score Shadow DOM videos together with light DOM videos'
);

function makeDocument(nodes = []) {
  return {
    querySelectorAll() { return nodes; }
  };
}

function makeNode(attrs = {}, textContent = '') {
  return {
    textContent,
    value: attrs.value,
    max: attrs.max,
    clicked: 0,
    click() { this.clicked += 1; },
    getAttribute(name) { return attrs[name] ?? null; }
  };
}

function loadTimelineFns(hostname, document = makeDocument()) {
  return Function('window', 'document', [
    'let lastDisneyPlusTimelineCandidates = [];',
    'let lastKnownDisneyPlusDuration = 0;',
    'let lastKnownDisneyPlusScale = 1;',
    'let lastKnownDisneyPlusStart = 0;',
    'let lastDisneyPlusUiCurrent = null;',
    'let lastDisneyPlusNativeAtUi = null;',
    'let disneyPageApiTime = null;',
    extractFunction('scanShadowDom', source),
    extractFunction('querySelectorAllShadow', source),
    extractFunction('hostMatchesUrl', source),
    extractFunction('matchesPlayerUrls', source),
    extractFunction('isDisneyPlusHost', source),
    extractFunction('getSeekableRange', source),
    extractFunction('parseClockTime', source),
    extractFunction('parseTimelineText', source),
    extractFunction('getDisneyPlusUiTimeline', source),
    extractFunction('getElementLabel', source),
    extractFunction('getDisneyPlusSeekButtonLabels', source),
    extractFunction('clickDisneyPlusRelativeSeek', source),
    extractFunction('getDisneyPlusTimeline', source),
    extractFunction('getSiteQuirkAdapters', source),
    extractFunction('getActiveSiteQuirk', source),
    extractFunction('getSiteQuirkTimeline', source),
    extractFunction('getSiteQuirkDebug', source),
    extractFunction('getSyncCurrentTime', source),
    extractFunction('getSyncDuration', source),
    extractFunction('toNativeSeekTime', source),
    'return { getActiveSiteQuirk, getSyncCurrentTime, getSyncDuration, toNativeSeekTime, clickDisneyPlusRelativeSeek };'
  ].join('\n'))({ location: { hostname } }, document);
}

function loadPlayerFixFns(hostname) {
  return Function('window', [
    extractFunction('hostMatchesUrl', source),
    extractFunction('matchesPlayerUrls', source),
    extractFunction('getPlayerActionFixes', source),
    extractFunction('getActivePlayerActionFix', source),
    'return { getPlayerActionFixes, getActivePlayerActionFix };'
  ].join('\n'))({ location: { hostname } });
}

const disneyUiDocument = makeDocument([
  makeNode({ 'aria-valuetext': '0:09 / 180:00' })
]);
const disneyFns = loadTimelineFns('www.disneyplus.com', disneyUiDocument);
assert.equal(disneyFns.getActiveSiteQuirk().name, 'disneyplus-timeline-and-buttons');
assert.deepEqual(disneyFns.getActiveSiteQuirk().urls, ['disneyplus.com']);
const disneyVideo = makeVideo('disney-offset', 1920, 1080, {
  currentTime: 29,
  duration: 0,
  seekable: makeSeekable([[0, 32400]])
});
assert.equal(disneyFns.getSyncCurrentTime(disneyVideo), 9);
assert.equal(disneyFns.getSyncDuration(disneyVideo), 10800);
assert.equal(disneyFns.toNativeSeekTime(disneyVideo, 39), 119);

const disneySeekableFallbackFns = loadTimelineFns('www.disneyplus.com');
const disneyOffsetVideo = makeVideo('disney-offset', 1920, 1080, {
  currentTime: 29,
  duration: 0,
  seekable: makeSeekable([[20, 10820]])
});
assert.equal(disneySeekableFallbackFns.getSyncCurrentTime(disneyOffsetVideo), 9);
assert.equal(disneySeekableFallbackFns.getSyncDuration(disneyOffsetVideo), 10800);
assert.equal(disneySeekableFallbackFns.toNativeSeekTime(disneyOffsetVideo, 39), 59);

const genericFns = loadTimelineFns('example.com');
assert.equal(genericFns.getActiveSiteQuirk(), null);
assert.equal(genericFns.getSyncCurrentTime(disneyVideo), 29);
assert.equal(genericFns.getSyncDuration(disneyVideo), 0);
assert.equal(genericFns.toNativeSeekTime(disneyVideo, 39), 39);

const backButton = makeNode({ 'aria-label': '10 Sekunden zurück' });
const forwardButton = makeNode({ 'aria-label': '10 Sekunden vorspulen' });
const disneyButtonFns = loadTimelineFns('www.disneyplus.com', makeDocument([backButton, forwardButton]));
assert.equal(disneyButtonFns.clickDisneyPlusRelativeSeek(-30), true);
assert.equal(disneyButtonFns.clickDisneyPlusRelativeSeek(30), true);

const twitchFixFns = loadPlayerFixFns('player.twitch.tv');
assert.equal(twitchFixFns.getActivePlayerActionFix().name, 'twitch-player-buttons');
assert.deepEqual(twitchFixFns.getActivePlayerActionFix().urls, ['twitch.tv']);

const genericFixFns = loadPlayerFixFns('example.com');
assert.equal(genericFixFns.getActivePlayerActionFix(), null);

console.log('content video finder tests passed');
