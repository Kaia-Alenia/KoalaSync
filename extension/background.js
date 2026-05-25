import { EVENTS, PROTOCOL_VERSION, OFFICIAL_SERVER_URL, OFFICIAL_SERVER_TOKEN, APP_VERSION, EPISODE_LOBBY_TIMEOUT, FORCE_SYNC_TIMEOUT } from './shared/constants.js';

// --- State Management ---
let socket = null;
let isConnecting = false;
let peerId = null; // initialized via getPeerId()
let currentRoom = null;
let currentTabId = null;
let currentTabTitle = null; // New: for Smart Matching
let logs = [];
let history = []; // New: for Action History
let storageInitialized = false;
let pendingLogs = [];
let pendingHistory = [];
let eventQueue = [];
let isNamespaceJoined = false;
let lastActionState = { action: null, senderId: null, timestamp: 0, acks: [] };

// --- Boot Sequence Lock ---
let restorationTask = null;

function ensureState() {
    if (!restorationTask) {
        restorationTask = new Promise(resolve => {
            let resolved = false;
            const done = () => { if (!resolved) { resolved = true; resolve(); } };

            const storageTimeout = setTimeout(() => {
                addLog('Storage restoration timed out, continuing with defaults', 'warn');
                storageInitialized = true;
                done();
            }, 10000);

            chrome.storage.session.get([
                'logs', 'history', 'currentRoom', 'lastActionState', 
                'eventQueue', 'isForceSyncInitiator', 'forceSyncAcks', 
                'forceSyncDeadline', 'reconnectFailed', 'reconnectStartTime', 'currentTabId', 'currentTabTitle',
                'episodeLobby'
            ], (data) => {
                clearTimeout(storageTimeout);
                if (data.currentTabId !== undefined) currentTabId = data.currentTabId;
                if (data.currentTabTitle !== undefined) currentTabTitle = data.currentTabTitle;
                // Merge data from storage with any early-arriving state
                // New entries (added during boot) must stay at the top (index 0)
                if (data.logs) logs = [...logs, ...data.logs].slice(0, 200);
                if (data.history) history = [...history, ...data.history].slice(0, 20);
                if (data.currentRoom) currentRoom = data.currentRoom;
                if (data.lastActionState) lastActionState = data.lastActionState;
                
                if (data.eventQueue) eventQueue = [...eventQueue, ...data.eventQueue].slice(0, 50);
                if (data.isForceSyncInitiator !== undefined && isForceSyncInitiator === false) {
                    isForceSyncInitiator = data.isForceSyncInitiator;
                }
                if (data.forceSyncAcks) {
                    const mergedAcks = new Set([...forceSyncAcks, ...data.forceSyncAcks]);
                    forceSyncAcks = mergedAcks;
                }
                if (data.reconnectFailed !== undefined) reconnectFailed = data.reconnectFailed;
                if (data.reconnectStartTime) reconnectStartTime = data.reconnectStartTime;

                // Recover Force Sync Timeout
                if (data.forceSyncDeadline) {
                    const remaining = data.forceSyncDeadline - Date.now();
                    if (remaining > 0 && isForceSyncInitiator) {
                        forceSyncTimeout = setTimeout(() => {
                            if (isForceSyncInitiator) {
                                addLog('Force Sync: Recovered timeout triggered, executing...', 'warn');
                                executeForceSync();
                            }
                        }, remaining);
                    } else if (remaining <= 0 && isForceSyncInitiator) {
                        executeForceSync();
                    }
                }

                // Recover Episode Lobby
                if (data.episodeLobby && !episodeLobby) {
                    episodeLobby = data.episodeLobby;
                    const lobbyRemaining = (episodeLobby.createdAt + EPISODE_LOBBY_TIMEOUT) - Date.now();
                    if (lobbyRemaining > 0) {
                        episodeLobbyTimeout = setTimeout(() => cancelEpisodeLobby('Timeout'), lobbyRemaining);
                    } else {
                        cancelEpisodeLobby('Timeout (recovered)');
                    }
                }

                storageInitialized = true;
                
                // Process any early logs/history that weren't captured in the spread
                if (pendingLogs.length > 0) {
                    logs = [...pendingLogs, ...logs].slice(0, 200);
                    chrome.storage.session.set({ logs });
                    pendingLogs = [];
                }
                if (pendingHistory.length > 0) {
                    history = [...pendingHistory, ...history].slice(0, 20);
                    chrome.storage.session.set({ history });
                    pendingHistory = [];
                }

                done();
            });
        });
    }
    return restorationTask;
}

// Start restoration immediately
ensureState();

let reconnectTimer = null;
let reconnectStartTime = null;
let reconnectFailed = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 20;
const _RECONNECT_BASE_DELAY = 500;
const _RECONNECT_MAX_DELAY = 5000;

// Force Sync Coordination
let isForceSyncInitiator = false;
let forceSyncAcks = new Set();
let forceSyncTimeout = null;

// Episode Auto-Sync Lobby
let episodeLobby = null; // { expectedTitle, initiatorPeerId, readyPeers: [], createdAt }
let episodeLobbyTimeout = null;

// --- Storage Utils ---

/**
 * Canonical peer data factory. All peer object construction must go through
 * here to guarantee a consistent shape with predictable null defaults.
 * @param {object} raw - Raw data from server event or heartbeat payload.
 * @returns {object} Normalized peer data object.
 */
function createPeerData(raw) {
    return {
        peerId:        raw.peerId        || null,
        username:      raw.username      || null,
        tabTitle:      raw.tabTitle      || null,
        mediaTitle:    raw.mediaTitle    || null,
        playbackState: raw.playbackState || null,
        currentTime:   raw.currentTime   != null ? raw.currentTime : null,
        volume:        raw.volume        != null ? raw.volume       : null,
        muted:         raw.muted         != null ? raw.muted        : null,
        lastHeartbeat: Date.now()
    };
}

/**
 * Updates properties of a peer in the room and instantly broadcasts the changes to the popup UI.
 * Also tracks lastReactiveUpdate to guard against older heartbeats in transit overwriting state.
 */
function updateLocalPeerState(targetPeerId, updates) {
    if (!currentRoom || !Array.isArray(currentRoom.peers)) return;
    const peer = currentRoom.peers.find(p => typeof p === 'object' ? p.peerId === targetPeerId : p === targetPeerId);
    if (peer && typeof peer === 'object') {
        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined && updates[key] !== null) {
                peer[key] = updates[key];
            }
        });
        peer.lastReactiveUpdate = Date.now(); // Race condition guard lock
        if (updates.currentTime !== undefined && updates.currentTime !== null) {
            peer.lastHeartbeat = Date.now(); // reset time interpolation baseline
        }
        if (storageInitialized) chrome.storage.session.set({ currentRoom });
        chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: currentRoom.peers }).catch(() => {});
    }
}

