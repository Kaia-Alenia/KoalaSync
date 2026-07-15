export function buildChatRelayPayload(ciphertext) {
    return { ciphertext };
}

export function encodeSocketEvent(event, data, forbiddenSecret = '') {
    const payload = JSON.stringify([event, data]);
    if (forbiddenSecret && payload.includes(forbiddenSecret)) {
        throw new Error('Refusing to send chat secret to relay');
    }
    return `42${payload}`;
}
