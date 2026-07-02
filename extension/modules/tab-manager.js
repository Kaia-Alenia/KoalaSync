export function initTabManager({
    getCurrentTabId,
    setCurrentTabId,
    setCurrentTabTitle,
    setLastContentHeartbeatAt,
    setRoomIdleSince,
    getCurrentRoom,
    getPeerId,
    getStorageInitialized,
    updateBadgeStatus,
    addLog,
    getSettings,
    emit,
    applyAudioSettingsToTab,
    injectContentScript,
    ensureState,
    EVENTS
}) {
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area !== 'local' || !changes.audioSettings) return;
        await ensureState();
        const tabId = getCurrentTabId();
        if (!tabId) return;

        chrome.tabs.sendMessage(tabId, {
            action: 'APPLY_AUDIO_SETTINGS',
            settings: changes.audioSettings.newValue
        }).catch(() => {});
    });

    chrome.tabs.onRemoved.addListener(async (tabId) => {
        await ensureState();
        if (tabId === getCurrentTabId()) {
            const wasInRoom = !!getCurrentRoom();
            setCurrentTabId(null);
            setCurrentTabTitle(null);
            setLastContentHeartbeatAt(null);
            const now = Date.now();
            setRoomIdleSince(now);
            chrome.storage.session.set({
                currentTabId: null,
                currentTabTitle: null,
                roomIdleSince: now,
                lastContentHeartbeatAt: null
            });
            updateBadgeStatus();
            addLog('Target tab closed.', 'warn');

            if (wasInRoom) {
                const roomAtClose = getCurrentRoom();
                getSettings().then(settings => {
                    if (getCurrentRoom() !== roomAtClose) return;

                    emit(EVENTS.PEER_STATUS, {
                        peerId: getPeerId(),
                        playbackState: 'paused',
                        currentTime: null,
                        mediaTitle: null,
                        username: settings.username,
                        tabTitle: null
                    });

                    const room = getCurrentRoom();
                    if (room && Array.isArray(room.peers)) {
                        const me = room.peers.find(p => (p.peerId || p) === getPeerId());
                        if (me && typeof me === 'object') {
                            me.playbackState = 'paused';
                            me.currentTime = null;
                            me.mediaTitle = null;
                            me.tabTitle = null;
                            me.lastHeartbeat = Date.now();
                            if (getStorageInitialized()) {
                                chrome.storage.session.set({ currentRoom: room });
                            }
                            chrome.runtime.sendMessage({ type: 'PEER_UPDATE', peers: room.peers }).catch(() => {});
                        }
                    }
                }).catch(() => {});
            }
        }
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
        await ensureState();
        const curTabId = getCurrentTabId();
        if (curTabId && tabId === parseInt(curTabId) && changeInfo.status === 'complete') {
            injectContentScript(tabId)
                .then(() => applyAudioSettingsToTab(tabId))
                .catch(() => {});
        }
    });
}
