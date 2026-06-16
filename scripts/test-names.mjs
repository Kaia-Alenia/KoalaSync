import assert from 'node:assert/strict';
import { getAvatarForName, generateUsername, USERNAME_ADJECTIVES, USERNAME_NOUNS } from '../shared/names.js';

// --- getAvatarForName (deterministic) ---

// Exact matches
assert.equal(getAvatarForName('Koala'), '🐨', 'Koala');
assert.equal(getAvatarForName('Tiger'), '🐯', 'Tiger');
assert.equal(getAvatarForName('Panda'), '🐼', 'Panda');
assert.equal(getAvatarForName('Fox'), '🦊', 'Fox');

// Case insensitive
assert.equal(getAvatarForName('koala'), '🐨', 'lowercase');
assert.equal(getAvatarForName('MyKoalaUser'), '🐨', 'embedded uppercase');

// Longest match wins (caterpillar > cat)
assert.equal(getAvatarForName('CaterpillarCat'), '🐛', 'caterpillar before cat');
assert.equal(getAvatarForName('Cat'), '🐱', 'cat alone');

// Emoji with ZWJ sequences (multi-codepoint)
assert.equal(getAvatarForName('Polar'), '🐻\u200D❄️', 'polar bear ZWJ');
assert.equal(getAvatarForName('Crow'), '🐦\u200D⬛', 'crow ZWJ');

// Human-like characters
assert.equal(getAvatarForName('Ninja'), '🥷', 'ninja');
assert.equal(getAvatarForName('Wizard'), '🧙', 'wizard');
assert.equal(getAvatarForName('Pirate'), '🏴', 'pirate');
assert.equal(getAvatarForName('Alien'), '👾', 'alien');
assert.equal(getAvatarForName('Robot'), '🤖', 'robot');

// Fallback
assert.equal(getAvatarForName(''), '👤', 'empty string');
assert.equal(getAvatarForName('Xyzzy123'), '👤', 'unknown name');
assert.equal(getAvatarForName(null), '👤', 'null');
assert.equal(getAvatarForName(undefined), '👤', 'undefined');

// --- generateUsername (format check) ---
for (let i = 0; i < 10; i++) {
    const name = generateUsername();
    // Format: AdjectiveNoun (e.g. "HappyKoala")
    assert.ok(/^[A-Z][a-z]+[A-Z][a-z]+$/.test(name), `format: ${name}`);
    // Adjective from list
    const adj = USERNAME_ADJECTIVES.some(a => name.startsWith(a));
    assert.ok(adj, `adjective from list: ${name}`);
    // Noun from list
    const noun = USERNAME_NOUNS.some(n => name.endsWith(n));
    assert.ok(noun, `noun from list: ${name}`);
}

// Every noun has an emoji (no broken usernames)
for (const noun of USERNAME_NOUNS) {
    const avatar = getAvatarForName(noun);
    assert.notEqual(avatar, '👤', `noun "${noun}" has no emoji — add to ANIMAL_EMOJI_MAP`);
}

console.log('names tests passed');
