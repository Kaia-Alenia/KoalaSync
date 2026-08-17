import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const contentPath = path.join(repoRoot, 'extension/content.js');

/**
 * Pulls a top-level function out of content.js by brace matching.
 *
 * The E2E suite deliberately runs the shipped source rather than a copy: a
 * fixture that passes against a reimplementation proves nothing about what the
 * extension actually does.
 */
export function extractFunction(name, source = fs.readFileSync(contentPath, 'utf8')) {
    const start = source.indexOf(`function ${name}`);
    if (start === -1) throw new Error(`${name} not found in extension/content.js`);

    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`${name} body did not terminate`);
}

/**
 * Every function the video finder needs, as one evaluatable script that exposes
 * window.__koalaFindVideo. Keeping this list here means a refactor that splits
 * findVideo into helpers fails loudly instead of silently testing stale code.
 */
export const VIDEO_FINDER_EXPORTS = [
    'findVideo',
    'collectVideoCandidates',
    'getElementRenderBox',
    'elementStylesAllowRendering',
    'isElementRendered',
    'getRenderedVideoArea',
    'getVideoSizeBucket',
    'isVideoRendered',
    'hasPlayableVideoSource',
    'isBackgroundVideo',
    'isVideoPlaying',
    'isShortUncontrolledVideo',
    'compareVideoRanks',
    'pickBestVideo'
];

/** The ranking table lives outside a function, so it is lifted by pattern. */
function extractRankingTable(source) {
    const start = source.indexOf('const VIDEO_RANKING_SIGNALS');
    if (start === -1) throw new Error('VIDEO_RANKING_SIGNALS not found in extension/content.js');
    const end = source.indexOf('];', start);
    if (end === -1) throw new Error('VIDEO_RANKING_SIGNALS did not terminate');
    return source.slice(start, end + 2);
}

export function buildVideoFinderScript() {
    const source = fs.readFileSync(contentPath, 'utf8');
    const bodies = VIDEO_FINDER_EXPORTS.map(name => extractFunction(name, source));
    return [
        ...bodies,
        extractRankingTable(source),
        'window.__koalaFindVideo = findVideo;'
    ].join('\n');
}
