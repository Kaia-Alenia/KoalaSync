export const MAX_ROOM_ID_LENGTH = 64;
export const CHAT_SEND_LIMIT = 9;
export const CHAT_SEND_WINDOW_MS = 10000;

export function normalizeRoomId(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^a-zA-Z0-9\-]/g, '').slice(0, MAX_ROOM_ID_LENGTH);
}

export function createChatSendLimiter({
    limit = CHAT_SEND_LIMIT,
    windowMs = CHAT_SEND_WINDOW_MS,
    now = () => Date.now()
} = {}) {
    let timestamps = [];

    return {
        take() {
            const current = now();
            timestamps = timestamps.filter(timestamp => current - timestamp < windowMs);
            if (timestamps.length >= limit) {
                return {
                    allowed: false,
                    retryAfterMs: Math.max(1, windowMs - (current - timestamps[0]))
                };
            }
            timestamps.push(current);
            return { allowed: true, retryAfterMs: 0 };
        },
        reset() {
            timestamps = [];
        }
    };
}

export function createLatestTaskQueue() {
    let generation = 0;
    let tail = Promise.resolve();

    return {
        invalidate() {
            generation++;
        },
        async run(task) {
            const requestGeneration = ++generation;
            const previous = tail;
            let release;
            tail = new Promise(resolve => { release = resolve; });
            await previous.catch(() => {});
            const isCurrent = () => requestGeneration === generation;
            try {
                return await task(isCurrent);
            } finally {
                release();
            }
        }
    };
}
