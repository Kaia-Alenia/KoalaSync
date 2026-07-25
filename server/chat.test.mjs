import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import {
    CHAT_CIPHERTEXT_MAX_BYTES,
    createChatEnvelope,
    normalizeChatCiphertext
} from './chat.js';

const encoded = (length) => Buffer.alloc(length, 7).toString('base64url');

describe('encrypted chat relay envelopes', () => {
    it('accepts canonical base64url within the encrypted message bounds', () => {
        expect(normalizeChatCiphertext(encoded(29))).toBe(encoded(29));
        expect(normalizeChatCiphertext(encoded(CHAT_CIPHERTEXT_MAX_BYTES))).toBe(encoded(CHAT_CIPHERTEXT_MAX_BYTES));
    });

    it('rejects malformed, padded, too-small, and oversized payloads', () => {
        expect(normalizeChatCiphertext('<script>')).toBeNull();
        expect(normalizeChatCiphertext(`${encoded(29)}=`)).toBeNull();
        expect(normalizeChatCiphertext(encoded(28))).toBeNull();
        expect(normalizeChatCiphertext(encoded(CHAT_CIPHERTEXT_MAX_BYTES + 1))).toBeNull();
        expect(normalizeChatCiphertext('A')).toBeNull();
    });

    it('stamps authoritative metadata and keeps only ciphertext from the sender', () => {
        const ciphertext = encoded(64);
        const envelope = createChatEnvelope({
            ciphertext,
            id: 'spoofed',
            senderId: 'mallory',
            timestamp: 1,
            text: 'plaintext must not survive'
        }, 'alice', () => 1234, () => 'server-id');

        expect(envelope).toEqual({
            id: 'server-id',
            senderId: 'alice',
            timestamp: 1234,
            ciphertext
        });
        expect(JSON.stringify(envelope)).not.toContain('plaintext');
    });
});
