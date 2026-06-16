import assert from 'node:assert/strict';
import { extractEpisodeId, sameEpisode } from '../extension/episode-utils.js';

// --- extractEpisodeId ---

// Standard SxxExx patterns
assert.equal(extractEpisodeId('S01E01'), 'S01E01');
assert.equal(extractEpisodeId('S1E1'), 'S01E01');
assert.equal(extractEpisodeId('s01e01'), 'S01E01', 'case insensitive');
assert.equal(extractEpisodeId('Season 1 Episode 2'), 'S01E02');
assert.equal(extractEpisodeId('season 01 episode 02'), 'S01E02');

// Separators: dash, dot, slash, colon, space, comma
assert.equal(extractEpisodeId('S01 - E01'), 'S01E01', 'dash separator');
assert.equal(extractEpisodeId('S01.E01'), 'S01E01', 'dot separator');
assert.equal(extractEpisodeId('S01/E01'), 'S01E01', 'slash separator (Crunchyroll)');
assert.equal(extractEpisodeId('S01:E01'), 'S01E01', 'colon separator');
assert.equal(extractEpisodeId('S01,E01'), 'S01E01', 'comma separator');
assert.equal(extractEpisodeId('S01 E01'), 'S01E01', 'space separator');

// German / multi-language
assert.equal(extractEpisodeId('Folge 5'), 'EP005');
assert.equal(extractEpisodeId('Episode 12'), 'EP012');
assert.equal(extractEpisodeId('Ep. 3'), 'EP003');
assert.equal(extractEpisodeId('#42'), 'EP042');

// Edge cases
assert.equal(extractEpisodeId(null), null);
assert.equal(extractEpisodeId(undefined), null);
assert.equal(extractEpisodeId(''), null);
assert.equal(extractEpisodeId(123), null);
assert.equal(extractEpisodeId('Some Movie Title'), null);
assert.equal(extractEpisodeId('Breaking Bad'), null);

// Leading zeros preserved
assert.equal(extractEpisodeId('S01E001'), 'S01E001');

// --- sameEpisode ---

// Identical episodes
assert.equal(sameEpisode('S01E01', 'S01E01'), true);
assert.equal(sameEpisode('S01E01 - Pilot', 'S01E01'), true, 'extra text ignored');
assert.equal(sameEpisode('Folge 5', 'Episode 5'), true, 'German vs English');

// Different episodes
assert.equal(sameEpisode('S01E01', 'S01E02'), false);
assert.equal(sameEpisode('Folge 1', 'Folge 2'), false);
assert.equal(sameEpisode('S01E01', 'S02E01'), false);

// Both unknown → assume same (backward compat)
assert.equal(sameEpisode(null, null), true);
assert.equal(sameEpisode(undefined, undefined), true);
assert.equal(sameEpisode('', ''), true);
assert.equal(sameEpisode('Some Movie', 'Some Movie'), true);
assert.equal(sameEpisode('Some Movie', 'Other Movie'), false, 'different unknowns differ');

// One unknown, one known → different
assert.equal(sameEpisode('S01E01', null), false);
assert.equal(sameEpisode(null, 'Episode 5'), false);
assert.equal(sameEpisode(undefined, 'S01E01'), false);

// Mixed formats — only match when the same episode
assert.equal(sameEpisode('S01E05', 'S01E05'), true, 'same SxxExx');
assert.equal(sameEpisode('Folge 5', 'Episode 5'), true, 'German Folge vs English Episode');
assert.equal(sameEpisode('Episode 12', 'Ep. 12'), true, 'Episode X vs Ep. X');
assert.equal(sameEpisode('#42', 'Folge 42'), true, '#X vs Folge X');

// Different format IDs → different (season-tagged vs seasonless)
assert.equal(sameEpisode('S01E05', 'Episode 5'), false, 'SxxExx vs Episode X: different IDs');
assert.equal(sameEpisode('S01E01', 'EP001'), false, 'SxxExx vs EPxxx: different IDs');

// parseable but truly different
assert.equal(sameEpisode('S01E01', 'S01E02'), false, 'different episodes');
assert.equal(sameEpisode('S01E01', 'S02E01'), false, 'different seasons');

console.log('episode-utils tests passed');
