import { EVENTS, OFFICIAL_LANDING_PAGE_URL } from './shared/constants.js';
import { BLACKLIST_DOMAINS } from './shared/blacklist.js';
import { getAvatarForName, generateUsername } from './shared/names.js';


const elements = {
    tabs: document.querySelectorAll('.tabs .tab-btn'),
    contents: document.querySelectorAll('.tab-content'),
    copyInvite: document.getElementById('copyInvite'),
    targetTab: document.getElementById('targetTab'),
    forceSyncBtn: document.getElementById('forceSyncBtn'),
    forceSyncMode: document.getElementById('forceSyncMode'),
    peerList: document.getElementById('peerList'),
    logList: document.getElementById('logList'),
    clearLogs: document.getElementById('clearLogs'),
    connDot: document.getElementById('connDot'),
    connText: document.getElementById('connText'),
    serverUrl: document.getElementById('serverUrl'),
    serverOfficial: document.getElementById('serverOfficial'),
    serverCustom: document.getElementById('serverCustom'),
    roomId: document.getElementById('roomId'),
    password: document.getElementById('password'),
    username: document.getElementById('username'),
    joinBtn: document.getElementById('joinBtn'),
    leaveBtn: document.getElementById('leaveBtn'),
    roomInfo: document.getElementById('roomInfo'),
    inviteLink: document.getElementById('inviteLink'),
    filterNoise: document.getElementById('filterNoise'),
    regenId: document.getElementById('regenId'),
    lastActionCard: document.getElementById('lastActionCard'),
    historyList: document.getElementById('historyList'),
    copyLogs: document.getElementById('copyLogs'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    publicRooms: document.getElementById('publicRooms'),
    refreshRooms: document.getElementById('refreshRooms'),
    roomError: document.getElementById('roomError'),
    retryBtn: document.getElementById('retryBtn'),
    sectionJoin: document.getElementById('section-join'),
    sectionActive: document.getElementById('section-active'),
    activeRoomId: document.getElementById('activeRoomId'),
    activeServer: document.getElementById('activeServer'),
    peerListSync: document.getElementById('peerListSync'),
    videoDebug: document.getElementById('videoDebug'),
    playBtn: document.getElementById('playBtn'),
    pauseBtn: document.getElementById('pauseBtn'),
    autoSyncNextEpisode: document.getElementById('autoSyncNextEpisode'),
    episodeLobbyCard: document.getElementById('episodeLobbyCard'),
    lobbyTitle: document.getElementById('lobbyTitle'),
    lobbyPeerStatus: document.getElementById('lobbyPeerStatus'),
    browserNotifications: document.getElementById('browserNotifications'),
    autoCopyInvite: document.getElementById('autoCopyInvite'),
    syncTabCopyInvite: document.getElementById('syncTabCopyInvite')
};

let localPeerId = null;
let lastPeersJson = null;
let lastKnownPeers = [];
let isDevTabVisible = false;
let joinBtnTimeout = null;
let forceSyncResetTimer = null;
let popupIntervals = [];
let populateTabsToken = null;
let errorToken = 0;
let forceSyncDone = false;

// --- Helpers ---

// --- Initialization ---
async function init() {
    // Load Settings
    const data = await chrome.storage.sync.get(['serverUrl', 'useCustomServer', 'roomId', 'password', 'filterNoise', 'username', 'autoSyncNextEpisode', 'forceSyncMode', 'browserNotifications', 'autoCopyInvite']);
    let username = data.username;
    if (!username) {
        username = generateUsername();
        chrome.storage.sync.set({ username });
    }
    
    elements.serverUrl.value = data.serverUrl || '';
    elements.roomId.value = data.roomId || '';
    elements.password.value = data.password || '';
    elements.username.value = username;
    if (elements.filterNoise) elements.filterNoise.checked = data.filterNoise !== false;
    if (elements.autoSyncNextEpisode) elements.autoSyncNextEpisode.checked = data.autoSyncNextEpisode !== false;
    if (elements.forceSyncMode) elements.forceSyncMode.value = data.forceSyncMode || 'jump-to-others';
    if (elements.browserNotifications) elements.browserNotifications.checked = data.browserNotifications === true;
    if (elements.autoCopyInvite) elements.autoCopyInvite.checked = data.autoCopyInvite !== false;
    
    // Set Version Info
    const versionTxt = `v${chrome.runtime.getManifest().version}`;
    const versionEl = document.getElementById('appVersion');
    if (versionEl) versionEl.textContent = versionTxt;
    const popupVerEl = document.getElementById('popupVersion');
    if (popupVerEl) popupVerEl.textContent = versionTxt;

    if (data.useCustomServer) {
        setServerMode(true);
    } else {
        setServerMode(false);
    }

    toggleUIState(!!data.roomId);
    updateUI(data.roomId, data.password, data.useCustomServer, data.serverUrl);
    refreshLogs();
    refreshHistory();

    // Initial Status Check
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, async (res) => {
        if (chrome.runtime.lastError) {
            console.warn('[Popup] Background not responding:', chrome.runtime.lastError.message);
            await populateTabs();
            return;
        }
        if (res) {
            localPeerId = res.peerId;
            applyConnectionStatus(res.status);
            updatePeerList(res.peers);
            lastKnownPeers = res.peers || [];
            if (res.lastActionState) updateLastActionUI(res.lastActionState, res.peers);
            
            // Populate Tabs using the background's targetTabId
            await populateTabs(res.peers, res.targetTabId);

            // Render lobby status if active
            if (res.episodeLobby) updateLobbyUI(res.episodeLobby, res.peers);
        } else {
            await populateTabs();
        }
    });

    // Check for invite link on landing page
    checkInviteLink();

    // Initial room list fetch
    chrome.runtime.sendMessage({ type: 'GET_ROOM_LIST' });

    // Debug Info Refresh
    popupIntervals.push(setInterval(refreshDebugInfo, 2000));

    // Show onboarding on first visit
    chrome.storage.sync.get(['onboardingComplete'], (data) => {
        if (!data.onboardingComplete) showOnboarding();
    });
}

// --- UI Logic ---
function toggleUIState(inRoom) {
    if (elements.sectionJoin) elements.sectionJoin.style.display = inRoom ? 'none' : 'block';
    if (elements.sectionActive) elements.sectionActive.style.display = inRoom ? 'block' : 'none';
    if (elements.peerListSync) elements.peerListSync.style.display = inRoom ? 'block' : 'none';
    
    const syncActive = document.getElementById('sync-active');
    const syncInactive = document.getElementById('sync-inactive');
    if (syncActive) syncActive.style.display = inRoom ? 'block' : 'none';
    if (syncInactive) syncInactive.style.display = inRoom ? 'none' : 'block';
}

