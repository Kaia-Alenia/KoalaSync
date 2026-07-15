export function initTabManager({
    getCurrentTabId,
    reactivateCurrentTarget,
    ensureState
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

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
        await ensureState();
        const currentTabId = Number(getCurrentTabId());
        if (Number.isInteger(currentTabId)
            && currentTabId > 0
            && tabId === currentTabId
            && changeInfo.status === 'complete') {
            reactivateCurrentTarget(tabId).catch(() => {});
        }
    });
}
