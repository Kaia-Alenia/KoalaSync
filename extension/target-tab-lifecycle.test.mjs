import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const backgroundSource = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8');
const contentSource = fs.readFileSync(path.join(extensionDir, 'content.js'), 'utf8');
const overlaySource = fs.readFileSync(path.join(extensionDir, 'chat-overlay.js'), 'utf8');

describe('target tab lifecycle', () => {
    it('injects playback and chat scripts only into the explicitly selected tab', () => {
        expect(backgroundSource).not.toContain('chrome.tabs.onActivated');
        expect(backgroundSource).not.toContain('chrome.tabs.query({})');
        expect(backgroundSource).toContain("target: { tabId }");
        expect(backgroundSource).toContain("files: ['chat-format.js', 'chat-overlay.js', 'content.js']");
        expect(backgroundSource).toContain("chrome.tabs.query({ url: 'https://sync.koalastuff.net/*' })");

        const activationStart = backgroundSource.indexOf('async function activateTargetTab');
        const activationEnd = backgroundSource.indexOf('async function reactivateCurrentTarget', activationStart);
        const activationSource = backgroundSource.slice(activationStart, activationEnd);
        expect(activationSource.indexOf('await deactivateTargetTab(previousTabId)'))
            .toBeLessThan(activationSource.indexOf('await injectContentScript(selectedTabId'));
        expect(activationSource).toContain('previousTabId !== selectedTabId');
        expect(contentSource).toContain('if (window.koalaSyncInjected && chrome.runtime.id)');
        expect(overlaySource).toContain('if (window.koalaSyncChatOverlay?.refresh)');
    });

    it('fully deactivates old and superseded target injections', () => {
        expect(backgroundSource).toContain("chrome.tabs.sendMessage(normalizedTabId, { type: 'TARGET_DEACTIVATE' })");
        expect(backgroundSource.match(/await deactivateTargetTab\(selectedTabId\)/g)?.length).toBeGreaterThanOrEqual(4);
        expect(contentSource).toContain("if (message.type === 'TARGET_DEACTIVATE')");
        expect(overlaySource).toContain("message?.type === 'TARGET_DEACTIVATE'");
    });

    it('tears down every persistent content-script resource', () => {
        expect(contentSource).toContain('function destroyContentScript()');
        expect(contentSource).toContain('observer.disconnect()');
        expect(contentSource).toContain('keepAlivePort.disconnect()');
        expect(contentSource).toContain('for (const video of attachedVideos)');
        expect(contentSource).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange)");
        expect(contentSource).toContain("window.removeEventListener('pagehide', handlePageHide)");
        expect(contentSource).toContain("window.removeEventListener('pageshow', handlePageShow)");
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