function updateUI(roomId, password, useCustomServer = false, serverUrl = '') {
    const inRoom = !!roomId;
    toggleUIState(inRoom);
    if (inRoom) {
        let invite = `${OFFICIAL_LANDING_PAGE_URL}/join.html#join:${roomId}:${password}`;
        if (useCustomServer) {
            const encodedUrl = encodeURIComponent(serverUrl || '');
            invite += `:1:${encodedUrl}`;
        }
        elements.inviteLink.value = invite;
        
        if (window.justCreatedRoom) {
            window.justCreatedRoom = false;
            if (elements.autoCopyInvite && elements.autoCopyInvite.checked && elements.copyInvite) {
                elements.copyInvite.click();
            }
        }

        if (elements.activeRoomId) elements.activeRoomId.textContent = roomId;
        if (elements.activeServer) {
            elements.activeServer.textContent = useCustomServer ? (serverUrl || 'Custom Server') : 'Official Server';
            elements.activeServer.title = useCustomServer ? (serverUrl || '') : 'syncserver.koalastuff.net';
        }
    } else {
        updatePeerList([]);
        if (elements.inviteLink) elements.inviteLink.value = '';
        if (elements.activeRoomId) elements.activeRoomId.textContent = '';
        if (elements.activeServer) {
            elements.activeServer.textContent = '';
            elements.activeServer.title = '';
        }
        lastKnownPeers = [];
    }
}

function updateLastActionUI(state, peers) {
    if (!state || !state.action) {
        elements.lastActionCard.replaceChildren();
        const el = document.createElement('div');
        el.style.cssText = 'text-align:center; color: var(--text-muted); font-size: 10px;';
        el.textContent = 'No recent commands';
        elements.lastActionCard.appendChild(el);
        return;
    }

    const safePeers = peers || [];
    const safeAcks = state.acks || [];

    const actionNames = {
        'play': 'PLAY',
        'pause': 'PAUSE',
        'seek': 'SEEK',
        'force_sync_prepare': 'SYNCING...',
        'force_sync_execute': 'FORCE PLAY'
    };

    let senderName = state.senderId === 'You' ? 'You' : state.senderId;
    const senderPeer = safePeers.find(p => (p.peerId || p) === state.senderId);
    if (senderPeer && senderPeer.username) senderName = senderPeer.username;

    const ts = state.timestamp ? new Date(state.timestamp) : new Date();
    const timeStr = isNaN(ts.getTime()) ? '--:--' : ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    elements.lastActionCard.innerHTML = '';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; margin-bottom:6px; align-items:baseline;';
    
    const actionSpan = document.createElement('span');
    actionSpan.style.cssText = 'font-weight:700; color:var(--accent); font-size:11px;';
    actionSpan.textContent = actionNames[state.action] || state.action.toUpperCase();
    
    const infoSpan = document.createElement('span');
    infoSpan.style.cssText = 'font-size:9px; color:var(--text-muted);';
    infoSpan.textContent = `${senderName} @ ${timeStr}`;
    
    header.appendChild(actionSpan);
    header.appendChild(infoSpan);
    elements.lastActionCard.appendChild(header);

    if (state.targetTime !== undefined && state.action === 'seek') {
        const timeInfo = document.createElement('div');
        timeInfo.style.cssText = 'font-size:9px; color:var(--text-muted); margin-top:4px;';
        timeInfo.textContent = `Target: ${formatTime(state.targetTime)}`;
        elements.lastActionCard.appendChild(timeInfo);
    }

    if (state.targetTime !== undefined && state.action.includes('force_sync')) {
        const timeInfo = document.createElement('div');
        timeInfo.style.cssText = 'font-size:9px; color:var(--text-muted); margin-top:4px;';
        timeInfo.textContent = `Sync to: ${formatTime(state.targetTime)}`;
        elements.lastActionCard.appendChild(timeInfo);
    }

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr)); gap: 5px;';

    safePeers.forEach(peer => {
        const pId = typeof peer === 'object' ? peer.peerId : peer;
        if (pId === localPeerId) return;
        const pName = (typeof peer === 'object' && peer.username) ? peer.username : pId.substring(0, 4);
        const isAcked = safeAcks.includes(pId) || pId === state.senderId;
        const color = isAcked ? 'var(--success)' : '#475569';
        const icon = isAcked ? '✓' : '...';
        const avatar = getAvatarForName(pName);
        
        const peerItem = document.createElement('div');
        peerItem.title = pName;
        peerItem.style.cssText = `display:flex; flex-direction:column; align-items:center; opacity: ${isAcked ? 1 : 0.6};`;
        
        const dot = document.createElement('div');
        dot.style.cssText = `width:18px; height:18px; border-radius:50%; background:${color}; color:white; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold; margin-bottom:1px;`;
        dot.textContent = icon;
        
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'font-size:7px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:36px;';
        nameSpan.textContent = `${avatar} ${pName}`;
        
        peerItem.appendChild(dot);
        peerItem.appendChild(nameSpan);
        grid.appendChild(peerItem);
    });

    elements.lastActionCard.appendChild(grid);
}

