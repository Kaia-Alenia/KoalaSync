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

function loadTimelineFns(hostname, document = makeDocument(), pageApiTime = null) {
  const disneyPageApiTime = pageApiTime
    ? `let disneyPageApiTime = { position: ${pageApiTime.position}, duration: ${pageApiTime.duration}, at: Date.now() - ${pageApiTime.ageMs || 0} };`
    : 'let disneyPageApiTime = null;';
  return Function('window', 'document', [
    disneyPageApiTime,
    extractFunction('hostMatchesUrl', source),
    extractFunction('matchesPlayerUrls', source),
    extractFunction('isDisneyPlusHost', source),
    extractFunction('getDisneyPlusTimeline', source),
    extractFunction('getSiteQuirkAdapters', source),
    extractFunction('getActiveSiteQuirk', source),
    extractFunction('getSiteQuirkTimeline', source),
    extractFunction('getSiteQuirkDebug', source),
    extractFunction('getSyncCurrentTime', source),
    extractFunction('getSyncDuration', source),
    extractFunction('toNativeSeekTime', source),
    'return { getActiveSiteQuirk, getSyncCurrentTime, getSyncDuration, toNativeSeekTime };'
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

const disneyFns = loadTimelineFns('www.disneyplus.com', makeDocument(), {
  position: 9,
  duration: 10800
});
assert.equal(disneyFns.getActiveSiteQuirk().name, 'disneyplus-page-api');
assert.deepEqual(disneyFns.getActiveSiteQuirk().urls, ['disneyplus.com']);
const disneyVideo = makeVideo('disney-offset', 1920, 1080, {
  currentTime: 29,
  duration: 0,
  seekable: makeSeekable([[0, 32400]])
});
assert.equal(disneyFns.getSyncCurrentTime(disneyVideo), 9);
assert.equal(disneyFns.getSyncDuration(disneyVideo), 10800);
assert.equal(disneyFns.toNativeSeekTime(disneyVideo, 39), 39);
assert.equal(disneyFns.getSyncCurrentTime(makeVideo('disney-native-broken', 1920, 1080, {
  currentTime: Number.NaN,
  duration: 0
})), 9);

const disneyNoPageApiFns = loadTimelineFns('www.disneyplus.com');
const disneyOffsetVideo = makeVideo('disney-offset', 1920, 1080, {
  currentTime: 29,
  duration: 0,
  seekable: makeSeekable([[20, 10820]])
});
assert.equal(disneyNoPageApiFns.getSyncCurrentTime(disneyOffsetVideo), null);
assert.equal(disneyNoPageApiFns.getSyncDuration(disneyOffsetVideo), 0);
assert.equal(disneyNoPageApiFns.toNativeSeekTime(disneyOffsetVideo, 39), 39);

const genericFns = loadTimelineFns('example.com');
assert.equal(genericFns.getActiveSiteQuirk(), null);
assert.equal(genericFns.getSyncCurrentTime(disneyVideo), 29);
assert.equal(genericFns.getSyncDuration(disneyVideo), 0);
assert.equal(genericFns.toNativeSeekTime(disneyVideo, 39), 39);

const twitchFixFns = loadPlayerFixFns('player.twitch.tv');
assert.equal(twitchFixFns.getActivePlayerActionFix().name, 'twitch-player-buttons');
assert.deepEqual(twitchFixFns.getActivePlayerActionFix().urls, ['twitch.tv']);

const genericFixFns = loadPlayerFixFns('example.com');
assert.equal(genericFixFns.getActivePlayerActionFix(), null);

console.log('content video finder tests passed');
