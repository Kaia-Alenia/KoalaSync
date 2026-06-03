import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { EVENTS, OFFICIAL_SERVER_TOKEN, PROTOCOL_VERSION } from '../shared/constants.js';
import {
    buildHealthPayload,
    checkCooldown,
    getCachedPayload,
    isAdminMetricsAuthorized,
    isAdminMetricsTokenStrong
} from './ops.js';

dotenv.config();

function hashPassword(password) {
    if (!password) return null;
    const salt = process.env.SERVER_SALT || 'koalasync_salt_3i';
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

const PORT = process.env.PORT || 3000;
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS) || 1000;
const MAX_PEERS_PER_ROOM = parseInt(process.env.MAX_PEERS_PER_ROOM) || 25;
const MIN_VERSION = process.env.MIN_VERSION || '1.0.0';
const ADMIN_METRICS_TOKEN = process.env.ADMIN_METRICS_TOKEN || '';
const ROOM_LIST_COOLDOWN_MS = 10000;
export const HEALTH_RATE_LIMIT_PER_MINUTE = 10;
export const ADMIN_METRICS_AUTH_RATE_LIMIT_PER_MINUTE = 5;
const HEALTH_RESPONSE_CACHE_TTL_MS = 60000;

if (!isAdminMetricsTokenStrong(ADMIN_METRICS_TOKEN)) {
    console.warn('[SECURITY] ADMIN_METRICS_TOKEN is set but shorter than 32 characters. Use a long random token.');
}

export const app = express();
app.set('trust proxy', 1); // For real client IP through reverse proxy

export const healthResponseCache = new Map();

// Health Check with Rate Limiting
app.get('/', (req, res) => {
    const clientIp = req.ip;
    if (!checkHealthRate(clientIp)) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(getCachedPayload(
        healthResponseCache,
        'root',
        HEALTH_RESPONSE_CACHE_TTL_MS,
        () => ({ status: 'online', service: 'KoalaSync Relay' })
    ));
});