function formatTime(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function getVolumeIcon(volume, muted) {
    if (muted || volume === 0) return '🔇';
    if (volume < 0.33) return '🔈';
    if (volume < 0.66) return '🔉';
    return '🔊';
}

let activePeers = [];
let interpolationInterval = null;

function stopInterpolation() {
    if (interpolationInterval) {
        clearInterval(interpolationInterval);
        interpolationInterval = null;
    }
}

function startInterpolation() {
    if (interpolationInterval) return;
    interpolationInterval = setInterval(() => {
        const timeElements = document.querySelectorAll('.peer-time-display');
        timeElements.forEach(el => {
            const peerId = el.dataset.peerId;
            const peer = activePeers.find(p => p.peerId === peerId);
            if (peer && peer.playbackState === 'playing' && peer.currentTime != null && peer.lastHeartbeat) {
                const elapsed = (Date.now() - peer.lastHeartbeat) / 1000;
                if (elapsed < 45) {
                    el.textContent = formatTime(peer.currentTime + elapsed);
                }
            }
        });
    }, 1000);
}

function renderEmpty(container, type) {
    const states = {
        peers: { icon: '\u{1F465}', title: 'No peers yet', hint: 'Share your invite link to get started' },
        history: { icon: '\u{1F4CB}', title: 'No activity yet', hint: 'Play, pause, or seek to see history' },
        logs: { icon: '\u{1F4DD}', title: 'No logs', hint: 'Connection events will appear here' },
        rooms: { icon: '\u{1F50D}', title: 'No active rooms', hint: 'Create a room or refresh to find public ones' }
    };
    const state = states[type] || { icon: '', title: '', hint: '' };
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'text-align:center; padding:16px 8px; color:var(--text-muted);';
    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = 'font-size:24px; margin-bottom:6px;';
    iconDiv.textContent = state.icon;
    const titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-size:12px; font-weight:600; margin-bottom:4px;';
    titleDiv.textContent = state.title;
    const hintDiv = document.createElement('div');
    hintDiv.style.cssText = 'font-size:10px; opacity:0.7;';
    hintDiv.textContent = state.hint;
    wrapper.appendChild(iconDiv);
    wrapper.appendChild(titleDiv);
    wrapper.appendChild(hintDiv);
    container.replaceChildren(wrapper);
}

function updatePeerList(peers) {
    if (!peers) return;
    activePeers = peers;
    if (peers.length === 0) {
        stopInterpolation();
    } else if (!interpolationInterval) {
        startInterpolation();
    }
    
    // UI Throttle: Only re-render if the peer state actually changed (excluding time interpolation)
    const stateToHash = peers.map(p => ({
        id: p.peerId,
        user: p.username,
        tab: p.tabTitle,
        media: p.mediaTitle,
        state: p.playbackState,
        vol: p.volume,
        muted: p.muted
    }));
    const currentPeersJson = JSON.stringify(stateToHash);
    if (currentPeersJson === lastPeersJson) return;
    lastPeersJson = currentPeersJson;

    const renderPeers = (container) => {
        container.innerHTML = '';
        if (peers.length === 0) {
            renderEmpty(container, 'peers');
            return;
        }

        peers.forEach(p => {
            const pId = typeof p === 'object' ? p.peerId : p;
            const pUsername = (typeof p === 'object' && p.username) ? p.username : '';
            const pTabTitle = (typeof p === 'object' && p.tabTitle) ? p.tabTitle : '';

            const peerItem = document.createElement('div');
            peerItem.className = 'peer-item';
            peerItem.style.cssText = 'position:relative; display:block; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.05);';

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding-right: 24px;';

            const nameSpan = document.createElement('span');
            const avatar = getAvatarForName(pUsername || pId);
            if (pUsername) {
                const u = document.createElement('span');
                u.style.cssText = 'font-weight:600; color:white;';
                u.textContent = `${avatar} ${pUsername}`;
                const i = document.createElement('span');
                i.style.cssText = 'font-size:10px; opacity:0.6; font-style:italic;';
                i.textContent = ` (${pId})`;
                nameSpan.appendChild(u);
                nameSpan.appendChild(i);
            } else {
                nameSpan.style.fontWeight = '600';
                nameSpan.textContent = `${avatar} ${pId}`;
            }

            header.appendChild(nameSpan);

            // Volume Icon (Top Right)
            if (p.volume !== undefined && p.volume !== null) {
                const volIcon = document.createElement('div');
                volIcon.style.cssText = 'position:absolute; top:8px; right:0; cursor:help; font-size:14px;';
                volIcon.textContent = getVolumeIcon(p.volume, p.muted);
                volIcon.title = p.muted ? 'Muted' : `Volume: ${Math.round(p.volume * 100)}%`;
                peerItem.appendChild(volIcon);
            }

            if (pId === localPeerId) {
                const you = document.createElement('span');
                you.style.cssText = 'font-size:10px; color:var(--accent); font-weight:bold;';
                you.textContent = 'YOU';
                header.appendChild(you);
            }

            peerItem.appendChild(header);

            // Media Info
            if (p.mediaTitle) {
                const mediaDiv = document.createElement('div');
                mediaDiv.style.cssText = 'font-size:11px; color:var(--star); font-weight: 600; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 280px;';
                mediaDiv.textContent = `🎬 ${p.mediaTitle}`;
                peerItem.appendChild(mediaDiv);
            }

            // Status Line (Play/Pause + Time)
            const statusLine = document.createElement('div');
            statusLine.style.cssText = 'display:flex; align-items:center; gap:8px; margin-top:4px;';

            if (p.playbackState) {
                const stateIcon = document.createElement('span');
                stateIcon.style.fontSize = '10px';
                if (p.playbackState === 'playing') {
                    stateIcon.textContent = '▶';
                    stateIcon.style.color = 'var(--success)';
                } else {
                    stateIcon.textContent = '⏸';
                    stateIcon.style.color = 'var(--error)';
                }
                statusLine.appendChild(stateIcon);
            }

            if (p.currentTime !== undefined && p.currentTime !== null) {
                const timeSpan = document.createElement('span');
                timeSpan.className = 'peer-time-display';
                timeSpan.dataset.peerId = pId;
                timeSpan.style.cssText = 'font-size:11px; font-family:monospace; color:var(--text-muted);';
                
                let displayTime = p.currentTime;
                if (p.playbackState === 'playing' && p.lastHeartbeat && p.currentTime != null) {
                    const elapsed = (Date.now() - p.lastHeartbeat) / 1000;
                    if (elapsed < 45) {
                        displayTime += elapsed;
                    }
                }
                timeSpan.textContent = formatTime(displayTime);
                statusLine.appendChild(timeSpan);
            }

            if (pTabTitle) {
                const titleDiv = document.createElement('span');
                titleDiv.style.cssText = 'font-size:10px; color:var(--text-muted); opacity: 0.6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; text-align: right;';
                titleDiv.textContent = pTabTitle;
                statusLine.appendChild(titleDiv);
            }

            peerItem.appendChild(statusLine);
            container.appendChild(peerItem);
        });
    };

    if (elements.peerList) renderPeers(elements.peerList);
    if (elements.peerListSync) renderPeers(elements.peerListSync);

    // Re-populate tabs to update Star Matching when peers change
    populateTabs(peers);
}

function detectPeerChanges(newPeers) {
    const oldIds = new Set(lastKnownPeers.map(p => p.peerId || p));
    const newIds = new Set(newPeers.map(p => p.peerId || p));

    for (const peer of newPeers) {
        const id = peer.peerId || peer;
        if (!oldIds.has(id)) {
            const name = peer.username || id.substring(0, 4);
            showToast(`${name} joined the room`, 'success');
        }
    }

    for (const oldPeer of lastKnownPeers) {
        const id = oldPeer.peerId || oldPeer;
        if (!newIds.has(id)) {
            const name = oldPeer.username || id.substring(0, 4);
            showToast(`${name} left the room`, 'info');
        }
    }

    lastKnownPeers = newPeers;
}

async function populateTabs(providedPeers = null, providedTargetTabId = null) {
    const token = {};
    populateTabsToken = token;

    const data = await chrome.storage.sync.get(['filterNoise']);
    const isFilterActive = data.filterNoise !== false;
    
    let currentTargetTabId = providedTargetTabId;
    if (currentTargetTabId === null) {
        const status = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_STATUS' }, r));
        if (chrome.runtime.lastError) {
            if (populateTabsToken !== token) return;
            currentTargetTabId = null;
        } else {
            currentTargetTabId = status?.targetTabId;
        }
    }
 
    let peerIds = providedPeers;
    if (!peerIds) {
        const status = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_STATUS' }, r));
        if (chrome.runtime.lastError) {
            if (populateTabsToken !== token) return;
            peerIds = [];
        } else {
            peerIds = status?.peers || [];
        }
    }

    let tabs = [];
    try {
        tabs = await chrome.tabs.query({});
    } catch (e) {
        console.warn('[Popup] tabs.query failed:', e.message);
        if (populateTabsToken !== token) return;
    }
    
    if (!elements.targetTab) return;
    if (populateTabsToken !== token) return;
    while (elements.targetTab.options.length > 1) {
        elements.targetTab.remove(1);
    }

    const filteredTabs = tabs.filter(tab => {
        if (!tab.url || tab.url.startsWith('chrome://')) return false;
        if (isFilterActive && tab.id !== parseInt(currentTargetTabId)) {
            const urlStr = tab.url.toLowerCase();
            if (BLACKLIST_DOMAINS.some(d => {
                const domain = d.toLowerCase();
                try {
                    const hostname = new URL(tab.url).hostname.toLowerCase();
                    if (domain.endsWith('.')) return hostname.startsWith(domain) || hostname.includes('.' + domain);
                    if (domain.includes('.')) return hostname === domain || hostname.endsWith('.' + domain);
                } catch {
                    /* ignore invalid URLs */
                }
                return urlStr.includes(domain);
            })) return false;
        }
        return true;
    });

    // Smart Matching Logic — exclude own tabTitle to prevent self-match (computed once)
    const cleanTitle = (rawTitle) => {
        if (!rawTitle) return '';
        return rawTitle
            .replace(/(?:\s*[-\|•]\s*(?:YouTube|Twitch|Jellyfin|Emby|Netflix|Vimeo|Dailymotion).*)$/i, '')
            .replace(/^(?:Netflix|Twitch|YouTube|Emby|Jellyfin)\s*[-\|•]\s*/i, '')
            .trim();
    };

    const peerTitles = peerIds
        .filter(p => (typeof p === 'object' ? p.peerId : p) !== localPeerId)
        .map(p => (typeof p === 'object' ? p.tabTitle : null))
        .filter(t => t && t.length > 3)
        .map(t => cleanTitle(t).toLowerCase())
        .filter(t => t.length > 3);

    filteredTabs.forEach(tab => {
        const option = document.createElement('option');
        option.value = tab.id;
        const rawTitle = (tab.title || 'Loading...');
        const title = cleanTitle(rawTitle).toLowerCase();
        
        const isMatch = title.length > 3 && peerTitles.some(pt => {
            return title.includes(pt) || pt.includes(title);
        });

        let label = rawTitle.substring(0, 45) + (rawTitle.length > 45 ? '...' : '');
        if (isMatch) {
            label = `⭐ MATCH: ${label}`;
            option.style.fontWeight = 'bold';
            option.style.color = 'var(--star)';
        }
        
        if (tab.audible) {
            label = `[🎬] ${label}`;
        }
        
        option.textContent = label;
        option.dataset.originalTitle = tab.title;
        elements.targetTab.appendChild(option);
    });

    // Sort: 1. Current tab first, 2. Matches, 3. Rest alphabetically
    const options = Array.from(elements.targetTab.options);
    const placeholder = options.shift();
    const currentTabId = providedTargetTabId ? parseInt(providedTargetTabId) : null;

    options.sort((a, b) => {
        const aId = parseInt(a.value);
        const bId = parseInt(b.value);

        if (aId === currentTabId) return -1;
        if (bId === currentTabId) return 1;

        const aMatch = a.textContent.includes('⭐');
        const bMatch = b.textContent.includes('⭐');
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;

        return a.textContent.localeCompare(b.textContent);
    });
    elements.targetTab.innerHTML = '';
    elements.targetTab.appendChild(placeholder);
    options.forEach(opt => elements.targetTab.appendChild(opt));

    if (currentTargetTabId) {
        elements.targetTab.value = currentTargetTabId;
    } else {
        const matchOpt = options.find(o => o.textContent.includes('⭐ MATCH:'));
        if (matchOpt && elements.targetTab.options.length > 1) {
            elements.targetTab.value = matchOpt.value;
            const tabTitle = matchOpt.dataset.originalTitle || null;
            chrome.runtime.sendMessage({ type: 'SET_TARGET_TAB', tabId: parseInt(matchOpt.value), tabTitle });
        }
    }
}

function applyConnectionStatus(status) {
    const connected = status === 'connected';
    const connecting = status === 'connecting';
    const reconnecting = status === 'reconnecting';
    const failed = status === 'reconnect_failed';

    if (elements.connDot) {
        elements.connDot.className = 'status-dot ' + (connected ? 'status-online' : (failed ? 'status-offline' : ((connecting || reconnecting) ? 'status-online' : 'status-offline')));
        
        if (reconnecting) {
            elements.connDot.style.background = '#f59e0b';
            elements.connDot.style.boxShadow = '0 0 8px #f59e0b';
        } else if (connecting) {
            elements.connDot.style.background = '#fbbf24';
            elements.connDot.style.boxShadow = '0 0 8px #fbbf24';
        } else if (failed) {
            elements.connDot.style.background = '#ef4444';
            elements.connDot.style.boxShadow = 'none';
        } else {
            elements.connDot.style.background = '';
            elements.connDot.style.boxShadow = '';
        }
    }

    if (elements.connText) {
        elements.connText.textContent = connected ? 'Connected' : (reconnecting ? 'Reconnecting...' : (connecting ? 'Connecting...' : (failed ? 'Failed' : 'Disconnected')));
    }
    if (elements.retryBtn) {
        elements.retryBtn.style.display = failed ? 'block' : 'none';
    }

    if (elements.joinBtn) {
        if (connecting || reconnecting) {
            elements.joinBtn.disabled = true;
            elements.joinBtn.textContent = connecting ? '🚀 Joining...' : '🔄 Reconnecting...';
        } else {
            elements.joinBtn.disabled = false;
            elements.joinBtn.textContent = 'Join Room';
        }
    }

    if (elements.playBtn) elements.playBtn.textContent = '▶ Play';
    if (elements.pauseBtn) elements.pauseBtn.textContent = '⏸ Pause';
    if (elements.forceSyncBtn) elements.forceSyncBtn.textContent = '⚡ SYNC';
}

function updateHistory(history) {
    if (!history || !elements.historyList) return;
    elements.historyList.innerHTML = '';

    if (history.length === 0) {
        renderEmpty(elements.historyList, 'history');
        return;
    }

    history.forEach(item => {
        const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const actionLabel = item.action.toUpperCase().replace('FORCE_SYNC_', '');
        
        const entry = document.createElement('div');
        entry.style.cssText = 'margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 2px;';
        
        const timeSpan = document.createElement('span');
        timeSpan.style.color = '#64748b';
        timeSpan.textContent = `[${time}] `;
        
        const actionBold = document.createElement('b');
        actionBold.textContent = actionLabel;
        
        const textNode1 = document.createTextNode(' by ');
        
        const senderSpan = document.createElement('span');
        if (item.senderId === 'You') {
            senderSpan.style.color = 'var(--accent)';
            senderSpan.textContent = 'You';
        } else {
            senderSpan.textContent = item.senderId;
        }
        
        entry.appendChild(timeSpan);
        entry.appendChild(actionBold);
        entry.appendChild(textNode1);
        entry.appendChild(senderSpan);
        
        elements.historyList.appendChild(entry);
    });
}

function refreshHistory() {
    chrome.runtime.sendMessage({ type: 'GET_HISTORY' }, (res) => {
        if (res) updateHistory(res);
    });
}

function updateRoomList(rooms) {
    if (!elements.publicRooms) return;
    elements.publicRooms.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        renderEmpty(elements.publicRooms, 'rooms');
        return;
    }

    rooms.forEach(r => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); cursor:pointer;';
        item.dataset.id = r.id;

        const leftSide = document.createElement('div');
        leftSide.style.cssText = 'display:flex; align-items:center; gap: 6px;';

        const idSpan = document.createElement('span');
        idSpan.style.fontWeight = '600';
        idSpan.textContent = r.id;

        leftSide.appendChild(idSpan);

        if (r.hasPassword) {
            const lock = document.createElement('span');
            lock.title = 'Password Protected';
            lock.textContent = '🔒';
            leftSide.appendChild(lock);
        }

        const peerCount = document.createElement('span');
        peerCount.style.cssText = 'font-size:11px; color:var(--accent)';
        peerCount.textContent = `${parseInt(r.peerCount)} peers`;

        item.appendChild(leftSide);
        item.appendChild(peerCount);

        item.addEventListener('click', () => {
            elements.roomId.value = r.id;
            elements.password.value = '';
            elements.password.focus();
        });

        elements.publicRooms.appendChild(item);
    });
}