async function getPeerId() {
    const data = await chrome.storage.local.get(['peerId']);
    if (data.peerId) return data.peerId;
    const newId = self.crypto.randomUUID().substring(0, 8);
    await chrome.storage.local.set({ peerId: newId });
    return newId;
}

async function getSettings() {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['serverUrl', 'useCustomServer', 'roomId', 'password', 'username'], (data) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            let username = data.username;
            if (!username) {
                const adjs = ['Happy', 'Cool', 'Fast', 'Smart', 'Brave', 'Calm', 'Sneaky', 'Lazy', 'Wild', 'Chill', 'Lucky', 'Epic', 'Swift', 'Bold', 'Mighty', 'Cosmic', 'Neon', 'Shadow', 'Crystal', 'Thunder', 'Silent', 'Golden', 'Fierce', 'Noble', 'Mystic', 'Frozen', 'Blazing', 'Sapphire', 'Iron', 'Crimson'];
                const nouns = ['Koala', 'Panda', 'Tiger', 'Eagle', 'Fox', 'Bear', 'Wolf', 'Lion', 'Hawk', 'Seal', 'Owl', 'Shark', 'Dragon', 'Phoenix', 'Falcon', 'Panther', 'Raven', 'Cobra', 'Lynx', 'Jaguar', 'Orca', 'Mantis', 'Viper', 'Condor', 'Badger', 'Otter', 'Rhino', 'Crane', 'Mongoose', 'Specter'];
                username = `${adjs[Math.floor(Math.random() * adjs.length)]}${nouns[Math.floor(Math.random() * nouns.length)]}`;
                chrome.storage.sync.set({ username }, () => {
                    resolve({
                        serverUrl: data.serverUrl || '',
                        useCustomServer: data.useCustomServer || false,
                        roomId: data.roomId || '',
                        password: data.password || '',
                        username: username
                    });
                });
            } else {
                resolve({
                    serverUrl: data.serverUrl || '',
                    useCustomServer: data.useCustomServer || false,
                    roomId: data.roomId || '',
                    password: data.password || '',
                    username: username
                });
            }
        });
    });
}

function addLog(message, type = 'info') {
    const log = {
        timestamp: new Date().toISOString(),
        message,
        type
    };
    if (!storageInitialized) {
        pendingLogs.unshift(log);
    } else {
        logs.unshift(log);
        if (logs.length > 200) logs.pop();
        chrome.storage.session.set({ logs });
    }
    chrome.runtime.sendMessage({ type: 'LOG_UPDATE', log }).catch(() => {});
}

// --- WebSocket Client ---
async function connect() {
    if (isConnecting) return;
    isConnecting = true;

    let finalUrl = '';
    try {
        // --- Phase 1: Storage ---
        let settings;
        try {
            if (!peerId) peerId = await getPeerId();
            settings = await getSettings();
        } catch (e) {
            throw new Error(`[Storage Error] ${e.message}`);
        }

        // --- Phase 2: Connection Guard ---
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
            if (isNamespaceJoined) {
                isConnecting = false;
                return;
            }
            socket.onopen = null;
            socket.onmessage = null;
            socket.onclose = null;
            socket.onerror = null;
            socket.close();
        }

        if (!navigator.onLine) {
            addLog('Browser is offline. Waiting...', 'warn');
            broadcastConnectionStatus('offline');
            isConnecting = false;
            return;
        }

        if (reconnectFailed) {
            isConnecting = false;
            return;
        }

        broadcastConnectionStatus('reconnecting');
        const isCustomServer = settings.serverUrl && settings.useCustomServer;
        finalUrl = isCustomServer ? settings.serverUrl : OFFICIAL_SERVER_URL;

        // --- Phase 3: URL Validation ---
        try {
            if (isCustomServer) {
                finalUrl = finalUrl.trim();
                if (!finalUrl.includes('://')) {
                    finalUrl = 'ws://' + finalUrl;
                }
                const urlObj = new URL(finalUrl);
                const isLocal = urlObj.hostname === 'localhost' || urlObj.hostname === '127.0.0.1';
                if (urlObj.protocol !== 'wss:' && !isLocal) {
                    urlObj.protocol = 'wss:';
                    finalUrl = urlObj.toString();
                    addLog('Security: Upgraded to wss:// for remote host.', 'warn');
                }
            }
        } catch (e) {
            throw new Error(`[URL Error] ${e.message}`);
        }

        addLog(`Connecting to ${isCustomServer ? finalUrl : 'Official Server'}... (attempt ${reconnectAttempts + 1})`, 'info');

        // --- Phase 4: WebSocket Init ---
        try {
            const url = new URL(finalUrl);
            url.pathname = '/socket.io/';
            url.searchParams.set('EIO', '4');
            url.searchParams.set('transport', 'websocket');
            url.searchParams.set('version', APP_VERSION);
            url.searchParams.set('token', OFFICIAL_SERVER_TOKEN);

            socket = new WebSocket(url.toString());
        } catch (e) {
            throw new Error(`[Connection Error] ${e.message}`);
        }

        // --- Phase 5: Event Listeners ---
        socket.onopen = () => {
            reconnectAttempts = 0;
            addLog('WebSocket Connection Opened', 'success');
            reconnectStartTime = null;
            reconnectFailed = false;
            chrome.storage.session.set({ reconnectFailed: false });
            isNamespaceJoined = false;
            socket.send('40');
        };

        socket.onmessage = async (event) => {
            await ensureState();
            const msg = event.data;
            if (msg === '2') {
                socket.send('3');
                return;
            }
            if (msg.startsWith('0')) {
                addLog(`Socket.IO Handshake: ${msg}`, 'info');
            } else if (msg.startsWith('40')) {
                isConnecting = false;
                isNamespaceJoined = true;
                broadcastConnectionStatus('connected');
                addLog('Joined Namespace /', 'success');
                const settings = await getSettings();
                if (settings.roomId) {
                    emit(EVENTS.JOIN_ROOM, { 
                        roomId: settings.roomId, 
                        password: settings.password,
                        peerId,
                        username: settings.username,
                        tabTitle: currentTabTitle,
                        protocolVersion: PROTOCOL_VERSION
                    });
                }
                while (eventQueue.length > 0) {
                    const queuedMsg = eventQueue.shift();
                    emit(queuedMsg.event, queuedMsg.data);
                }
                eventQueue = [];
                chrome.storage.session.set({ eventQueue: [] });
            } else if (msg.startsWith('42')) {
                try {
                    const payload = JSON.parse(msg.substring(2));
                    try {
                        handleServerEvent(payload[0], payload[1]);
                    } catch (handlerErr) {
                        addLog(`Handler error for ${payload[0]}: ${handlerErr.message}`, 'error');
                    }
                } catch (_e) {
                    addLog(`Failed to parse message: ${msg}`, 'error');
                }
            }
        };

        socket.onclose = () => {
            isConnecting = false;
            isNamespaceJoined = false;
            
            isForceSyncInitiator = false;
            forceSyncAcks.clear();
            if (forceSyncTimeout) clearTimeout(forceSyncTimeout);
            chrome.storage.session.set({ 
                isForceSyncInitiator: false, 
                forceSyncAcks: [], 
                forceSyncDeadline: null 
            });

            
            if (currentRoom) {
                currentRoom.peers = [];
                if (storageInitialized) chrome.storage.session.set({ currentRoom });
                chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: [] }).catch(() => {});
            }
            broadcastConnectionStatus('disconnected');
            addLog('Disconnected. Scheduling reconnect...', 'warn');
            socket = null;
            scheduleReconnect();
        };

        socket.onerror = () => {
            broadcastConnectionStatus('disconnected');
            addLog('WebSocket Error: Connection failed', 'error');
        };

    } catch (e) {
        isConnecting = false;
        addLog(e.message, 'error');
        broadcastConnectionStatus('disconnected');
        scheduleReconnect();
    }
}


