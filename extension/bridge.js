/* global cloneInto */
/**
 * KoalaSync Bridge Script
 * Injected into sync.koalastuff.net to facilitate communication between 
 * the landing page and the extension.
 */

// 1. Signal presence to the website
document.documentElement.dataset.koalasyncInstalled = 'true';

// 2. Listen for Join Requests from the Website
window.addEventListener('KOALASYNC_JOIN_REQUEST', (e) => {
    const { roomId, password, useCustomServer, serverUrl } = e.detail;
    chrome.runtime.sendMessage({ 
        type: 'WEB_JOIN_REQUEST', 
        roomId, 
        password,
        useCustomServer,
        serverUrl
    });
});

// 3. Listen for Status Updates from the Extension and relay to Website
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'JOIN_STATUS') {
        const detail = { success: msg.success, message: msg.message };
        // Firefox MV3 content scripts run in an isolated world. When dispatching
        // a CustomEvent with a detail object, Firefox wraps it in an XrayWrapper
        // that the page's JavaScript cannot destructure (Permission denied).
        // cloneInto() exposes the object to the page's context correctly.
        // Chrome doesn't have this issue — cloneInto() is undefined there.
        const safeDetail = typeof cloneInto === 'function'
            ? cloneInto(detail, document.defaultView)
            : detail;
        window.dispatchEvent(new CustomEvent('KOALASYNC_STATUS', { detail: safeDetail }));
    }
});