function checkInviteLink() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.includes(OFFICIAL_LANDING_PAGE_URL) && tab.url.includes('#join:')) {
            try {
                const rawHash = tab.url.split('#join:')[1];
                if (!rawHash) return;
                const parts = rawHash.split(':');
                if (parts.length >= 2) {
                    const roomId = parts.shift();
                    let useCustomServer = false;
                    let serverUrl = '';

                    const last = parts[parts.length - 1];
                    const secondToLast = parts[parts.length - 2];
                    const decodedLast = decodeURIComponent(last || '');
                    const isCustom = secondToLast === '1' && (decodedLast.startsWith('ws://') || decodedLast.startsWith('wss://'));
                    const isOfficial = secondToLast === '0' && last === '';

                    if (parts.length >= 3 && (isCustom || isOfficial)) {
                        serverUrl = decodeURIComponent(parts.pop());
                        useCustomServer = parts.pop() === '1';
                    }

                    const password = parts.join(':');

                    elements.roomId.value = roomId;
                    elements.password.value = password;
                    
                    if (serverUrl || useCustomServer) {
                        elements.serverUrl.value = serverUrl;
                        setServerMode(useCustomServer);
                        chrome.storage.sync.set({ serverUrl, useCustomServer });
                    }

                    elements.joinBtn.style.boxShadow = '0 0 15px var(--accent)';
                    setTimeout(() => elements.joinBtn.style.boxShadow = '', 2000);
                }
            } catch (_e) {
                // Malformed invite link, ignore
            }
        }
    });
}