function broadcastConnectionStatus(status) {
    chrome.runtime.sendMessage({ type: 'CONNECTION_STATUS', status }).catch(() => {});
    updateBadgeStatus();
}

function updateBadgeStatus() {
    const isConnected = socket && socket.readyState === WebSocket.OPEN && isNamespaceJoined;
    const isReconnecting = !isConnected && reconnectAttempts > 0 && !reconnectFailed;
    const status = isConnected ? 'connected' : (isConnecting || (socket && socket.readyState === WebSocket.CONNECTING) ? 'connecting' : (isReconnecting ? 'reconnecting' : 'disconnected'));

    if (reconnectFailed) {
        chrome.action.setBadgeText({ text: 'ERR' });
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else if (status === 'reconnecting') {
        chrome.action.setBadgeText({ text: '...' });
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    } else if (status === 'connecting') {
        chrome.action.setBadgeText({ text: '...' });
        chrome.action.setBadgeBackgroundColor({ color: '#fbbf24' });
    } else if (status === 'connected' && currentRoom && currentTabId) {
        chrome.action.setBadgeText({ text: 'ON' });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }
}

function showNotification(senderName, action) {
    chrome.storage.sync.get(['browserNotifications'], (settings) => {
        if (!settings.browserNotifications) return;

        const label = action === 'play' ? 'started playback' : 
                      action === 'pause' ? 'paused playback' : 
                      action === 'seek' ? 'seeked the video' :
                      action === 'force_sync_prepare' ? 'started force sync' :
                      action === 'force_sync_execute' ? 'synchronized everyone' : action;
        
        let displayName = senderName || 'A peer';
        if (currentRoom && Array.isArray(currentRoom.peers)) {
            const peer = currentRoom.peers.find(p => (p.peerId || p) === senderName);
            if (peer && peer.username) displayName = peer.username;
        }

        chrome.notifications.create(`sync_${Date.now()}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'KoalaSync',
            message: `${displayName} ${label}.`,
            priority: 1
        });
    });
}

function scheduleReconnect() {
    if (reconnectTimer) return;

    if (reconnectFailed) {
        return;
    }

    if (!reconnectStartTime) reconnectStartTime = Date.now();

    // Check 5 minute cap (300,000ms)
    if (Date.now() - reconnectStartTime > 300000) {
        reconnectFailed = true;
        chrome.storage.session.set({ reconnectFailed: true });
        addLog('Reconnection failed after 5 minutes.', 'error');
        broadcastConnectionStatus('reconnect_failed');
        return;
    }

    reconnectAttempts++;

    // Cap at max attempts to prevent infinite loops
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        reconnectFailed = true;
        chrome.storage.session.set({ reconnectFailed: true });
        addLog('Reconnection failed after max attempts.', 'error');
        broadcastConnectionStatus('reconnect_failed');
        return;
    }

    // Aggressive reconnect: 500ms base, cap at 5s, no exponential growth beyond that
    const delay = Math.min(_RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts - 1), _RECONNECT_MAX_DELAY);

    addLog(`Reconnect in ${Math.round(delay)}ms (attempt ${reconnectAttempts})`, 'warn');

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
    }, delay);
}

// Slow reconnect logic is now handled in the keepAlive alarm

function emit(event, data) {
    if (socket && socket.readyState === WebSocket.OPEN && isNamespaceJoined) {
        const msg = `42${JSON.stringify([event, data])}`;
        socket.send(msg);
    } else {
        eventQueue.push({ event, data });
        if (eventQueue.length > 50) {
            eventQueue.shift();
            addLog('Event queue cap reached, dropping oldest event', 'warn');
        }
        chrome.storage.session.set({ eventQueue });
    }
}

function addToHistory(action, senderId) {
    const historyEntry = {
        action,
        senderId: senderId || 'You',
        timestamp: new Date().toISOString()
    };
    if (!storageInitialized) {
        pendingHistory.unshift(historyEntry);
    } else {
        history.unshift(historyEntry);
        if (history.length > 20) history.pop();
        chrome.storage.session.set({ history });
    }
    chrome.runtime.sendMessage({ type: 'HISTORY_UPDATE', history }).catch(() => {});
}

// --- Event Handlers ---
function handleServerEvent(event, data) {
    switch (event) {
        case EVENTS.ROOM_DATA:
            currentRoom = data;
            if (currentRoom && Array.isArray(currentRoom.peers)) {
                currentRoom.peers = currentRoom.peers.map(p => typeof p === 'object' ? createPeerData(p) : { peerId: p, username: null, tabTitle: null, mediaTitle: null, playbackState: null, currentTime: null, volume: null, muted: null, lastHeartbeat: Date.now() });
            } else if (currentRoom) {
                currentRoom.peers = [];
            }
            if (storageInitialized) chrome.storage.session.set({ currentRoom });
            addLog(`Joined Room: ${data?.roomId || 'unknown'}`, 'success');
            chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: data.peers }).catch(() => {});
                        
            // Inform Website Bridge & Popup
            const joinStatusMsg = { type: 'JOIN_STATUS', success: true, message: 'Joined' };
            chrome.runtime.sendMessage(joinStatusMsg).catch(() => {});
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, joinStatusMsg).catch(() => {});
                });
            });
            break;
        case EVENTS.ROOM_LIST:
            chrome.runtime.sendMessage({ type: 'ROOM_LIST', rooms: data.rooms }).catch(() => {});
            break;
        case EVENTS.ERROR:
            isConnecting = false;
            broadcastConnectionStatus('disconnected');
            addLog(`Server Error: ${data.message}`, 'error');
            chrome.notifications.create(`error_${Date.now()}`, {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'KoalaSync Error',
                message: data.message
            });
            // Inform Website Bridge & Popup
            const errStatusMsg = { type: 'JOIN_STATUS', success: false, message: data.message };
            chrome.runtime.sendMessage(errStatusMsg).catch(() => {});
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, errStatusMsg).catch(() => {});
                });
            });
            break;
        case EVENTS.PLAY:
        case EVENTS.PAUSE:
        case EVENTS.SEEK:
        case EVENTS.FORCE_SYNC_PREPARE:
            if (data.senderId) {
                addToHistory(event, data.senderId);
                showNotification(data.senderId, event);
                updateLastAction(event, data.senderId);
                lastActionState.targetTime = data.targetTime !== undefined ? data.targetTime : data.currentTime;
                if (storageInitialized) chrome.storage.session.set({ lastActionState });

                // Remote Reactive Update
                updateLocalPeerState(data.senderId, {
                    playbackState: event === EVENTS.PLAY ? 'playing' : (event === EVENTS.PAUSE ? 'paused' : undefined),
                    currentTime: data.currentTime !== undefined ? data.currentTime : (data.targetTime !== undefined ? data.targetTime : undefined)
                });
            }
            routeToContent(event, data);
            break;
        case EVENTS.FORCE_SYNC_ACK:
            if (isForceSyncInitiator) {
                forceSyncAcks.add(data.senderId);
                chrome.storage.session.set({ forceSyncAcks: Array.from(forceSyncAcks) });
                addLog(`Received ACK from ${data.senderId} (${forceSyncAcks.size})`, 'info');
                
                // Update UI state for buffering progress
                if (lastActionState && lastActionState.action === EVENTS.FORCE_SYNC_PREPARE) {
                    if (!Array.isArray(lastActionState.acks)) lastActionState.acks = [];
                    if (!lastActionState.acks.includes(data.senderId)) {
                        lastActionState.acks.push(data.senderId);
                        if (storageInitialized) chrome.storage.session.set({ lastActionState });
                        chrome.runtime.sendMessage({ type: 'ACTION_UPDATE', state: lastActionState }).catch(() => {});
                    }

                    // Force Sync ACK Reactive Update
                    updateLocalPeerState(data.senderId, {
                        playbackState: 'paused', // Preparing for force sync always pauses the player
                        currentTime: lastActionState.targetTime
                    });
                }

                // Check if all peers responded
                const peerCount = currentRoom && Array.isArray(currentRoom.peers) ? currentRoom.peers.length : 1;
                if (forceSyncAcks.size >= peerCount) {
                    executeForceSync();
                }
            }
            break;
        case EVENTS.FORCE_SYNC_EXECUTE:
            if (data?.senderId) {
                addToHistory(event, data.senderId);
                showNotification(data.senderId, event);

                // (The sender's state is updated below with everyone else)
            }

            // Force Sync Execute Remote Reactive Update:
            // Set all peers to playing and apply a reactive lock to block stale heartbeats
            if (currentRoom && Array.isArray(currentRoom.peers)) {
                currentRoom.peers.forEach(peer => {
                    if (peer && typeof peer === 'object') {
                        peer.playbackState = 'playing';
                        peer.lastReactiveUpdate = Date.now();
                    }
                });
                if (storageInitialized) chrome.storage.session.set({ currentRoom });
                chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: currentRoom.peers }).catch(() => {});
            }

            routeToContent(event, data);
            break;
        case EVENTS.EVENT_ACK:
            if (lastActionState && lastActionState.action && data?.senderId) {
                // Correlation Check: Only accept ACK if it matches our current action's timestamp
                if (data.actionTimestamp === lastActionState.timestamp) {
                    if (!Array.isArray(lastActionState.acks)) lastActionState.acks = [];
                    if (!lastActionState.acks.includes(data.senderId)) {
                        lastActionState.acks.push(data.senderId);
                        if (storageInitialized) chrome.storage.session.set({ lastActionState });
                        chrome.runtime.sendMessage({ type: 'ACTION_UPDATE', state: lastActionState }).catch(() => {});

                        // ACK Reactive Update
                        updateLocalPeerState(data.senderId, {
                            playbackState: lastActionState.action === EVENTS.PLAY ? 'playing' : (lastActionState.action === EVENTS.PAUSE ? 'paused' : undefined),
                            currentTime: (lastActionState.action === EVENTS.SEEK || lastActionState.action === EVENTS.FORCE_SYNC_PREPARE) ? lastActionState.targetTime : undefined
                        });
                    }
                }
            }
            break;
        case EVENTS.PEER_STATUS:
            if (currentRoom) {
                if (!Array.isArray(currentRoom.peers)) currentRoom.peers = [];
                if (data.status === 'joined') {
                    if (!currentRoom.peers.find(p => (p.peerId || p) === data.peerId)) {
                        currentRoom.peers.push(createPeerData(data));
                        if (storageInitialized) chrome.storage.session.set({ currentRoom });
                        chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: currentRoom.peers }).catch(() => {});

                        if (episodeLobby && episodeLobby.initiatorPeerId === peerId) {
                            emit(EVENTS.EPISODE_LOBBY, { peerId, expectedTitle: episodeLobby.expectedTitle });
                        }
                    }
                } else if (data.status === 'left') {
                    currentRoom.peers = currentRoom.peers.filter(p => (p.peerId || p) !== data.peerId);
                    if (storageInitialized) chrome.storage.session.set({ currentRoom });
                    chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: currentRoom.peers }).catch(() => {});

                    if (episodeLobby) {
                        checkEpisodeLobbyPeerDeparture();
                    }

                    if (isForceSyncInitiator) {
                        const peerCount = Array.isArray(currentRoom.peers) ? currentRoom.peers.length : 1;
                        if (forceSyncAcks.size >= peerCount) {
                            executeForceSync();
                        }
                    }
                } else {
                    const peer = currentRoom.peers.find(p => (typeof p === 'object' ? p.peerId : p) === data.peerId);
                    if (peer) {
                        if (typeof peer === 'object') {
                            peer.tabTitle = data.tabTitle;
                            peer.username = data.username;
                            peer.mediaTitle = data.mediaTitle !== undefined ? data.mediaTitle : peer.mediaTitle;
                            peer.volume = data.volume !== undefined ? data.volume : peer.volume;
                            peer.muted = data.muted !== undefined ? data.muted : peer.muted;

                            const timeSinceReactive = peer.lastReactiveUpdate ? (Date.now() - peer.lastReactiveUpdate) : Infinity;
                            const ignoreStatus = timeSinceReactive < 1000;

                            if (!ignoreStatus) {
                                peer.playbackState = data.playbackState !== undefined ? data.playbackState : peer.playbackState;
                                peer.currentTime = data.currentTime !== undefined ? data.currentTime : peer.currentTime;
                                peer.lastHeartbeat = Date.now();
                            }
                        } else {
                            // Migration: replace string peer with normalized object
                            const idx = currentRoom.peers.indexOf(peer);
                            currentRoom.peers[idx] = createPeerData(data);
                        }
                        if (storageInitialized) chrome.storage.session.set({ currentRoom });
                        chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: currentRoom.peers }).catch(() => {});
                    }
                }
            }
            break;
        case EVENTS.EPISODE_LOBBY:
            if (data.senderId && data.expectedTitle) {
                addLog(`Episode lobby from ${data.senderId}: "${data.expectedTitle}"`, 'info');
                // If we already have a lobby for this same title, treat as dedup
                if (episodeLobby && episodeLobby.expectedTitle === data.expectedTitle) {
                    break; // Already tracking this lobby
                }
                // Cancel any existing lobby before starting a new one
                if (episodeLobby) clearEpisodeLobbyState();
                
                episodeLobby = {
                    expectedTitle: data.expectedTitle,
                    initiatorPeerId: data.senderId,
                    readyPeers: [],
                    createdAt: Date.now()
                };
                persistEpisodeLobby();
                broadcastLobbyUpdate();

                // Start timeout
                episodeLobbyTimeout = setTimeout(() => cancelEpisodeLobby('Timeout'), EPISODE_LOBBY_TIMEOUT);

                // Forward to content script to start polling
                if (currentTabId) {
                    const tabId = parseInt(currentTabId);
                    if (!isNaN(tabId)) {
                        chrome.tabs.sendMessage(tabId, {
                            type: 'EPISODE_LOBBY',
                            expectedTitle: data.expectedTitle
                        }).catch(() => {});
                    }
                }
            }
            break;
        case EVENTS.EPISODE_READY:
            if (episodeLobby && data.senderId) {
                if (!episodeLobby.readyPeers.includes(data.senderId)) {
                    episodeLobby.readyPeers.push(data.senderId);
                    persistEpisodeLobby();
                    broadcastLobbyUpdate();
                    addLog(`Episode ready from ${data.senderId} (${episodeLobby.readyPeers.length})`, 'info');
                    checkEpisodeLobbyCompletion();
                }
            }
            break;
        default:
            addLog(`Received unknown event from server: ${event}`, 'warn');
            break;
    }
}

function executeForceSync() {
    if (forceSyncTimeout) clearTimeout(forceSyncTimeout);
    isForceSyncInitiator = false;
    forceSyncAcks.clear();
    chrome.storage.session.set({ 
        isForceSyncInitiator: false, 
        forceSyncAcks: [], 
        forceSyncDeadline: null 
    });

    // Set all peers to playing and apply a reactive lock to block stale heartbeats
    if (currentRoom && Array.isArray(currentRoom.peers)) {
        currentRoom.peers.forEach(peer => {
            if (peer && typeof peer === 'object') {
                peer.playbackState = 'playing';
                peer.lastReactiveUpdate = Date.now();
            }
        });
        if (storageInitialized) chrome.storage.session.set({ currentRoom });
        chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: currentRoom.peers }).catch(() => {});
    }

    const executionTimestamp = Date.now();
    updateLastAction(EVENTS.FORCE_SYNC_EXECUTE, 'You', executionTimestamp);

    emit(EVENTS.FORCE_SYNC_EXECUTE, { actionTimestamp: executionTimestamp });
    routeToContent(EVENTS.FORCE_SYNC_EXECUTE, { actionTimestamp: executionTimestamp });
    addLog('Force Sync Executed', 'success');
}

// --- Episode Auto-Sync Lobby Functions ---
function persistEpisodeLobby() {
    if (storageInitialized) chrome.storage.session.set({ episodeLobby });
}

function broadcastLobbyUpdate() {
    chrome.runtime.sendMessage({ type: 'LOBBY_UPDATE', lobby: episodeLobby }).catch(() => {});
}

function clearEpisodeLobbyState() {
    if (episodeLobbyTimeout) clearTimeout(episodeLobbyTimeout);
    episodeLobbyTimeout = null;
    episodeLobby = null;
    if (storageInitialized) chrome.storage.session.set({ episodeLobby: null });
    broadcastLobbyUpdate();

    // Notify content script to stop polling
    if (currentTabId) {
        const tabId = parseInt(currentTabId);
        if (!isNaN(tabId)) {
            chrome.tabs.sendMessage(tabId, { type: 'EPISODE_LOBBY_CANCEL' }).catch(() => {});
        }
    }
}

function cancelEpisodeLobby(reason) {
    if (!episodeLobby) return;
    const title = episodeLobby.expectedTitle;
    clearEpisodeLobbyState();
    addLog(`Episode lobby cancelled: ${reason} for "${title}"`, 'warn');

    // Chrome notification on failure (per Q2: only notify on failure)
    chrome.notifications.create(`episode_${Date.now()}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'KoalaSync — Episode Sync Failed',
        message: `Auto-sync cancelled: ${reason}. You may need to manually sync.`,
        priority: 1
    });
}

function executeEpisodeLobby() {
    if (!episodeLobby) return;
    const title = episodeLobby.expectedTitle;
    clearEpisodeLobbyState();
    addLog(`Episode lobby complete: Starting "${title}" via Force Sync`, 'success');

    isForceSyncInitiator = true;
    forceSyncAcks.clear();
    const deadline = Date.now() + FORCE_SYNC_TIMEOUT;
    const timestamp = Date.now();
    updateLastAction(EVENTS.FORCE_SYNC_PREPARE, 'You', timestamp);
    lastActionState.targetTime = 0.0;
    if (storageInitialized) chrome.storage.session.set({ lastActionState });
    chrome.storage.session.set({ 
        isForceSyncInitiator: true, 
        forceSyncAcks: [], 
        forceSyncDeadline: deadline 
    });

    const syncPayload = { targetTime: 0.0 };
    emit(EVENTS.FORCE_SYNC_PREPARE, { ...syncPayload, peerId, actionTimestamp: timestamp });
    routeToContent(EVENTS.FORCE_SYNC_PREPARE, { ...syncPayload, actionTimestamp: timestamp });

    forceSyncTimeout = setTimeout(() => {
        if (isForceSyncInitiator) {
            addLog('Force Sync (Episode): Timeout waiting for ACKs, executing anyway...', 'warn');
            executeForceSync();
        }
    }, FORCE_SYNC_TIMEOUT);
}

function checkEpisodeLobbyCompletion() {
    if (!episodeLobby || !currentRoom) return;
    const peerCount = currentRoom.peers ? currentRoom.peers.length : 1;
    if (episodeLobby.readyPeers.length >= peerCount) {
        executeEpisodeLobby();
    }
}

function checkEpisodeLobbyPeerDeparture() {
    if (!episodeLobby || !currentRoom) return;
    if (!Array.isArray(currentRoom.peers)) return;
    const remainingPeerIds = currentRoom.peers.map(p => typeof p === 'object' ? p.peerId : p);
    
    // If only we remain, cancel the lobby
    if (remainingPeerIds.length <= 1) {
        cancelEpisodeLobby('All other peers left');
        return;
    }

    // Filter readyPeers to only include peers still in the room
    episodeLobby.readyPeers = episodeLobby.readyPeers.filter(id => remainingPeerIds.includes(id));
    persistEpisodeLobby();
    broadcastLobbyUpdate();

    // Re-check if all remaining peers are now ready
    checkEpisodeLobbyCompletion();
}

function updateLastAction(action, senderId, timestamp = Date.now()) {
    lastActionState = {
        action,
        senderId,
        timestamp,
        acks: []
    };
    if (storageInitialized) chrome.storage.session.set({ lastActionState });
    chrome.runtime.sendMessage({ type: 'ACTION_UPDATE', state: lastActionState }).catch(() => {});
}

async function routeToContent(action, payload) {
    if (!currentTabId) return;

    const tabId = parseInt(currentTabId);
    if (isNaN(tabId)) return;

    const actionTimestamp = payload?.actionTimestamp || Date.now();
    const commandSenderId = payload?.senderId || null;

    chrome.tabs.sendMessage(tabId, { 
        type: 'SERVER_COMMAND',
        action,
        payload,
        actionTimestamp,
        commandSenderId
    }).catch(err => {
        if (err.message.includes('Receiving end does not exist') || err.message.includes('Extension context invalidated')) {
            chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            }).then(() => {
                setTimeout(() => routeToContent(action, payload), 500);
            }).catch(_err => {
                addLog(`Auto-reinject failed for tab ${tabId}`, 'warn');
            });
        } else {
            addLog(`Content Script not responding in tab ${tabId}`, 'warn');
            currentTabId = null;
            updateBadgeStatus();
        }
    });
}