app.get('/health', (req, res) => {
    const clientIp = req.ip;
    if (!checkHealthRate(clientIp)) {
        return res.status(429).json({ error: 'Rate limited' });
    }
    const authHeader = req.get('authorization');
    const includeMetrics = isAdminMetricsAuthorized(authHeader, ADMIN_METRICS_TOKEN);
    if (ADMIN_METRICS_TOKEN && authHeader && !includeMetrics && !checkAdminMetricsAuthRate(clientIp)) {
        return res.status(429).json({ error: 'Rate limited' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(getCachedPayload(
        healthResponseCache,
        includeMetrics ? 'health-admin' : 'health-basic',
        HEALTH_RESPONSE_CACHE_TTL_MS,
        () => buildHealthPayload({
            rooms,
            connections: io.engine?.clientsCount ?? 0,
            includeMetrics,
            uptime: process.uptime(),
            rateLimitSizes: {
                connections: connectionCounts.size,
                events: eventCounts.size,
                health: healthCounts.size,
                adminMetricsAuth: adminMetricsAuthCounts.size,
                authFailures: failedAuthAttempts.size,
                roomList: roomListCooldowns.size
            }
        })
    ));
});

export const httpServer = createServer(app);

// Socket.IO setup with security constraints
export const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || origin === 'https://sync.koalastuff.net' || origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
                callback(null, true);
            } else {
                log('CORS', `Rejected origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"]
    },
    maxHttpBufferSize: 4096, // 4KB max per message (headroom for JOIN_ROOM payloads)
    transports: ['websocket'],
    allowUpgrades: false
});

/**
 * In-memory storage
 */
export const rooms = new Map();
const socketToRoom = new Map();
const peerToSocket = new Map(); // peerId -> socketId (Global lookup)
const roomCreationLocks = new Map(); // roomId -> Promise (prevents race on room creation)

function log(type, message, details = '') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`, details);
}

// Rate Limiting & Security
export const connectionCounts = new Map(); // ip -> { count, resetTime }
const failedAuthAttempts = new Map(); // Map<IP+RoomID, {count, lastAttempt}>

function checkAuthRate(ip, roomId) {
    const key = `${ip}:${roomId}`;
    const now = Date.now();
    const record = failedAuthAttempts.get(key) || { count: 0, lastAttempt: 0 };
    
    // Block for 15 mins if 5 fails in 2 mins
    if (record.count >= 5 && (now - record.lastAttempt) < 15 * 60 * 1000) {
        return false;
    }
    
    // Reset if last attempt was long ago
    if ((now - record.lastAttempt) > 2 * 60 * 1000) {
        record.count = 0;
    }
    
    return true;
}

function recordAuthFailure(ip, roomId) {
    if (failedAuthAttempts.size > 50000) {
        const now = Date.now();
        // 1. Clear expired entries (> 15 mins)
        for (const [key, record] of failedAuthAttempts.entries()) {
            if (now - record.lastAttempt > 15 * 60 * 1000) {
                failedAuthAttempts.delete(key);
            } else {
                break; // Since entries are insertion-ordered by time, all subsequent entries are newer
            }
        }
        
        // 2. If still over 50k, perform LRU-style eviction on the oldest 10,000 entries (first items in Map order)
        if (failedAuthAttempts.size > 50000) {
            log('SECURITY', 'failedAuthAttempts size exceeded 50000. Performing insertion-order eviction.');
            for (const [key] of failedAuthAttempts.entries()) {
                if (failedAuthAttempts.size <= 40000) {
                    break;
                }
                failedAuthAttempts.delete(key);
            }
        }
    }
    const key = `${ip}:${roomId}`;
    const record = failedAuthAttempts.get(key) || { count: 0, lastAttempt: 0 };
    record.count++;
    record.lastAttempt = Date.now();
    failedAuthAttempts.delete(key); // Remove first to update insertion order (moves key to the end of iteration)
    failedAuthAttempts.set(key, record);
}

// Periodically clean up old auth failure records (every 15 minutes)
const authFailureCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of failedAuthAttempts.entries()) {
        if (now - record.lastAttempt > 15 * 60 * 1000) {
            failedAuthAttempts.delete(key);
        }
    }
}, 15 * 60 * 1000);

export const eventCounts = new Map(); // socketId -> { count, resetTime }
export const healthCounts = new Map(); // ip -> { count, resetTime }
export const adminMetricsAuthCounts = new Map(); // ip -> { count, resetTime }
const roomListCooldowns = new Map(); // socketId -> last allowed timestamp

// Clean up connection counts and event counts to prevent memory leak
const rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of connectionCounts.entries()) {
        if (now > entry.resetTime) {
            connectionCounts.delete(ip);
        }
    }
    for (const [socketId, entry] of eventCounts.entries()) {
        if (now > entry.resetTime || !io.sockets.sockets.has(socketId)) {
            eventCounts.delete(socketId);
        }
    }
    for (const [ip, entry] of healthCounts.entries()) {
        if (now > entry.resetTime) {
            healthCounts.delete(ip);
        }
    }
    for (const [ip, entry] of adminMetricsAuthCounts.entries()) {
        if (now > entry.resetTime) {
            adminMetricsAuthCounts.delete(ip);
        }
    }
    for (const [socketId] of roomListCooldowns.entries()) {
        if (!io.sockets.sockets.has(socketId)) {
            roomListCooldowns.delete(socketId);
        }
    }
}, 60000);

function checkConnectionRate(ip) {
    const now = Date.now();
    const entry = connectionCounts.get(ip) || { count: 0, resetTime: now + 60000 };
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 60000; }
    entry.count++;
    connectionCounts.set(ip, entry);
    return entry.count <= 10;
}

function checkEventRate(socketId) {
    const now = Date.now();
    const entry = eventCounts.get(socketId) || { count: 0, resetTime: now + 10000 };
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 10000; }
    entry.count++;
    eventCounts.set(socketId, entry);
    return entry.count <= 30;
}