function setServerMode(custom) {
    elements.serverOfficial.classList.toggle('active', !custom);
    elements.serverCustom.classList.toggle('active', custom);
    elements.serverUrl.style.display = custom ? 'block' : 'none';
    chrome.storage.sync.get(['useCustomServer'], (data) => {
        if (data.useCustomServer !== custom) {
            chrome.storage.sync.set({ useCustomServer: custom });
        }
    });
}

elements.serverOfficial.addEventListener('click', () => setServerMode(false));
elements.serverCustom.addEventListener('click', () => setServerMode(true));

elements.filterNoise.addEventListener('change', () => {
    chrome.storage.sync.set({ filterNoise: elements.filterNoise.checked }, () => {
        populateTabs();
    });
});

elements.autoSyncNextEpisode.addEventListener('change', () => {
    chrome.storage.sync.set({ autoSyncNextEpisode: elements.autoSyncNextEpisode.checked });
});

elements.browserNotifications.addEventListener('change', () => {
    chrome.storage.sync.set({ browserNotifications: elements.browserNotifications.checked });
});

if (elements.autoCopyInvite) {
    elements.autoCopyInvite.addEventListener('change', () => {
        chrome.storage.sync.set({ autoCopyInvite: elements.autoCopyInvite.checked });
    });
}

elements.forceSyncMode.addEventListener('change', () => {
    chrome.storage.sync.set({ forceSyncMode: elements.forceSyncMode.value });
});

elements.serverUrl.addEventListener('input', () => {
    chrome.storage.sync.set({ serverUrl: elements.serverUrl.value });
});

elements.username.addEventListener('change', () => {
    chrome.storage.sync.set({ username: elements.username.value });
});

elements.serverUrl.addEventListener('change', () => {
    let url = elements.serverUrl.value.trim();
    if (url && !url.includes('://')) {
        url = 'ws://' + url;
        elements.serverUrl.value = url;
        chrome.storage.sync.set({ serverUrl: url });
    }
});

elements.tabs.forEach(btn => {
    btn.addEventListener('click', () => {
        elements.tabs.forEach(b => b.classList.remove('active'));
        elements.contents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        
        const targetContent = document.getElementById(btn.dataset.tab);
        targetContent.classList.add('active');
        
        targetContent.classList.remove('tab-active-animate');
        void targetContent.offsetWidth; // Force reflow to restart animation
        targetContent.classList.add('tab-active-animate');
        
        isDevTabVisible = btn.dataset.tab === 'tab-dev';
        if (isDevTabVisible) refreshLogs();
        if (btn.dataset.tab === 'tab-sync') refreshHistory();
    });
});

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function showError(msg) {
    if (!elements.roomError) return;
    const currentToken = ++errorToken;
    elements.roomError.textContent = msg;
    elements.roomError.style.display = 'block';
    elements.roomId.style.borderColor = 'var(--error)';
    elements.password.style.borderColor = 'var(--error)';
    
    showToast(msg, 'error', 5000);

    setTimeout(() => {
        if (currentToken !== errorToken) return;
        if (elements.roomError) elements.roomError.style.display = 'none';
        elements.roomId.style.borderColor = '';
        elements.password.style.borderColor = '';
    }, 5000);
}

// --- Action Handlers ---
elements.joinBtn.addEventListener('click', async () => {
    if (elements.joinBtn.disabled) return;
    const roomIdInput = elements.roomId.value.trim();
    const isCreating = !roomIdInput;
    
    elements.joinBtn.disabled = true;
    elements.joinBtn.textContent = isCreating ? 'Creating Room...' : 'Joining...';
    
    if (joinBtnTimeout) clearTimeout(joinBtnTimeout);
    joinBtnTimeout = setTimeout(() => {
        elements.joinBtn.disabled = false;
        elements.joinBtn.textContent = 'Join Room';
        joinBtnTimeout = null;
        showError('Connection timed out. Please try again.');
    }, 15000);
    
    const serverUrl = elements.serverUrl.value.trim();
    const useCustom = elements.serverCustom.classList.contains('active');

    // Proactive URL Validation
    if (useCustom && serverUrl) {
        try {
            const urlToCheck = serverUrl.includes('://') ? serverUrl : 'ws://' + serverUrl;
            new URL(urlToCheck);
        } catch (_e) {
            showError('Invalid Server URL format.');
            elements.joinBtn.disabled = false;
            elements.joinBtn.textContent = 'Join Room';
            return;
        }
    }

    const roomId = roomIdInput || Math.random().toString(36).substring(2, 8).toUpperCase();
    const password = elements.password.value;

    await chrome.storage.sync.set({ serverUrl, roomId, password });
    elements.roomId.value = roomId;

    // Tell background to connect
    chrome.runtime.sendMessage({ type: 'CONNECT' });
    
    // UI Feedback: Immediately switch state for better responsiveness
    updateUI(roomId, password, useCustom, serverUrl);
});