// --- Keep-Alive Mechanism ---
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
    await ensureState();
    if (alarm.name === 'keepAlive') {
        chrome.storage.session.get('keepAlive', () => {});
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            if (!reconnectFailed) {
                connect();
            }
        } else if (currentRoom) {
            // Heartbeat Logic: Always include identity metadata
            const settings = await getSettings();
            emit(EVENTS.PEER_STATUS, { 
                peerId, 
                status: 'heartbeat',
                username: settings.username,
                tabTitle: currentTabTitle
            });
        }
    }
});

function leaveOldRoomIfSwitching(newRoomId) {
    if (currentRoom && currentRoom.roomId !== newRoomId) {
        addLog(`Switching rooms: leaving ${currentRoom.roomId} to join ${newRoomId}`, 'info');
        if (socket && socket.readyState === WebSocket.OPEN && isNamespaceJoined) {
            emit(EVENTS.LEAVE_ROOM, { peerId });
        }
        currentRoom = null;
        if (storageInitialized) chrome.storage.session.set({ currentRoom: null });
        chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: [] }).catch(() => {});

        // Reset force sync states
        isForceSyncInitiator = false;
        forceSyncAcks.clear();
        if (forceSyncTimeout) clearTimeout(forceSyncTimeout);
        chrome.storage.session.set({ 
            isForceSyncInitiator: false, 
            forceSyncAcks: [], 
            forceSyncDeadline: null 
        });

        // Cancel any active episode lobby
        clearEpisodeLobbyState();
    }
}

