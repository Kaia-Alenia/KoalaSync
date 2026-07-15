import { describe, expect, it } from 'vitest';
import { buildChatRelayPayload, encodeSocketEvent } from './chat-wire.js';

describe('chat wire boundary', () => {
    const secret = 'R5Ti1nxp0crfAFHf3gVncw';

    it('sends only ciphertext for chat messages', () => {
        expect(buildChatRelayPayload('ciphertext')).toEqual({ ciphertext: 'ciphertext' });
    });

    it('rejects the secret anywhere in any outgoing relay event', () => {
        for (const [event, payload] of [
            ['join_room', { roomId: 'ROOM', password: 'PASS', chatKey: secret }],
            ['peer_status', { status: 'heartbeat', nested: { secret } }],
            ['chat_message', { ciphertext: `prefix-${secret}-suffix` }]
        ]) {
            expect(() => encodeSocketEvent(event, payload, secret)).toThrow('Refusing to send chat secret');
        }
        expect(encodeSocketEvent('join_room', { roomId: 'ROOM', password: 'PASS' }, secret)).not.toContain(secret);
    });
});