function checkHealthRate(ip) {
    const now = Date.now();
    const entry = healthCounts.get(ip) || { count: 0, resetTime: now + 60000 };
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 60000; }
    entry.count++;
    healthCounts.set(ip, entry);
    return entry.count <= HEALTH_RATE_LIMIT_PER_MINUTE;
}

function checkAdminMetricsAuthRate(ip) {
    const now = Date.now();
    const entry = adminMetricsAuthCounts.get(ip) || { count: 0, resetTime: now + 60000 };
    if (now > entry.resetTime) { entry.count = 0; entry.resetTime = now + 60000; }
    entry.count++;
    adminMetricsAuthCounts.set(ip, entry);
    return entry.count <= ADMIN_METRICS_AUTH_RATE_LIMIT_PER_MINUTE;
}

/**
 * Central peer teardown. Removes a socket from all room state and notifies
 * remaining peers. Call this from every disconnect/leave/reaper/dedupe path.
 *
 * @param {string}  socketId   - The socket.id being removed.
 * @param {string}  roomId     - The room it belongs to.
 * @param {string}  reason     - Log label ('disconnect', 'leave', 'reaper', 'dedupe', 'room-switch').
 */
function removePeerFromRoom(socketId, roomId, reason) {
    const room = rooms.get(roomId);
    if (!room) return;

    const peerData = room.peerData.get(socketId);
    if (!peerData) return; // Already cleaned up

    const { peerId } = peerData;

    // 1. Remove from room data structures
    room.peers.delete(socketId);
    room.peerIds.delete(socketId);
    room.peerData.delete(socketId);

    // 2. Remove from global maps
    socketToRoom.delete(socketId);
    const currentSocketId = peerToSocket.get(peerId);
    if (currentSocketId === socketId) {
        peerToSocket.delete(peerId);
    }

    // 3. Notify remaining peers (use io.to so the removed socket itself
    //    doesn't receive it — it has already left or is disconnecting)
    const isPeerStillConnected = Array.from(room.peerData.values()).some(data => data.peerId === peerId);
    if (!isPeerStillConnected) {
        io.to(roomId).emit(EVENTS.PEER_STATUS, { peerId, status: 'left' });
    }

    // 3.5. Clean up active lobby if a peer leaves
    if (room.activeLobby) {
        room.activeLobby.readyPeers = room.activeLobby.readyPeers.filter(id => id !== peerId);
        if (room.activeLobby.readyPeers.length <= 1 || room.activeLobby.initiatorPeerId === peerId) {
            room.activeLobby = null; // Dissolve lobby
        }
    }

    // 4. Delete empty room
    if (room.peers.size === 0) {
        rooms.delete(roomId);
        log('ROOM', `Deleted empty room after ${reason}: ${roomId.substring(0, 3)}***`);
    }

    log('ROOM', `Peer ${peerId} removed (${reason}) from room ${roomId.substring(0, 3)}***`);
}