// --- Extension Message Listeners ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleAsyncMessage(message, sender, sendResponse);
    return true; // Keep channel open for async responses
});

async function handleAsyncMessage(message, sender, sendResponse) {
    await ensureState();

    if (message.type === 'CONNECT') {
        reconnectFailed = false;
        reconnectStartTime = null;
        reconnectAttempts = 0;
        chrome.storage.session.set({ reconnectFailed: false });
        const settings = await getSettings();
        if (settings.roomId) {
            leaveOldRoomIfSwitching(settings.roomId);
        }
        if (socket && socket.readyState === WebSocket.OPEN && isNamespaceJoined) {
            if (settings.roomId) {
                emit(EVENTS.JOIN_ROOM, { 
                    roomId: settings.roomId, 
                    password: settings.password,
                    peerId,
                    username: settings.username,
                    tabTitle: currentTabTitle,
                    protocolVersion: PROTOCOL_VERSION
                });
            }
        } else {
            connect();
        }
        sendResponse({ status: 'ok' });
    } else if (message.type === 'RETRY_CONNECT') {
        reconnectFailed = false;
        reconnectStartTime = null;
        reconnectAttempts = 0;
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        chrome.storage.session.set({ reconnectFailed: false });
        connect();
        sendResponse({ status: 'ok' });
    } else if (message.type === 'GET_STATUS') {
        const isConnected = socket && socket.readyState === WebSocket.OPEN && isNamespaceJoined;
        const isReconnecting = !isConnected && reconnectAttempts > 0 && !reconnectFailed;
        let status = isConnected ? 'connected' : (isConnecting || (socket && socket.readyState === WebSocket.CONNECTING) ? 'connecting' : (isReconnecting ? 'reconnecting' : 'disconnected'));
        if (reconnectFailed) status = 'reconnect_failed';
        sendResponse({ 
            status, 
            peerId, 
            peers: currentRoom ? currentRoom.peers : [],
            lastActionState,
            targetTabId: currentTabId,
            episodeLobby: episodeLobby,
            reconnectAttempts
        });
    } else if (message.type === 'LEAVE_ROOM') {
        emit(EVENTS.LEAVE_ROOM, { peerId });
        currentRoom = null;
        currentTabId = null;

        updateBadgeStatus();
        
        isForceSyncInitiator = false;
        forceSyncAcks.clear();
        if (forceSyncTimeout) clearTimeout(forceSyncTimeout);

        // Cancel any active episode lobby
        clearEpisodeLobbyState();

        chrome.storage.session.set({ 
            currentRoom: null,
            isForceSyncInitiator: false,
            forceSyncAcks: [],
            forceSyncDeadline: null,
            episodeLobby: null
        });
        addLog('Left Room', 'info');
        chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: [] }).catch(() => {});
        sendResponse({ status: 'ok' });
    } else if (message.type === 'CLEAR_LOGS') {
        logs = [];
        sendResponse({ status: 'ok' });
    } else if (message.type === 'GET_LOGS') {
        sendResponse(logs);
    } else if (message.type === 'GET_HISTORY') {
        sendResponse(history);
    } else if (message.type === 'GET_ROOM_LIST') {
        emit(EVENTS.GET_ROOMS, {});
        sendResponse({ status: 'ok' });
    } else if (message.type === 'WEB_JOIN_REQUEST') {
        const { roomId, password, useCustomServer, serverUrl } = message;
        chrome.storage.sync.set({ 
            roomId, 
            password,
            useCustomServer: !!useCustomServer,
            serverUrl: serverUrl || ''
        }, async () => {
            broadcastConnectionStatus('connecting');
            leaveOldRoomIfSwitching(roomId);
            if (socket && socket.readyState === WebSocket.OPEN && isNamespaceJoined) {
                // FORCE TRANSITION: Emit Join Room directly if already connected
                const settings = await getSettings();
                emit(EVENTS.JOIN_ROOM, { 
                    roomId, 
                    password,
                    peerId,
                    username: settings.username,
                    tabTitle: currentTabTitle,
                    protocolVersion: PROTOCOL_VERSION
                });
                addLog(`Joining room via link: ${roomId}`, 'info');
            } else {
                connect();
            }
            sendResponse({ status: 'ok' });
        });
    } else if (message.type === 'REGENERATE_ID') {
        const newId = self.crypto.randomUUID().substring(0, 8);
        chrome.storage.local.set({ peerId: newId }, () => {
            peerId = newId;
            addLog(`Identity regenerated: ${newId}`, 'success');
            if (socket) socket.close(); // Force reconnect with new ID
            sendResponse({ peerId: newId });
        });
    } else if (message.type === 'GET_VIDEO_STATE') {
        const { tabId } = message;
        if (!tabId) {
            sendResponse({ error: 'No tabId provided' });
            return;
        }
        chrome.tabs.sendMessage(tabId, { type: 'GET_VIDEO_STATE' }, (res) => {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                sendResponse(res);
            }
        });
    } else if (message.type === 'CONTENT_EVENT') {
        const processEvent = () => {
            const timestamp = Date.now();
            updateLastAction(message.action, 'You', timestamp);
            lastActionState.targetTime = message.payload?.targetTime !== undefined ? message.payload.targetTime : message.payload?.currentTime;
            if (storageInitialized) chrome.storage.session.set({ lastActionState });
            message.payload.actionTimestamp = timestamp;
            
            // Local Reactive Update
            updateLocalPeerState(peerId, {
                playbackState: message.action === EVENTS.PLAY ? 'playing' : (message.action === EVENTS.PAUSE ? 'paused' : undefined),
                currentTime: message.payload.currentTime !== undefined ? message.payload.currentTime : (message.payload.targetTime !== undefined ? message.payload.targetTime : undefined)
            });

            if (message.action === EVENTS.FORCE_SYNC_PREPARE) {
                isForceSyncInitiator = true;
                forceSyncAcks.clear();
                const deadline = Date.now() + FORCE_SYNC_TIMEOUT;
                chrome.storage.session.set({ 
                    isForceSyncInitiator: true, 
                    forceSyncAcks: [], 
                    forceSyncDeadline: deadline 
                });
                addLog('Initiating Force Sync...', 'info');
                
                routeToContent(EVENTS.FORCE_SYNC_PREPARE, message.payload);
     
                forceSyncTimeout = setTimeout(() => {
                    if (isForceSyncInitiator) {
                        addLog('Force Sync: Timeout waiting for ACKs, executing anyway...', 'warn');
                        executeForceSync();
                    }
                }, FORCE_SYNC_TIMEOUT);
            }
            addToHistory(message.action, 'You');
            emit(message.action, { ...message.payload, peerId });
            sendResponse({ status: 'ok' });
        };

        if (sender.tab) {
            const senderTabId = sender.tab.id;
            
            if (!currentTabId || currentTabId !== senderTabId) {
                sendResponse({ status: 'ignored_unselected_tab' });
                return;
            }
            
            currentTabTitle = sender.tab.title ? sender.tab.title.substring(0, 50) : null;
            chrome.storage.session.set({ currentTabTitle });
            updateBadgeStatus();
            processEvent();
        } else {
            routeToContent(message.action, message.payload);
            processEvent();
        }
    } else if (message.type === 'FORCE_SYNC_ACK') {
        if (isForceSyncInitiator) {
            forceSyncAcks.add(peerId);
            chrome.storage.session.set({ forceSyncAcks: Array.from(forceSyncAcks) });
            addLog(`Local ACK received (${forceSyncAcks.size})`, 'info');

            // Local Force Sync ACK Reactive Update
            if (lastActionState && lastActionState.action === EVENTS.FORCE_SYNC_PREPARE) {
                updateLocalPeerState(peerId, {
                    playbackState: 'paused',
                    currentTime: lastActionState.targetTime
                });
            }

            const peerCount = currentRoom && Array.isArray(currentRoom.peers) ? currentRoom.peers.length : 1;
            if (forceSyncAcks.size >= peerCount) {
                executeForceSync();
            }
        } else {
            emit(EVENTS.FORCE_SYNC_ACK, { peerId });
        }
        sendResponse({ status: 'ok' });
    } else if (message.type === 'CMD_ACK') {
        const commandSenderId = message.commandSenderId;
        if (commandSenderId && commandSenderId !== peerId) {
            emit(EVENTS.EVENT_ACK, { 
                senderId: peerId, 
                targetId: commandSenderId,
                actionTimestamp: message.actionTimestamp 
            });
        }
        sendResponse({ status: 'ok' });
    } else if (message.type === 'HEARTBEAT') {
        if (sender.tab) {
            const senderTabId = sender.tab.id;
            
            if (!currentTabId || currentTabId !== senderTabId) {
                sendResponse({ status: 'ignored_unselected_tab' });
                return;
            }
            
            currentTabTitle = sender.tab.title ? sender.tab.title.substring(0, 50) : null;
            chrome.storage.session.set({ currentTabTitle });
            updateBadgeStatus();
        }

        getSettings().then(settings => {
            const statusPayload = { ...message.payload, peerId, username: settings.username, tabTitle: currentTabTitle };
            emit(EVENTS.PEER_STATUS, statusPayload);

            if (currentRoom && Array.isArray(currentRoom.peers)) {
                const me = currentRoom.peers.find(p => (p.peerId || p) === peerId);
                if (me && typeof me === 'object') {
                    me.tabTitle = currentTabTitle;
                    me.username = settings.username;
                    me.mediaTitle = message.payload?.mediaTitle;
                    me.playbackState = message.payload?.playbackState;
                    me.currentTime = message.payload?.currentTime;
                    me.volume = message.payload?.volume;
                    me.muted = message.payload?.muted;
                    me.lastHeartbeat = Date.now();
                    if (storageInitialized) chrome.storage.session.set({ currentRoom });
                    chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: currentRoom.peers }).catch(() => {});
                }
            }
            sendResponse({ status: 'ok' });
        }).catch(err => {
            addLog('Heartbeat settings error: ' + err.message, 'error');
            sendResponse({ status: 'ok' });
        });
    } else if (message.type === 'SET_TARGET_TAB') {
        currentTabId = message.tabId;
        currentTabTitle = message.tabTitle;
        chrome.storage.session.set({ currentTabId, currentTabTitle });
        updateBadgeStatus();
        
        if (currentTabId) {
            chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                files: ['content.js']
            }).catch(err => {
                addLog(`Failed to inject into tab: ${err.message}`, 'warn');
            });
        }
        
        sendResponse({ status: 'ok' });
    } else if (message.type === 'LOG') {
        addLog(`[Content] ${message.message}`, message.level || 'info');
        sendResponse({ status: 'ok' });
    } else if (message.type === 'EPISODE_CHANGED') {
        // Content script detected an episode transition
        if (sender.tab) {
            const senderTabId = sender.tab.id;
            if (!currentTabId || currentTabId !== senderTabId) {
                sendResponse({ status: 'ignored_unselected_tab' });
                return;
            }
        }

        const newTitle = message.payload && message.payload.newTitle;
        if (!newTitle) {
            sendResponse({ status: 'no_title' });
            return;
        }

        // Check setting
        const epSettings = await chrome.storage.sync.get(['autoSyncNextEpisode']);
        if (epSettings.autoSyncNextEpisode === false) {
            addLog(`Episode change detected ("${newTitle}") but Auto-Sync is disabled.`, 'info');
            sendResponse({ status: 'disabled' });
            return;
        }

        // If lobby already exists for this title, just mark self ready
        if (episodeLobby && episodeLobby.expectedTitle === newTitle) {
            if (!episodeLobby.readyPeers.includes(peerId)) {
                episodeLobby.readyPeers.push(peerId);
                persistEpisodeLobby();
                broadcastLobbyUpdate();
                emit(EVENTS.EPISODE_READY, { peerId, title: newTitle });
                checkEpisodeLobbyCompletion();
            }
            sendResponse({ status: 'ready_sent' });
            return;
        }

        // Cancel any existing lobby for a different episode
        if (episodeLobby) clearEpisodeLobbyState();

        // Create new lobby
        episodeLobby = {
            expectedTitle: newTitle,
            initiatorPeerId: peerId,
            readyPeers: [peerId], // We are already ready
            createdAt: Date.now()
        };
        persistEpisodeLobby();
        broadcastLobbyUpdate();
        addLog(`Episode lobby created: "${newTitle}"`, 'info');

        // Tell content script to pause the video and start polling
        // (This is the only place we pause — after confirming the feature is enabled)
        if (sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
                type: 'PAUSE_FOR_LOBBY',
                expectedTitle: newTitle
            }).catch(() => {});
        }

        // Broadcast to room
        emit(EVENTS.EPISODE_LOBBY, { peerId, expectedTitle: newTitle });

        // Start timeout (Q1: Option B — cancel on timeout)
        episodeLobbyTimeout = setTimeout(() => cancelEpisodeLobby('Timeout — not all peers loaded the episode'), EPISODE_LOBBY_TIMEOUT);

        // Immediate check — maybe we're the only one in the room
        checkEpisodeLobbyCompletion();

        sendResponse({ status: 'lobby_created' });
    } else if (message.type === 'EPISODE_READY_LOCAL') {
        // Content script confirmed it loaded the lobby episode
        if (episodeLobby && message.payload && message.payload.title === episodeLobby.expectedTitle) {
            if (!episodeLobby.readyPeers.includes(peerId)) {
                episodeLobby.readyPeers.push(peerId);
                persistEpisodeLobby();
                broadcastLobbyUpdate();
                emit(EVENTS.EPISODE_READY, { peerId, title: message.payload.title });
                addLog(`Local episode ready: "${message.payload.title}"`, 'success');
                checkEpisodeLobbyCompletion();
            }
        }
        sendResponse({ status: 'ok' });
    } else if (message.type === 'CONTENT_BOOT') {
        // Content script re-injected, check if there's an active lobby
        if (episodeLobby) {
            sendResponse({ lobbyActive: true, expectedTitle: episodeLobby.expectedTitle });
        } else {
            sendResponse({ lobbyActive: false });
        }
    } else {
        // Final fallback to prevent channel hanging
        sendResponse({ error: 'unhandled_message' });
    }
}

// Tab removal listener
chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === currentTabId) {
        currentTabId = null;
        currentTabTitle = null;
        chrome.storage.session.set({ currentTabId: null, currentTabTitle: null });
        updateBadgeStatus();
        addLog('Target tab closed.', 'warn');
    }
});

// Re-inject on full page refresh
chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
    if (currentTabId && tabId === parseInt(currentTabId) && changeInfo.status === 'complete') {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        }).catch(() => {});
    }
});

// Initial Connect
connect();
