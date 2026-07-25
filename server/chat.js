import { randomUUID } from 'node:crypto';

export const CHAT_CIPHERTEXT_MAX_BYTES = 2028;
export const CHAT_CIPHERTEXT_MIN_BYTES = 29;

export function normalizeChatCiphertext(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < CHAT_CIPHERTEXT_MIN_BYTES || bytes.length > CHAT_CIPHERTEXT_MAX_BYTES) return null;
    if (bytes.toString('base64url') !== value) return null;
    return value;
}

export function createChatEnvelope(data, senderId, now = Date.now, createId = randomUUID) {
    if (!data || typeof data !== 'object' || typeof senderId !== 'string' || !senderId) return null;
    const ciphertext = normalizeChatCiphertext(data.ciphertext);
    if (!ciphertext) return null;
    return {
        id: createId(),
        senderId,
        timestamp: now(),
        ciphertext
    };
}
