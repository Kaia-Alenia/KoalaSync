import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it } from 'vitest';
import {
    clearChatKeyCache,
    countCodePoints,
    decryptChatMessage,
    deriveChatKey,
    encryptChatMessage,
    generateChatSecret,
    normalizeOutgoingChatText,
    validateChatSecret
} from './chat-crypto.js';

afterEach(clearChatKeyCache);

describe('chat crypto', () => {
    it('generates canonical 128-bit secrets', () => {
        const secret = generateChatSecret(webcrypto);
        expect(secret).toMatch(/^[A-Za-z0-9_-]{22}$/);
        expect(validateChatSecret(secret)).toBe(secret);
        expect(validateChatSecret(`${secret}=`)).toBe('');
    });

    it('round-trips Unicode with a cached room key and fresh IVs', async () => {
        const secret = generateChatSecret(webcrypto);
        const firstKey = await deriveChatKey('ROOM-1', secret, webcrypto);
        const secondKey = await deriveChatKey('ROOM-1', secret, webcrypto);
        expect(secondKey).toBe(firstKey);

        const input = { text: 'Hello 🐨 **world**', roomId: 'ROOM-1', senderId: 'alice', secret };
        const first = await encryptChatMessage(input, webcrypto);
        const second = await encryptChatMessage(input, webcrypto);
        expect(second).not.toBe(first);
        await expect(decryptChatMessage({ ciphertext: first, ...input }, webcrypto)).resolves.toBe(input.text);
    });

    it('rejects relabeling, cross-room replay, and the wrong secret', async () => {
        const secret = generateChatSecret(webcrypto);
        const ciphertext = await encryptChatMessage({ text: 'secret', roomId: 'ROOM-1', senderId: 'alice', secret }, webcrypto);
        clearChatKeyCache();
        await expect(decryptChatMessage({ ciphertext, roomId: 'ROOM-1', senderId: 'bob', secret }, webcrypto)).rejects.toThrow();
        clearChatKeyCache();
        await expect(decryptChatMessage({ ciphertext, roomId: 'ROOM-2', senderId: 'alice', secret }, webcrypto)).rejects.toThrow();
        clearChatKeyCache();
        await expect(decryptChatMessage({ ciphertext, roomId: 'ROOM-1', senderId: 'alice', secret: generateChatSecret(webcrypto) }, webcrypto)).rejects.toThrow();
    });

    it('enforces 500 Unicode code points before encryption', () => {
        expect(countCodePoints('😀'.repeat(500))).toBe(500);
        expect(normalizeOutgoingChatText(`  ${'😀'.repeat(500)}  `)).toBe('😀'.repeat(500));
        expect(() => normalizeOutgoingChatText('😀'.repeat(501))).toThrow(RangeError);
        expect(() => normalizeOutgoingChatText('   ')).toThrow(TypeError);
    });

    it('keeps the worst-case 500-codepoint payload within the relay byte bound', async () => {
        const secret = generateChatSecret(webcrypto);
        const ciphertext = await encryptChatMessage({
            text: '😀'.repeat(500), roomId: 'ROOM-1', senderId: 'alice', secret
        }, webcrypto);
        const bytes = Buffer.from(ciphertext, 'base64url');
        expect(bytes).toHaveLength(2028);
    });
});