elements.leaveBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'LEAVE_ROOM' });
    await chrome.storage.sync.set({ roomId: '', password: '' });
    elements.roomId.value = '';
    elements.password.value = '';
    lastKnownPeers = [];
    updateUI(null, null);
});

function handleCreateRoom() {
    const generateId = () => Math.random().toString(36).substring(2, 8).toUpperCase();
    const roomId = generateId();
    const password = generateId();
    elements.roomId.value = roomId;
    elements.password.value = password;
    window.justCreatedRoom = true;
    
    // Auto-connect
    elements.joinBtn.click();
}

elements.createRoomBtn.addEventListener('click', handleCreateRoom);
const syncTabCreateRoomBtn = document.getElementById('syncTabCreateRoomBtn');
if (syncTabCreateRoomBtn) syncTabCreateRoomBtn.addEventListener('click', () => {
    document.querySelector('.tab-btn[data-tab="tab-room"]').click();
    handleCreateRoom();
});

elements.refreshRooms.addEventListener('click', () => {
    elements.publicRooms.replaceChildren();
    const el = document.createElement('div');
    el.style.cssText = 'text-align:center; padding: 10px; color:var(--text-muted);';
    el.textContent = 'Refreshing...';
    elements.publicRooms.appendChild(el);
    chrome.runtime.sendMessage({ type: 'GET_ROOM_LIST' });
});

elements.retryBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RETRY_CONNECT' });
});

elements.targetTab.addEventListener('change', () => {
    const val = elements.targetTab.value;
    const tabId = val ? parseInt(val) : null;
    const tabTitle = elements.targetTab.options[elements.targetTab.selectedIndex]?.dataset.originalTitle || null;
    chrome.runtime.sendMessage({ type: 'SET_TARGET_TAB', tabId, tabTitle });
});

elements.forceSyncBtn.addEventListener('click', async () => {
    if (elements.forceSyncBtn.disabled) return;
    
    const status = await new Promise(r => chrome.runtime.sendMessage({ type: 'GET_STATUS' }, r));
    if (chrome.runtime.lastError || !status || !status.targetTabId) return;

    const mode = elements.forceSyncMode.value;
    let targetTime = null;

    if (mode === 'jump-to-others') {
        if (!localPeerId) {
            showError('Identity not yet loaded. Wait a moment and try again.');
            return;
        }
        const peers = status.peers || [];
        const otherTimes = peers
            .filter(p => typeof p === 'object' && p.peerId !== localPeerId && p.currentTime != null && !isNaN(p.currentTime))
            .map(p => p.currentTime);

        if (otherTimes.length === 0) {
            showError('No other peers with a known time. Switch to "Jump to Me".');
            return;
        }

        otherTimes.sort((a, b) => a - b);
        const mid = Math.floor(otherTimes.length / 2);
        targetTime = otherTimes.length % 2 !== 0 ? otherTimes[mid] : (otherTimes[mid - 1] + otherTimes[mid]) / 2;
    }

    const originalText = elements.forceSyncBtn.textContent;
    elements.forceSyncBtn.disabled = true;
    elements.forceSyncBtn.textContent = mode === 'jump-to-others' ? `Syncing to group (${formatTime(targetTime)})...` : 'Syncing...';
    forceSyncDone = false;
    const peerCount = (status.peers || []).filter(p => (typeof p === 'object' ? p.peerId : p) !== localPeerId).length;
    const syncTimeoutMs = peerCount === 0 ? 3000 : 12000;
    const forceSyncReset = () => {
        if (!forceSyncDone) {
            elements.forceSyncBtn.disabled = false;
            elements.forceSyncBtn.textContent = originalText;
        }
    };
    forceSyncResetTimer = setTimeout(forceSyncReset, syncTimeoutMs);
    const tabId = parseInt(status.targetTabId);

    const sendForceSync = (time) => {
        chrome.runtime.sendMessage({
            type: 'CONTENT_EVENT',
            action: EVENTS.FORCE_SYNC_PREPARE,
            payload: { targetTime: parseFloat(time) }
        });
    };

    if (mode === 'jump-to-me') {
        chrome.tabs.sendMessage(tabId, { action: 'get_current_time' }, (response) => {
            if (chrome.runtime.lastError || !response || response.currentTime === undefined) {
                chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                }).then(() => {
                    setTimeout(() => {
                        chrome.tabs.sendMessage(tabId, { action: 'get_current_time' }, (retryResponse) => {
                            if (chrome.runtime.lastError) return;
                            if (retryResponse && retryResponse.currentTime !== undefined) {
                                sendForceSync(retryResponse.currentTime);
                            }
                        });
                    }, 500);
                }).catch(() => {
                    showError('Could not connect to video tab.');
                    forceSyncDone = true;
                    elements.forceSyncBtn.disabled = false;
                    elements.forceSyncBtn.textContent = originalText;
                });
                return;
            }
            sendForceSync(response.currentTime);
        });
    } else {
        sendForceSync(targetTime);
    }
});

elements.playBtn.addEventListener('click', () => {
    if (!elements.targetTab.value) {
        showToast('Please select a video first!', 'warning');
        return;
    }
    elements.playBtn.textContent = '▶ Playing...';
    elements.playBtn.disabled = true;
    chrome.runtime.sendMessage({
        type: 'CONTENT_EVENT',
        action: EVENTS.PLAY,
        payload: {}
    }, (response) => {
        if (response && response.status === 'ok_solo') {
            elements.playBtn.textContent = '▶ Play';
            elements.playBtn.disabled = false;
        }
    });
    // Safety reset: restore button after 2.5s in case no peers respond
    setTimeout(() => {
        if (elements.playBtn.disabled) {
            elements.playBtn.textContent = '▶ Play';
            elements.playBtn.disabled = false;
        }
    }, 2500);
});

elements.pauseBtn.addEventListener('click', () => {
    if (!elements.targetTab.value) {
        showToast('Please select a video first!', 'warning');
        return;
    }
    elements.pauseBtn.textContent = '⏸ Pausing...';
    elements.pauseBtn.disabled = true;
    chrome.runtime.sendMessage({
        type: 'CONTENT_EVENT',
        action: EVENTS.PAUSE,
        payload: {}
    }, (response) => {
        if (response && response.status === 'ok_solo') {
            elements.pauseBtn.textContent = '⏸ Pause';
            elements.pauseBtn.disabled = false;
        }
    });
    // Safety reset: restore button after 2.5s in case no peers respond
    setTimeout(() => {
        if (elements.pauseBtn.disabled) {
            elements.pauseBtn.textContent = '⏸ Pause';
            elements.pauseBtn.disabled = false;
        }
    }, 2500);
});

elements.clearLogs.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, () => {
        elements.logList.innerHTML = '';
    });
});

