import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const backgroundSource = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(extensionDir, 'content.js'), 'utf8');
const overlaySource = fs.readFileSync(path.join(extensionDir, 'chat-overlay.js'), 'utf8');
const monitorSource = fs.readFileSync(path.join(extensionDir, 'media-frame-monitor.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.base.json'), 'utf8'));

describe('target tab lifecycle', () => {
    it('injects playback and chat scripts only into the explicitly selected tab', () => {
        expect(backgroundSource).not.toContain('chrome.tabs.onActivated');
        expect(backgroundSource).not.toContain('chrome.tabs.query({})');
        expect(backgroundSource).toContain('contentTarget = await resolveMediaContentTarget(chrome, tabId)');
        expect(backgroundSource).toContain('target: scriptTarget');
        expect(backgroundSource).toContain("files: ['chat-format.js', 'chat-overlay.js', 'content.js']");
        expect(backgroundSource).toContain("chrome.tabs.query({ url: 'https://sync.koalastuff.net/*' })");

        const activationStart = backgroundSource.indexOf('async function activateTargetTab');
        const activationEnd = backgroundSource.indexOf('async function reactivateCurrentTarget', activationStart);
        const activationSource = backgroundSource.slice(activationStart, activationEnd);
        expect(activationSource.indexOf('await injectContentScript(selectedTabId'))
            .toBeLessThan(activationSource.indexOf('await deactivateTargetTab(previousTabId, previousContentTarget)'));
        expect(activationSource).toContain('previousTabId !== selectedTabId');
        expect(activationSource).toContain('keeping tab ${previousTabId} selected');
        expect(contentSource).toContain('if (window.koalaSyncInjected && chrome.runtime.id)');
        expect(overlaySource).toContain('if (window.koalaSyncChatOverlay?.refresh)');
    });

    it('fully deactivates old and superseded target injections', () => {
        expect(backgroundSource).toContain("{ type: 'TARGET_DEACTIVATE' }");
        expect(backgroundSource).toContain('target.documentId');
        expect(backgroundSource.match(/await deactivateTargetTab\(selectedTabId,/g)?.length).toBeGreaterThanOrEqual(6);
        expect(contentSource).toContain("if (message.type === 'TARGET_DEACTIVATE')");
        expect(overlaySource).toContain("message?.type === 'TARGET_DEACTIVATE'");
    });

    it('removes monitors injected by a superseded cross-tab activation', () => {
        expect(backgroundSource).toContain('function isTargetActivationSuperseded(tabId, activationGeneration)');
        expect(backgroundSource).toMatch(/navigationRetries: navigationRetries - 1,\s*activationGeneration\s*\}\)/);
        expect(backgroundSource).toMatch(/await injectMediaFrameMonitors\(tabId, contentTarget\);[\s\S]*if \(isTargetActivationSuperseded\(tabId, activationGeneration\)\)[\s\S]*await deactivateMediaFrameMonitors\(tabId\);/);
        expect(backgroundSource).toContain("error.code = 'target_activation_superseded'");
    });

    it('uses all-frame probing for cross-origin targets without navigation permissions', () => {
        expect(backgroundSource).toContain("files: ['media-frame-monitor.js']");
        expect(backgroundSource).toContain('...listMediaFrameScriptTargets(tabId)');
        expect(backgroundSource).toContain('One denied widget frame must not block the selected player');
        expect(backgroundSource).toContain("navigationError.code = 'media_target_navigated'");
        expect(backgroundSource).toContain('async function deactivateMediaFrameMonitors(tabId, contentTarget');
        expect(backgroundSource).toContain('func: deactivateMediaFrameMonitor');
        expect(monitorSource).toContain("type: 'MEDIA_FRAME_CANDIDATE_CHANGED'");
        expect(monitorSource).toContain("attributeFilter: ['class', 'style', 'hidden', 'src', 'controls']");
        expect(monitorSource).toContain('if (!force && nextSignature === lastCandidateSignature) return');
        expect(monitorSource).toContain("const MEDIA_STATE_EVENTS = ['play', 'pause', 'loadedmetadata'");
        expect(monitorSource).toContain("node.querySelector?.('video, iframe, frame')");
        expect(manifest.permissions).toEqual([
            'storage',
            'tabs',
            'scripting',
            'alarms',
            'activeTab',
            'notifications'
        ]);
        expect(backgroundSource).not.toMatch(/chrome\.(?:web)?Navigation/);
    });

    it('keeps the selected frame recoverable when an all-frame sweep is rejected', () => {
        expect(backgroundSource).toContain('contentTarget?.scriptTarget');
        expect(backgroundSource).toContain('function uniqueScriptTargets(targets)');
        expect(backgroundSource).toContain('function deactivateMediaFrameMonitor()');
        expect(backgroundSource).toContain('func: deactivateMediaFrameMonitor');
        expect(backgroundSource).toContain('isMissingContentReceiverError(error)');
        expect(backgroundSource).toContain('await refreshCurrentMediaTarget(tabId, { queueIfRunning: true })');
        expect(backgroundSource).toContain("activation?.status === 'activation_in_progress'");
    });

    it('does not discard a selected tab when its media frame refresh is transiently unavailable', () => {
        const refreshFailureGuard = backgroundSource.slice(
            backgroundSource.indexOf('const isCurrentTargetRefresh'),
            backgroundSource.indexOf('currentTabId = null', backgroundSource.indexOf('const isCurrentTargetRefresh'))
        );
        expect(refreshFailureGuard).toContain('keeping the selected target for recovery');
        expect(refreshFailureGuard).not.toContain('currentTabId = null');

        const routeSource = backgroundSource.slice(
            backgroundSource.indexOf('async function _routeToContentInternal'),
            backgroundSource.indexOf('// --- Keep-Alive Mechanism ---')
        );
        expect(routeSource).toContain('keeping the selected target for recovery');
        expect(routeSource).not.toContain('clearTargetTabForIdle(tabId, targetGeneration)');
    });

    it('serializes content commands and coalesces target refreshes', () => {
        expect(backgroundSource).toContain('contentCommandQueue.catch(() => {}).then(deliver)');
        expect(backgroundSource).toContain('if (mediaTargetRefreshTask && mediaTargetRefreshTabId === selectedTabId)');
        expect(backgroundSource).toContain('if (queueIfRunning) mediaTargetRefreshDirty = true');
        expect(backgroundSource).toContain('&& pass < 2');
        expect(backgroundSource).toContain('const needsFollowup = mediaTargetRefreshDirty');
        expect(backgroundSource).not.toContain('Re-elect before every remote command');
        expect(backgroundSource).toContain('await sendMessageToContentTab(tabId');
    });

    it('tears down every persistent content-script resource', () => {
        expect(contentSource).toContain('function destroyContentScript()');
        expect(contentSource).toContain('observer.disconnect()');
        expect(contentSource).toContain('keepAlivePort.disconnect()');
        expect(contentSource).toContain('for (const video of [...attachedVideos]) detachVideoListeners(video);');
        expect(contentSource).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange)");
        expect(contentSource).toContain("window.removeEventListener('pagehide', handlePageHide)");
        expect(contentSource).toContain("window.removeEventListener('pageshow', handlePageShow)");
        expect(contentSource).toContain("window.removeEventListener('resize', handleMediaFrameResize)");
        expect(contentSource).toContain('chrome.storage.onChanged.removeListener(handleStorageChanged)');
        expect(contentSource).toContain('chrome.runtime.onMessage.removeListener(handleRuntimeMessage)');
        expect(contentSource).toContain('window.koalaSyncInjected = false');
    });

    it('stops the MAIN-world seek bridge when its target is deactivated', () => {
        expect(backgroundSource).toContain('const timelineInterval = setInterval');
        expect(backgroundSource).toContain('clearInterval(timelineInterval)');
        expect(backgroundSource).toContain("window.removeEventListener('message', handleBridgeMessage)");
        expect(contentSource).toContain("kind: 'destroy'");
    });

    it('self-cleans instead of throwing when an extension reload invalidates the context', () => {
        expect(contentSource).toContain('if (!chrome.runtime?.id)');
        expect(contentSource).toContain('destroyContentScript()');
        expect(contentSource).toContain('return chrome.runtime.sendMessage(message, callback) || Promise.resolve(undefined)');
        expect(contentSource).toContain('function handleVisibilityChange()');
    });

    it('suspends background work for bfcache and restores it without duplicate injection', () => {
        expect(contentSource).toContain('pageSuspended = true');
        expect(contentSource).toContain('if (destroyed || pageSuspended) return');
        expect(contentSource).toContain('if (!destroyed && !pageSuspended) scheduleLifecycleTimeout(connectKeepAlivePort, 1000)');
        expect(contentSource).toMatch(/function handlePageShow\(event\)[\s\S]*if \(!event\.persisted\) return;[\s\S]*pageSuspended = false/);
        expect(contentSource).toMatch(/function handlePageShow\(event\)[\s\S]*observer\.observe\(document\.documentElement[\s\S]*setupListeners\(\)[\s\S]*connectKeepAlivePort\(\)/);
    });
});
