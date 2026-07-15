const CHAT_INFO = 'KoalaSync E2E Chat v1';
const SECRET_BYTES = 16;
const IV_BYTES = 12;
const MIN_ENCRYPTED_BYTES = 29;
const MAX_ENCRYPTED_BYTES = 2028;

let cachedKeyPromise = null;
let cachedRoomId = '';
let cachedSecret = '';
let cacheGeneration = 0;

function bytesToBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    try {
        const binary = globalThis.atob(padded);
        const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        return bytesToBase64Url(bytes) === value ? bytes : null;
    } catch (_) {
        return null;
    }
}

export function generateChatSecret(cryptoImpl = globalThis.crypto) {
    const bytes = new Uint8Array(SECRET_BYTES);
    cryptoImpl.getRandomValues(bytes);
    return bytesToBase64Url(bytes);
}

export function validateChatSecret(value) {
    const bytes = base64UrlToBytes(value);
    return bytes?.length === SECRET_BYTES ? value : '';
}

export function countCodePoints(value) {
    return [...String(value ?? '')].length;
}

export function normalizeOutgoingChatText(value) {
    if (typeof value !== 'string') throw new TypeError('Chat message must be text');
    const text = value.trim();
    if (!text) throw new TypeError('Chat message must not be empty');
    if (countCodePoints(text) > 500) throw new RangeError('Chat message exceeds 500 Unicode code points');
    return text;
}

export function clearChatKeyCache() {
    cacheGeneration++;
    cachedKeyPromise = null;
    cachedRoomId = '';
    cachedSecret = '';
}

export async function deriveChatKey(roomId, secret, cryptoImpl = globalThis.crypto) {
    const validSecret = validateChatSecret(secret);
    if (!roomId || !validSecret) throw new TypeError('Valid roomId and chat secret are required');
    if (cachedKeyPromise && cachedRoomId === roomId && cachedSecret === validSecret) return cachedKeyPromise;

    const encoder = new globalThis.TextEncoder();
    const generation = cacheGeneration;
    const keyPromise = (async () => {
        const material = await cryptoImpl.subtle.importKey(
            'raw', base64UrlToBytes(validSecret), { name: 'HKDF' }, false, ['deriveKey']
        );
        return cryptoImpl.subtle.deriveKey({
            name: 'HKDF',
            hash: 'SHA-256',
            salt: encoder.encode(roomId),
            info: encoder.encode(CHAT_INFO)
        }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    })();
    cachedKeyPromise = keyPromise;
    cachedRoomId = roomId;
    cachedSecret = validSecret;
    try {
        return await keyPromise;
    } catch (error) {
        if (generation === cacheGeneration && cachedKeyPromise === keyPromise) clearChatKeyCache();
        throw error;
    }
}

export async function encryptChatMessage({ text, roomId, senderId, secret }, cryptoImpl = globalThis.crypto) {
    const plaintext = normalizeOutgoingChatText(text);
    if (!senderId) throw new TypeError('senderId is required');
    const key = await deriveChatKey(roomId, secret, cryptoImpl);
    const encoder = new globalThis.TextEncoder();
    const iv = new Uint8Array(IV_BYTES);
    cryptoImpl.getRandomValues(iv);
    const encrypted = new Uint8Array(await cryptoImpl.subtle.encrypt({
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`${roomId}|${senderId}`)
    }, key, encoder.encode(plaintext)));
    const envelope = new Uint8Array(iv.length + encrypted.length);
    envelope.set(iv);
    envelope.set(encrypted, iv.length);
    return bytesToBase64Url(envelope);
}

export async function decryptChatMessage({ ciphertext, roomId, senderId, secret }, cryptoImpl = globalThis.crypto) {
    if (!senderId) throw new TypeError('senderId is required');
    const bytes = base64UrlToBytes(ciphertext);
    if (!bytes || bytes.length < MIN_ENCRYPTED_BYTES || bytes.length > MAX_ENCRYPTED_BYTES) {
        throw new TypeError('Invalid chat ciphertext');
    }
    const key = await deriveChatKey(roomId, secret, cryptoImpl);
    const encoder = new globalThis.TextEncoder();
    const plaintext = await cryptoImpl.subtle.decrypt({
        name: 'AES-GCM',
        iv: bytes.slice(0, IV_BYTES),
        additionalData: encoder.encode(`${roomId}|${senderId}`)
    }, key, bytes.slice(IV_BYTES));
    const text = new globalThis.TextDecoder('utf-8', { fatal: true }).decode(plaintext);
    return normalizeOutgoingChatText(text);
}
