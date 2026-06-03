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

function makeVideo(name, width, height, options = {}) {
  return {
    name,
    tagName: 'VIDEO',
    videoWidth: width,
    videoHeight: height,
    offsetWidth: width,
    offsetHeight: height,
    muted: options.muted ?? true,
    duration: options.duration ?? 0
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

console.log('content video finder tests passed');