io.on('connection', (socket) => {
    // Get real client IP behind proxy/CDN
    const forwardedFor = socket.handshake.headers['x-forwarded-for'];
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : socket.handshake.address;
    socket._clientIp = clientIp;
    
    // 1. Connection Rate Limit
    if (!checkConnectionRate(clientIp)) {
        log('SECURITY', `Rate limit exceeded for IP: ${clientIp}`);
        socket.disconnect(true);
        return;
    }

    // 2. Token & Version Validation
    const clientToken = socket.handshake.query.token;
    const clientVersion = socket.handshake.query.version;

    if (clientToken !== OFFICIAL_SERVER_TOKEN) {
        log('AUTH', `Unauthorized connection attempt from ${clientIp}`);
        socket.emit(EVENTS.ERROR, { message: 'Unauthorized' });
        socket.disconnect(true);
        return;
    }

    if (clientVersion) {
        if (typeof clientVersion !== 'string') {
            log('AUTH', `Invalid version type from ${clientIp}`);
            socket.emit(EVENTS.ERROR, { message: 'Invalid version format' });
            socket.disconnect(true);
            return;
        }
        const parts = clientVersion.split('.').map(Number);
        const cMaj = parts[0], cMin = parts[1], cPatch = parts[2] || 0;
        const [mMaj, mMin, mPatch] = MIN_VERSION.split('.').map(Number);
        if (isNaN(cMaj) || isNaN(cMin) || isNaN(cPatch)) {
            log('AUTH', `Invalid version format (${clientVersion}) from ${clientIp}`);
            socket.emit(EVENTS.ERROR, { message: 'Invalid version format' });
            socket.disconnect(true);
            return;
        }
        const tooOld = cMaj < mMaj || (cMaj === mMaj && cMin < mMin) || (cMaj === mMaj && cMin === mMin && cPatch < mPatch);
        if (tooOld) {
            log('AUTH', `Version too old (${clientVersion}) from ${clientIp}`);
            socket.emit(EVENTS.ERROR, { message: `Version too old. Minimum: ${MIN_VERSION}` });
            socket.disconnect(true);
            return;
        }
    }

    log('CONN', `New connection: ${socket.id} from ${clientIp}`);

    socket.on(EVENTS.JOIN_ROOM, async (payload) => {
        if (!checkEventRate(socket.id)) {
            log('SECURITY', `Event rate limit exceeded for socket (JOIN): ${socket.id}`);
            socket.disconnect(true);
            return;
        }
        if (!payload || typeof payload.roomId !== 'string') return;

        // --- S-1 & S-5: Sanitize and clamp all incoming fields ---
        const password        = typeof payload.password === 'string' ? payload.password.substring(0, 128) : null;
        const peerId          = typeof payload.peerId === 'string' ? payload.peerId.substring(0, 16) : null;
        const protocolVersion = typeof payload.protocolVersion === 'string' ? payload.protocolVersion.substring(0, 16) : null;
        const roomId   = String(payload.roomId || '').replace(/[^a-zA-Z0-9\-]/g, '').substring(0, 64);
        const username = typeof payload.username  === 'string' ? payload.username.substring(0, 30)  : null;
        const tabTitle = typeof payload.tabTitle  === 'string' ? payload.tabTitle.substring(0, 100) : null;
        const mediaTitle = typeof payload.mediaTitle === 'string' ? payload.mediaTitle.substring(0, 100) : null;

        if (!roomId || !peerId) return; // Guard: empty or invalid after sanitization

        try {
            // Protocol check
            if (protocolVersion !== PROTOCOL_VERSION) {
                log('AUTH', `Protocol mismatch from ${peerId}: ${protocolVersion}`);
                socket.emit(EVENTS.ERROR, { message: 'Incompatible protocol version' });
                return;
            }

            // Cleanup old room if re-joining
            const oldMapping = socketToRoom.get(socket.id);
            if (oldMapping && oldMapping.roomId === roomId && oldMapping.peerId === peerId) {
                return; // Already in this room with same peerId, ignore to prevent spam
            }
            if (oldMapping && oldMapping.roomId !== roomId) {
                socket.leave(oldMapping.roomId);
                removePeerFromRoom(socket.id, oldMapping.roomId, 'room-switch');
            }

            const ip = socket._clientIp || socket.handshake.address;
            if (!checkAuthRate(ip, roomId)) {
                log('AUTH', `Auth rate limit blocked ${ip} from room ${roomId.substring(0, 3)}***`);
                socket.emit(EVENTS.ERROR, { message: "Too many failed attempts. Try again later." });
                return;
            }

            let room = rooms.get(roomId);
            let createdByMe = false;

            if (!room) {
                // Acquire per-room creation lock to prevent race conditions
                let lockPromise = roomCreationLocks.get(roomId);
                if (lockPromise) {
                    await lockPromise;
                    room = rooms.get(roomId);
                }
                if (!room) {
                    // Create and store lock before async boundary
                    let resolveLock;
                    lockPromise = new Promise(resolve => { resolveLock = resolve; });
                    roomCreationLocks.set(roomId, lockPromise);
                    try {
                        if (rooms.size >= MAX_ROOMS) {
                            log('ROOM', `Server at capacity: ${rooms.size}/${MAX_ROOMS} rooms — rejecting join`);
                            socket.emit(EVENTS.ERROR, { message: "Server capacity reached" });
                            return;
                        }

                        const passwordHash = hashPassword(password);
                        room = {
                            passwordHash,
                            peers: new Set(),
                            peerIds: new Map(),
                            peerData: new Map(),
                            lastActivity: Date.now()
                        };
                        rooms.set(roomId, room);
                        createdByMe = true;
                        log('ROOM', `Created room: ${roomId.substring(0, 3)}***`);
                    } finally {
                        roomCreationLocks.delete(roomId);
                        resolveLock();
                    }
                }
            }

            if (!room) {
                socket.emit(EVENTS.ERROR, { message: "Join error" });
                return;
            }

            if (!createdByMe) {
                if (room.passwordHash) {
                    if (!password || hashPassword(password) !== room.passwordHash) {
                        recordAuthFailure(ip, roomId);
                        log('AUTH', `Invalid password from ${ip} for room ${roomId.substring(0, 3)}***`);
                        socket.emit(EVENTS.ERROR, { message: "Invalid password" });
                        return;
                    }
                }
                if (room.peers.size >= MAX_PEERS_PER_ROOM) {
                    log('ROOM', `Room full (${room.peers.size}/${MAX_PEERS_PER_ROOM}): ${roomId.substring(0, 3)}***`);
                    socket.emit(EVENTS.ERROR, { message: "Room full" });
                    return;
                }

                // Peer Deduplication: Remove existing socket for the same peerId
                const dedupeSids = [];
                for (const [sid, data] of room.peerData.entries()) {
                    if (data.peerId === peerId && sid !== socket.id) {
                        dedupeSids.push(sid);
                    }
                }
                for (const sid of dedupeSids) {
                    // Re-check: the socket might have been replaced by another concurrent join
                    const currentMapping = room.peerData.get(sid);
                    if (!currentMapping || currentMapping.peerId !== peerId) continue;
                    
                    const oldSocket = io.sockets.sockets.get(sid);
                    if (oldSocket) {
                        oldSocket.emit(EVENTS.ERROR, { message: 'Deduplication: Another session with this ID joined. Disconnecting...' });
                        oldSocket.leave(roomId);
                        oldSocket.disconnect(true);
                        log('DEDUPE', `Kicked old session for peer ${peerId}`);
                    }
                    removePeerFromRoom(sid, roomId, 'dedupe');
                }
            }

            socket.join(roomId);
            room.peers.add(socket.id);
            room.peerIds.set(socket.id, peerId);
            room.peerData.set(socket.id, { 
                peerId, 
                username: username || null, 
                tabTitle: tabTitle || null,
                mediaTitle: mediaTitle || null,
                lastSeen: Date.now() 
            });
            socketToRoom.set(socket.id, { roomId, peerId });
            peerToSocket.set(peerId, socket.id);

            socket.to(roomId).emit(EVENTS.PEER_STATUS, { peerId, username: username || null, tabTitle: tabTitle || null, mediaTitle: mediaTitle || null, status: 'joined' });
            socket.emit(EVENTS.ROOM_DATA, { 
                roomId, 
                peers: Array.from(room.peers).map(sid => room.peerData.get(sid)),
                activeLobby: room.activeLobby || null
            });
            log('ROOM', `Peer ${peerId} joined: ${roomId.substring(0, 3)}***`);
        } catch (err) {
            log('ERROR', `Join error for ${socket.id}`, err);
            if (socket.connected) {
                socket.emit(EVENTS.ERROR, { message: "Join error" });
            }
        }
    });

    // Relay Loop with Rate Limiting
    const relayEvents = [
        EVENTS.PLAY, EVENTS.PAUSE, EVENTS.SEEK, 
        EVENTS.PEER_STATUS, EVENTS.FORCE_SYNC_PREPARE, 
        EVENTS.FORCE_SYNC_ACK, EVENTS.FORCE_SYNC_EXECUTE,
        EVENTS.EPISODE_LOBBY, EVENTS.EPISODE_READY,
        EVENTS.EPISODE_LOBBY_CANCEL
    ];

    relayEvents.forEach(eventName => {
        socket.on(eventName, (data) => {
            try {
                if (!checkEventRate(socket.id)) {
                    log('SECURITY', `Event rate limit exceeded for socket: ${socket.id}`);
                    socket.disconnect(true);
                    return;
                }

                if (!data || typeof data !== 'object') return;

                const mapping = socketToRoom.get(socket.id);
                if (mapping) {
                    const room = rooms.get(mapping.roomId);
                    if (room) {
                    room.lastActivity = Date.now();
                    
                    // --- S-2 & S-3: Sanitize ALL relay fields (strings, numbers, booleans) ---
                    const clamp    = (val, max) => typeof val === 'string' ? val.substring(0, max) : undefined;
                    const clampNum = (val, min, max) => typeof val === 'number' && Number.isFinite(val) ? Math.max(min, Math.min(max, val)) : undefined;
                    const validState = (val) => (val === 'playing' || val === 'paused') ? val : undefined;
                    const validBool  = (val) => typeof val === 'boolean' ? val : undefined;

                    const existing = room.peerData.get(socket.id) || { peerId: mapping.peerId };
                    room.peerData.set(socket.id, { 
                        ...existing,
                        username:      data.username      !== undefined ? (clamp(data.username, 30)   ?? existing.username)      : existing.username,
                        tabTitle:      data.tabTitle      !== undefined ? (clamp(data.tabTitle, 100)  ?? existing.tabTitle)      : existing.tabTitle,
                        mediaTitle:    data.mediaTitle    !== undefined ? (clamp(data.mediaTitle, 100) ?? existing.mediaTitle)   : existing.mediaTitle,
                        playbackState: data.playbackState !== undefined ? (validState(data.playbackState) ?? existing.playbackState) : existing.playbackState,
                        currentTime:   data.currentTime   !== undefined ? (clampNum(data.currentTime, 0, 86400) ?? existing.currentTime)   : existing.currentTime,
                        volume:        data.volume        !== undefined ? (clampNum(data.volume, 0, 1) ?? existing.volume)                 : existing.volume,
                        muted:         data.muted         !== undefined ? (validBool(data.muted) ?? existing.muted)                       : existing.muted,
                        lastSeen: Date.now()
                    });

                    // --- S-3: Construct clean relay payload — never forward raw client data ---
                    const relayPayload = {
                        senderId:        mapping.peerId,
                        seq:             clampNum(data.seq, 0, Number.MAX_SAFE_INTEGER),
                        currentTime:     clampNum(data.currentTime, 0, 86400),
                        targetTime:      clampNum(data.targetTime, 0, 86400),
                        playbackState:   validState(data.playbackState),
                        username:        clamp(data.username, 30),
                        tabTitle:        clamp(data.tabTitle, 100),
                        mediaTitle:      clamp(data.mediaTitle, 100),
                        volume:          clampNum(data.volume, 0, 1),
                        muted:           validBool(data.muted),
                        peerId:          mapping.peerId,
                        status:          typeof data.status === 'string' ? data.status.substring(0, 16) : undefined,
                        expectedTitle:   clamp(data.expectedTitle, 100),
                        title:           clamp(data.title, 100),
                        actionTimestamp:  clampNum(data.actionTimestamp, 0, Number.MAX_SAFE_INTEGER),
                    };
                    // Strip undefined keys for clean wire format
                    Object.keys(relayPayload).forEach(k => relayPayload[k] === undefined && delete relayPayload[k]);
                    socket.to(mapping.roomId).emit(eventName, relayPayload);

                    // --- Side-effects: Server-side Episode Lobby Tracking ---
                    if (eventName === EVENTS.EPISODE_LOBBY && relayPayload.expectedTitle) {
                        room.activeLobby = {
                            expectedTitle: relayPayload.expectedTitle,
                            initiatorPeerId: mapping.peerId,
                            readyPeers: [mapping.peerId]
                        };
                    } else if (eventName === EVENTS.EPISODE_READY && room.activeLobby) {
                        if (!room.activeLobby.readyPeers.includes(mapping.peerId)) {
                            room.activeLobby.readyPeers.push(mapping.peerId);
                        }
                    } else if ((eventName === EVENTS.FORCE_SYNC_PREPARE || eventName === EVENTS.FORCE_SYNC_EXECUTE || eventName === EVENTS.EPISODE_LOBBY_CANCEL) && room.activeLobby) {
                        room.activeLobby = null;
                    }
                    }
                }
            } catch (err) {
                log('ERROR', `Relay handler error for ${eventName}: ${err.message}`);
            }
        });
    });

    socket.on(EVENTS.GET_ROOMS, () => {
        if (!checkEventRate(socket.id)) {
            log('SECURITY', `Event rate limit exceeded for socket (GET_ROOMS): ${socket.id}`);
            socket.disconnect(true);
            return;
        }
        if (!checkCooldown(roomListCooldowns, socket.id, ROOM_LIST_COOLDOWN_MS)) {
            socket.emit(EVENTS.ERROR, { message: 'Room list refresh is rate limited. Try again in a few seconds.' });
            return;
        }
        const list = Array.from(rooms.entries()).map(([id, r]) => ({
            id,
            peerCount: r.peers.size,
            hasPassword: !!r.passwordHash
        }));
        socket.emit(EVENTS.ROOM_LIST, { rooms: list });
    });

    socket.on(EVENTS.LEAVE_ROOM, () => {
        const mapping = socketToRoom.get(socket.id);
        if (mapping) {
            socket.leave(mapping.roomId);
            removePeerFromRoom(socket.id, mapping.roomId, 'leave');
        }
    });

    socket.on(EVENTS.EVENT_ACK, (data) => {
        if (!checkEventRate(socket.id)) {
            log('SECURITY', `Event rate limit exceeded for socket (ACK): ${socket.id}`);
            socket.disconnect(true);
            return;
        }
        if (!data || typeof data !== 'object') return;
        if (typeof data.targetId !== 'string') return;
        if (data.actionTimestamp !== undefined && (typeof data.actionTimestamp !== 'number' || !Number.isFinite(data.actionTimestamp))) return;
        
        const senderMapping = socketToRoom.get(socket.id);
        const targetSocketId = peerToSocket.get(data.targetId);
        const targetMapping = targetSocketId ? socketToRoom.get(targetSocketId) : null;

        // Security: Only relay ACK if both peers are in the same room
        if (senderMapping && targetMapping && senderMapping.roomId === targetMapping.roomId) {
            io.to(targetSocketId).emit(EVENTS.EVENT_ACK, { 
                senderId: senderMapping.peerId,
                actionTimestamp: data.actionTimestamp
            });
        } else {
            log('SECURITY', `Blocked cross-room ACK attempt from ${socket.id} to ${data.targetId}`);
        }
    });

    socket.on('disconnect', () => {
        eventCounts.delete(socket.id);
        roomListCooldowns.delete(socket.id);
        const mapping = socketToRoom.get(socket.id);
        if (mapping) {
            // Socket is already disconnected — no need to call socket.leave().
            // removePeerFromRoom uses io.to() for notifications, which correctly
            // excludes this dead socket since it has already left all rooms.
            removePeerFromRoom(socket.id, mapping.roomId, 'disconnect');
        }
    });
});