elements.copyInvite.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.inviteLink.value).then(() => {
        const original = elements.copyInvite.textContent;
        elements.copyInvite.textContent = '✓';
        elements.copyInvite.style.background = 'var(--success)';
        elements.copyInvite.style.color = 'white';
        showToast('Invite link copied!', 'success', 2000);
        setTimeout(() => {
            elements.copyInvite.textContent = original;
            elements.copyInvite.style.background = '';
            elements.copyInvite.style.color = '';
        }, 2000);
    }).catch(() => {
        showToast('Failed to copy to clipboard', 'error');
    });
});

if (elements.syncTabCopyInvite) {
    elements.syncTabCopyInvite.addEventListener('click', () => {
        navigator.clipboard.writeText(elements.inviteLink.value).then(() => {
            const original = elements.syncTabCopyInvite.textContent;
            elements.syncTabCopyInvite.textContent = '✓';
            elements.syncTabCopyInvite.style.color = 'var(--success)';
            showToast('Invite link copied!', 'success', 2000);
            setTimeout(() => {
                elements.syncTabCopyInvite.textContent = original;
                elements.syncTabCopyInvite.style.color = '';
            }, 2000);
        });
    });
}

// --- Logs & Status ---
async function refreshLogs() {
    chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (logs) => {
        if (elements.logList) {
            if (!logs || logs.length === 0) {
                renderEmpty(elements.logList, 'logs');
                return;
            }
            elements.logList.innerHTML = '';
            logs.forEach(log => {
                const entry = document.createElement('div');
                entry.className = `log-entry log-${log.type}`;
                const timeStr = log.timestamp?.split('T')?.[1]?.split('.')[0] || '?';
                entry.textContent = `[${timeStr}] ${log.message}`;
                elements.logList.appendChild(entry);
            });
        }
    });
}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'LOG_UPDATE') {
        refreshLogs();
        if (msg.log && msg.log.type === 'error') {
            showError(msg.log.message);
        }
    } else if (msg.type === 'ACTION_UPDATE') {
        const state = msg.state;
        if (state && state.senderId && state.senderId !== 'You') {
            const actionNames = {
                'play': '▶ Play',
                'pause': '⏸ Pause',
                'seek': '⏩ Seek',
                'force_sync_prepare': '⚡ Sync',
                'force_sync_execute': '⚡ Sync Play'
            };
            const action = actionNames[state.action] || state.action;
            showToast(`${state.senderId} ${action}`, 'info', 2000);
        }

        if (state && (state.action === 'play' || state.action === 'pause')) {
            const btn = state.action === 'play' ? elements.playBtn : elements.pauseBtn;
            if (btn && btn.disabled) {
                chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
                    const peerCount = res && res.peers ? res.peers.length : 1;
                    if (state.acks && state.acks.length >= peerCount) {
                        btn.textContent = '✅ Synced!';
                        setTimeout(() => {
                            btn.disabled = false;
                            btn.textContent = state.action === 'play' ? '▶ Play' : '⏸ Pause';
                        }, 2000);
                    }
                });
            }
        }

        if (state && state.action === 'force_sync_execute') {
            forceSyncDone = true;
            if (forceSyncResetTimer) {
                clearTimeout(forceSyncResetTimer);
                forceSyncResetTimer = null;
            }
            if (elements.forceSyncBtn) {
                elements.forceSyncBtn.disabled = false;
                elements.forceSyncBtn.textContent = '✅ Synced!';
                setTimeout(() => {
                    elements.forceSyncBtn.textContent = '⚡ SYNC';
                }, 2000);
            }
        }
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
            if (res && res.peers) updateLastActionUI(msg.state, res.peers);
        });
    } else if (msg.type === 'PEER_UPDATE') {
        updatePeerList(msg.peers);
        if (msg.peers) detectPeerChanges(msg.peers);
    } else if (msg.type === 'CONNECTION_STATUS') {
        applyConnectionStatus(msg.status);
        if (msg.status === 'connected') {
            chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
                if (res && res.peers) updatePeerList(res.peers);
                if (res && res.lastActionState) updateLastActionUI(res.lastActionState, res.peers);
            });
        }
        if (msg.status === 'disconnected' || msg.status === 'reconnect_failed') {
            elements.joinBtn.disabled = false;
            elements.joinBtn.textContent = 'Join Room';
        }
        if (msg.status === 'reconnecting') {
            chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
                if (chrome.runtime.lastError) return;
                if (res && res.reconnectAttempts !== undefined) {
                    if (elements.connText) {
                        elements.connText.textContent = `Reconnecting... (${res.reconnectAttempts})`;
                    }
                }
            });
        }
    } else if (msg.type === 'HISTORY_UPDATE') {
        updateHistory(msg.history);
    } else if (msg.type === 'ROOM_LIST') {
        updateRoomList(msg.rooms);
    } else if (msg.type === 'JOIN_STATUS') {
        if (msg.success) {
            // Final confirmation of join from background
            chrome.storage.sync.get(['roomId', 'password', 'useCustomServer', 'serverUrl'], (data) => {
                updateUI(data.roomId, data.password, data.useCustomServer, data.serverUrl);
            });
        } else {
            // Join failed: reset UI state
            updateUI(null, null);
        }
    } else if (msg.type === 'LOBBY_UPDATE') {
        // Episode lobby state changed
        chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
            if (res && res.peers) {
                updateLobbyUI(msg.lobby, res.peers);
            } else {
                updateLobbyUI(msg.lobby, []);
            }
        });
    }
});

