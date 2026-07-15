import { describe, expect, it } from 'vitest';
import {
    CHAT_SEND_LIMIT,
    createChatSendLimiter,
    createLatestTaskQueue,
    MAX_ROOM_ID_LENGTH,
    normalizeRoomId
} from './chat-session.js';

describe('chat session boundaries', () => {
    it('matches the relay room ID sanitizer and length limit', () => {
        expect(normalizeRoomId('  ROOM_!42  ')).toBe('ROOM42');
        expect(normalizeRoomId('A'.repeat(MAX_ROOM_ID_LENGTH + 10))).toBe('A'.repeat(MAX_ROOM_ID_LENGTH));
        expect(normalizeRoomId(null)).toBe('');
    });

    it('keeps client chat bursts below the relay disconnect threshold', () => {
        let current = 1000;
        const limiter = createChatSendLimiter({ now: () => current });
        for (let index = 0; index < CHAT_SEND_LIMIT; index++) {
            expect(limiter.take()).toEqual({ allowed: true, retryAfterMs: 0 });
        }
        expect(limiter.take()).toEqual({ allowed: false, retryAfterMs: 10000 });
        current += 10000;
        expect(limiter.take()).toEqual({ allowed: true, retryAfterMs: 0 });
        limiter.reset();
        expect(limiter.take()).toEqual({ allowed: true, retryAfterMs: 0 });
    });

    it('serializes join work and prevents an older request from winning storage races', async () => {
        const queue = createLatestTaskQueue();
        let releaseFirst;
        const writes = [];
        const first = queue.run(async isCurrent => {
            await new Promise(resolve => { releaseFirst = resolve; });
            if (isCurrent()) writes.push('first');
            return { status: isCurrent() ? 'ok' : 'superseded' };
        });
        await new Promise(resolve => setTimeout(resolve, 0));
        const second = queue.run(async isCurrent => {
            if (isCurrent()) writes.push('second');
            return { status: 'ok' };
        });
        releaseFirst();
        await expect(first).resolves.toEqual({ status: 'superseded' });
        await expect(second).resolves.toEqual({ status: 'ok' });
        expect(writes).toEqual(['second']);
    });
});