// Active Room & Dead Peer Cleanup (Every 2m)
const roomCleanupInterval = setInterval(() => {
    const now = Date.now();
    const roomCutoff = now - (2 * 60 * 60 * 1000); // 2 hours
    const peerCutoff = now - (5 * 60 * 1000);      // 5 minutes
    
    // Snapshot room keys to avoid mutation during iteration
    const roomIds = Array.from(rooms.keys());
    for (const roomId of roomIds) {
        const room = rooms.get(roomId);
        if (!room) continue; // Room may have been deleted between snapshot and now
        // 1. Prune dead peers
        // Snapshot keys first — we must not mutate peerData while iterating it.
        const staleSids = [];
        for (const [sid, data] of room.peerData.entries()) {
            if (data.lastSeen && data.lastSeen < peerCutoff) {
                staleSids.push(sid);
            }
        }
        for (const sid of staleSids) {
            // Gracefully evict the socket from the Socket.IO room if it is
            // still technically connected (zombie with no heartbeat).
            const deadSocket = io.sockets?.sockets?.get(sid);
            if (deadSocket) deadSocket.leave(roomId);
            log('CLEANUP', `Pruning dead peer from room ${roomId.substring(0, 3)}***`);
            removePeerFromRoom(sid, roomId, 'reaper');
        }

        // 2. Prune empty or inactive rooms
        const currentRoom = rooms.get(roomId);
        if (currentRoom && (currentRoom.peers.size === 0 || currentRoom.lastActivity < roomCutoff)) {
            io.to(roomId).emit(EVENTS.ERROR, { message: 'Room closed' });
            rooms.delete(roomId);
            log('CLEANUP', `Deleted room ${roomId.substring(0, 3)}*** (Empty/Inactive)`);
        }
    }
}, 2 * 60 * 1000);