elements.copyLogs.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (logs) => {
        if (!logs || logs.length === 0) return;
        const text = logs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`).join('\n');
        navigator.clipboard.writeText(text).then(() => {
            const original = elements.copyLogs.textContent;
            elements.copyLogs.textContent = 'Copied!';
            setTimeout(() => elements.copyLogs.textContent = original, 2000);
        }).catch(() => {
            showToast('Failed to copy to clipboard', 'error');
        });
    });
});

function refreshDebugInfo() {
    // Only refresh if Dev tab is visible
    const devTab = document.getElementById('tab-dev');
    if (!devTab || devTab.style.display === 'none') return;

    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (res) => {
        if (!res || !res.targetTabId) {
            if (elements.videoDebug) elements.videoDebug.textContent = 'No target tab selected.';
            return;
        }

        // Request direct state from the content script via background
        chrome.runtime.sendMessage({ type: 'GET_VIDEO_STATE', tabId: res.targetTabId }, (state) => {
            if (!state || state.error) {
                if (elements.videoDebug) elements.videoDebug.textContent = 'Could not communicate with tab video.';
                return;
            }

            if (elements.videoDebug) {
                elements.videoDebug.innerHTML = '';
                
                const addField = (label, value, color = null) => {
                    const row = document.createElement('div');
                    row.style.marginBottom = '4px';
                    if (color) row.style.color = color;
                    
                    const b = document.createElement('b');
                    b.textContent = `${label}: `;
                    b.style.color = 'var(--text-muted)';
                    
                    const span = document.createElement('span');
                    span.textContent = value;
                    span.style.wordBreak = 'break-all';
                    
                    row.appendChild(b);
                    row.appendChild(span);
                    elements.videoDebug.appendChild(row);
                };

                const addSection = (title) => {
                    const div = document.createElement('div');
                    div.style.cssText = 'margin: 8px 0 4px 0; border-bottom: 1px solid #334155; padding-bottom: 2px; color: var(--accent); font-weight: bold; font-size: 9px;';
                    div.textContent = title.toUpperCase();
                    elements.videoDebug.appendChild(div);
                };

                addField('STATE', state.paused ? 'PAUSED' : 'PLAYING', 'var(--accent)');
                addField('TIME', `${state.currentTime.toFixed(2)}s / ${(state.duration || 0).toFixed(2)}s`);
                addField('READY', state.readyState);
                
                addSection('Identification');
                addField('URL', state.url);
                addField('ID', state.id);
                addField('CLASS', state.className);
                
                addSection('Media Source');
                addField('CURRENT_SRC', state.currentSrc);
                addField('SRC', state.src);

                if (state.metadata) {
                    addSection('Media Session API');
                    addField('TITLE', state.metadata.title || 'n/a');
                    addField('ARTIST', state.metadata.artist || 'n/a');
                    addField('ALBUM', state.metadata.album || 'n/a');
                }

                if (state.dataAttributes && Object.keys(state.dataAttributes).length > 0) {
                    addSection('Data Attributes');
                    for (const [key, val] of Object.entries(state.dataAttributes)) {
                        addField(key.replace('data-', '').toUpperCase(), val);
                    }
                }
            }
        });
    });
}

init();
popupIntervals.push(setInterval(() => {
    if (isDevTabVisible) refreshLogs();
}, 5000));

window.addEventListener('unload', () => {
    stopInterpolation();
    popupIntervals.forEach(clearInterval);
    popupIntervals = [];
    if (joinBtnTimeout) {
        clearTimeout(joinBtnTimeout);
        joinBtnTimeout = null;
    }
    if (forceSyncResetTimer) {
        clearTimeout(forceSyncResetTimer);
        forceSyncResetTimer = null;
    }
});

// --- Episode Lobby UI ---
function updateLobbyUI(lobby, peers) {
    if (!elements.episodeLobbyCard) return;

    if (!lobby) {
        elements.episodeLobbyCard.style.display = 'none';
        return;
    }

    elements.episodeLobbyCard.style.display = 'block';
    elements.lobbyTitle.textContent = `\u{1F3AC} Waiting for: "${lobby.expectedTitle}"`;

    // Build peer readiness list
    const readySet = new Set(lobby.readyPeers || []);
    const peerLines = [];

    if (peers && peers.length > 0) {
        peers.forEach(p => {
            const pId = typeof p === 'object' ? p.peerId : p;
            const pName = (typeof p === 'object' && p.username) ? p.username : pId;
            const avatar = getAvatarForName(pName);
            const isReady = readySet.has(pId);
            const icon = isReady ? '\u2705' : '\u23f3';
            const label = isReady ? 'Ready' : 'Loading...';
            peerLines.push(`${icon} ${avatar} ${pName} \u2014 ${label}`);
        });
    }

    if (peerLines.length > 0 && elements.lobbyPeerStatus) {
        elements.lobbyPeerStatus.textContent = peerLines.join(' | ');
    } else if (elements.lobbyPeerStatus) {
        elements.lobbyPeerStatus.textContent = 'Waiting for peers...';
    }

    // Show elapsed time
    if (lobby.createdAt && elements.lobbyPeerStatus) {
        const elapsed = Math.floor((Date.now() - lobby.createdAt) / 1000);
        elements.lobbyPeerStatus.textContent += ` (${elapsed}s)`;
    }
}

// --- Onboarding Tour ---
const onboardingSteps = [
    { icon: '👋', title: 'Welcome to KoalaSync!', text: 'Watch videos together in perfect sync — no matter where you are. Let\'s take a quick tour!', targetTab: 'tab-room' },
    { icon: '🏠', title: '1. Create a Room', text: 'Start here. Create a room and share the invite link with your friends.', targetTab: 'tab-room' },
    { icon: '🎬', title: '2. Select Video', text: 'Navigate here to select the video you want to sync. Play, pause, and seek — everyone stays in sync.', targetTab: 'tab-sync' },
    { icon: '⚙️', title: '3. Personalize', text: 'Pick a fun username so your friends know who you are.', targetTab: 'tab-settings' },
    { icon: '🎉', title: 'You\'re all set!', text: 'Time to grab some popcorn. Enjoy watching together!', targetTab: 'tab-room' }
];

let onboardingStep = 0;

function showOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;
    document.body.style.minHeight = '400px';
    overlay.style.display = 'flex';
    renderOnboardingStep();
}

function renderOnboardingStep() {
    const step = onboardingSteps[onboardingStep];
    const icon = document.getElementById('onboarding-icon');
    const title = document.getElementById('onboarding-title');
    const text = document.getElementById('onboarding-text');
    const nextBtn = document.getElementById('onboarding-next');
    const dots = document.getElementById('onboarding-dots');
    if (!icon || !title || !text || !nextBtn || !dots) return;

    icon.textContent = step.icon;
    title.textContent = step.title;
    text.textContent = step.text;

    if (step.targetTab) {
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${step.targetTab}"]`);
        if (tabBtn) tabBtn.click();
        
        const syncActive = document.getElementById('sync-active');
        const syncInactive = document.getElementById('sync-inactive');
        if (step.targetTab === 'tab-sync') {
            if (syncActive) syncActive.style.display = 'block';
            if (syncInactive) syncInactive.style.display = 'none';
        } else {
            // Restore actual lock state when on other tabs so we don't leave it unlocked
            const inRoom = elements.sectionActive && elements.sectionActive.style.display === 'block';
            if (syncActive) syncActive.style.display = inRoom ? 'block' : 'none';
            if (syncInactive) syncInactive.style.display = inRoom ? 'none' : 'block';
        }
    }

    dots.replaceChildren();
    onboardingSteps.forEach((_, i) => {
        const dot = document.createElement('div');
        dot.style.cssText = `width:8px; height:8px; border-radius:50%; background:${i === onboardingStep ? 'var(--accent)' : '#475569'};`;
        dots.appendChild(dot);
    });

    nextBtn.textContent = onboardingStep === onboardingSteps.length - 1 ? 'Done!' : 'Next';
}

function completeOnboarding() {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.minHeight = '';
    chrome.storage.sync.set({ onboardingComplete: true });
    
    const inRoom = elements.sectionActive && elements.sectionActive.style.display === 'block';
    toggleUIState(inRoom);
}

document.getElementById('onboarding-next')?.addEventListener('click', () => {
    onboardingStep++;
    if (onboardingStep >= onboardingSteps.length) {
        completeOnboarding();
    } else {
        renderOnboardingStep();
    }
});

document.getElementById('onboarding-skip')?.addEventListener('click', completeOnboarding);

document.getElementById('onboarding-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'onboarding-overlay') completeOnboarding();
});
