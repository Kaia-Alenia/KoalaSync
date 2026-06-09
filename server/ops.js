import crypto from 'crypto';

export function checkCooldown(cooldowns, key, windowMs, now = Date.now()) {
    const lastAllowedAt = cooldowns.get(key) || 0;
    if (now - lastAllowedAt < windowMs) {
        return false;
    }
    cooldowns.set(key, now);
    return true;
}

export function getCachedPayload(cache, key, ttlMs, buildPayload, now = Date.now()) {
    const cached = cache.get(key);
    if (cached && now - cached.createdAt < ttlMs) {
        return cached.payload;
    }

    const payload = buildPayload();
    cache.set(key, { createdAt: now, payload });
    return payload;
}

export function isAdminMetricsAuthorized(authHeader, adminToken) {
    if (!adminToken || typeof adminToken !== 'string') return false;
    if (!authHeader || typeof authHeader !== 'string') return false;

    const prefix = 'Bearer ';
    if (!authHeader.startsWith(prefix)) return false;

    const provided = authHeader.slice(prefix.length);
    if (!provided) return false;

    const expectedBuffer = Buffer.from(adminToken);
    const providedBuffer = Buffer.from(provided);

    if (expectedBuffer.length !== providedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function isAdminMetricsTokenStrong(adminToken, minLength = 32) {
    return !adminToken || (typeof adminToken === 'string' && adminToken.length >= minLength);
}

export function buildHealthPayload({
    rooms,
    connections,
    includeMetrics = false,
    now = Date.now(),
    uptime = 0,
    memoryUsage = () => process.memoryUsage(),
    rateLimitSizes = {},
    rateLimitDenied = {}
}) {
    const payload = {
        status: 'ok',
        uptime,
        rooms: rooms.size,
        connections,
        timestamp: now
    };

    if (!includeMetrics) return payload;

    const roomValues = Array.from(rooms.values());
    const roomSizes = roomValues.map(room => room.peers?.size || 0);
    const peers = roomSizes.reduce((sum, size) => sum + size, 0);
    const maxPeersInRoom = roomSizes.length > 0 ? Math.max(...roomSizes) : 0;
    const avgPeersPerRoom = roomSizes.length > 0
        ? Math.round((peers / roomSizes.length) * 100) / 100
        : 0;
    const mem = memoryUsage();

    return {
        ...payload,
        peers,
        roomsWithLobby: roomValues.filter(room => !!room.activeLobby).length,
        avgPeersPerRoom,
        maxPeersInRoom,
        rateLimits: {
            trackedClients: {
                connections: rateLimitSizes.connections || 0,
                events: rateLimitSizes.events || 0,
                health: rateLimitSizes.health || 0,
                adminMetricsAuth: rateLimitSizes.adminMetricsAuth || 0,
                authFailures: rateLimitSizes.authFailures || 0,
                roomList: rateLimitSizes.roomList || 0
            },
            denied: {
                connections: rateLimitDenied.connections || 0,
                events: rateLimitDenied.events || 0,
                health: rateLimitDenied.health || 0,
                adminMetricsAuth: rateLimitDenied.adminMetricsAuth || 0,
                roomList: rateLimitDenied.roomList || 0
            }
        },
        memory: {
            rss: mem.rss,
            heapUsed: mem.heapUsed,
            heapTotal: mem.heapTotal
        }
    };
}