export function startServer(port = PORT, host) {
    if (httpServer.listening) return Promise.resolve(httpServer);
    return new Promise((resolve, reject) => {
        const onError = (err) => {
            httpServer.off('listening', onListening);
            reject(err);
        };
        const onListening = () => {
            httpServer.off('error', onError);
            const address = httpServer.address();
            const actualPort = address && typeof address === 'object' ? address.port : port;
            log('SERVER', `KoalaSync Relay running on port ${actualPort}`);
            resolve(httpServer);
        };
        httpServer.once('error', onError);
        httpServer.once('listening', onListening);
        if (host) {
            httpServer.listen(port, host);
        } else {
            httpServer.listen(port);
        }
    });
}

// --- M-4: Graceful Shutdown ---
function gracefulShutdown(signal) {
    log('SERVER', `${signal} received — starting graceful shutdown...`);
    // 1. Notify all connected clients so they can display a meaningful message
    io.emit(EVENTS.ERROR, { message: 'Server is restarting. Please reconnect in a moment.' });
    // 2. Stop accepting new HTTP connections
    httpServer.close(() => {
        log('SERVER', 'HTTP server closed. Exiting.');
        process.exit(0);
    });
    // 3. Safety net: force-exit after 5s if connections don't drain
    setTimeout(() => {
        log('SERVER', 'Force-exit after timeout.');
        process.exit(1);
    }, 5000);
}

export async function stopServerForTests() {
    clearInterval(authFailureCleanupInterval);
    clearInterval(rateLimitCleanupInterval);
    clearInterval(roomCleanupInterval);
    rooms.clear();
    socketToRoom.clear();
    peerToSocket.clear();
    roomCreationLocks.clear();
    connectionCounts.clear();
    failedAuthAttempts.clear();
    eventCounts.clear();
    healthCounts.clear();
    adminMetricsAuthCounts.clear();
    roomListCooldowns.clear();
    healthResponseCache.clear();
    io.removeAllListeners();
    io.disconnectSockets(true);
    if (!httpServer.listening) return;
    await new Promise((resolve, reject) => {
        httpServer.close((err) => err ? reject(err) : resolve());
    });
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
    startServer(PORT);

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    process.on('uncaughtException', (err) => {
        log('ERROR', `Uncaught exception: ${err.message}`, err.stack);
        process.exit(1);
    });

    process.on('unhandledRejection', (reason) => {
        log('ERROR', `Unhandled rejection: ${reason}`);
        process.exit(1);
    });
}
