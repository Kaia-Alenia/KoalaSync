import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import {
    HOST_ACCESS_REQUIRED_STATUS,
    addTabHostAccessRequest,
    describeTabUrl,
    inspectTabHostAccess,
    isHostAccessError,
    normalizeTabId,
    removeTabHostAccessRequest,
    requestOriginPermission
} from '../extension/host-access.js';

assert.equal(HOST_ACCESS_REQUIRED_STATUS, 'host_permission_required');
assert.equal(normalizeTabId(null), null);
assert.equal(normalizeTabId(undefined), null);
assert.equal(normalizeTabId(''), null);
assert.equal(normalizeTabId(0), null);
assert.equal(normalizeTabId('42'), 42);
assert.equal(normalizeTabId(true), null);
assert.equal(normalizeTabId([42]), null);
assert.equal(normalizeTabId('42.5'), null);
assert.equal(normalizeTabId(' 42 '), 42);
assert.equal(normalizeTabId(Number.MAX_SAFE_INTEGER + 1), null);
assert.deepEqual(describeTabUrl('https://emby.example:8443/web/index.html'), {
    url: 'https://emby.example:8443/web/index.html',
    host: 'emby.example:8443',
    originPattern: 'https://emby.example:8443/*'
});
assert.deepEqual(describeTabUrl('http://localhost:8096/web/'), {
    url: 'http://localhost:8096/web/',
    host: 'localhost:8096',
    originPattern: 'http://localhost:8096/*'
});
assert.deepEqual(describeTabUrl('http://localhost:8096/web/', { includePort: false }), {
    url: 'http://localhost:8096/web/',
    host: 'localhost:8096',
    originPattern: 'http://localhost/*'
});
assert.equal(describeTabUrl('chrome://extensions/'), null);
assert.equal(describeTabUrl('not a url'), null);

let containsRequest = null;
const deniedChrome = {
    tabs: {
        get: async tabId => ({ id: tabId, url: 'https://video.example/watch' })
    },
    permissions: {
        contains: async request => {
            containsRequest = request;
            return false;
        }
    }
};
const access = await inspectTabHostAccess(deniedChrome, 42);
assert.equal(access.granted, false);
assert.equal(access.host, 'video.example');
assert.deepEqual(containsRequest, { origins: ['https://video.example/*'] });

let firefoxContainsRequest = null;
const firefoxChrome = {
    runtime: { getBrowserInfo: async () => ({ name: 'Firefox' }) },
    tabs: {
        get: async tabId => ({
            id: tabId,
            url: 'http://localhost:8096/web/',
            pendingUrl: 'https://different.example/loading'
        })
    },
    permissions: {
        contains: async request => {
            firefoxContainsRequest = request;
            return false;
        }
    }
};
const firefoxAccess = await inspectTabHostAccess(firefoxChrome, 42);
assert.equal(firefoxAccess.host, 'localhost:8096');
assert.equal(firefoxAccess.originPattern, 'http://localhost/*');
assert.deepEqual(firefoxContainsRequest, { origins: ['http://localhost/*'] });

const unknownPermissionChrome = {
    runtime: {},
    tabs: {
        get: async tabId => ({ id: tabId, url: 'https://video.example/watch' })
    },
    permissions: {
        contains: (_request, callback) => { callback(undefined); }
    }
};
assert.equal((await inspectTabHostAccess(unknownPermissionChrome, 42)).granted, null);

let requestedTabId = null;
const requestChrome = {
    permissions: {
        addHostAccessRequest: async request => { requestedTabId = request; }
    }
};
assert.equal(await addTabHostAccessRequest(requestChrome, 42, 'https://video.example/*'), true);
assert.deepEqual(requestedTabId, { tabId: 42, pattern: 'https://video.example/*' });
assert.equal(await addTabHostAccessRequest({ permissions: {} }, 42), false);

let removedTabId = null;
const removeRequestChrome = {
    permissions: {
        removeHostAccessRequest: async request => { removedTabId = request; }
    }
};
assert.equal(await removeTabHostAccessRequest(removeRequestChrome, 42, 'https://video.example/*'), true);
assert.deepEqual(removedTabId, { tabId: 42, pattern: 'https://video.example/*' });
assert.equal(await removeTabHostAccessRequest({ permissions: {} }, 42), false);

assert.equal(isHostAccessError(new Error('Missing host permission for the tab')), true);
assert.equal(isHostAccessError(new Error('No tab with id: 42')), false);
const callbackPermissionChrome = {
    runtime: {},
    permissions: {
        request: (_request, callback) => { callback(true); }
    }
};
assert.equal(await requestOriginPermission(callbackPermissionChrome, 'https://video.example/*'), true);
assert.equal(await requestOriginPermission({ permissions: {} }, 'https://video.example/*'), null);

const background = fs.readFileSync(path.join(cwd(), 'extension', 'background.js'), 'utf8');
const popup = fs.readFileSync(path.join(cwd(), 'extension', 'popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(cwd(), 'extension', 'popup.html'), 'utf8');
const tabManager = fs.readFileSync(path.join(cwd(), 'extension', 'modules', 'tab-manager.js'), 'utf8');

assert.match(background, /await activateTargetTab\((?:message\.tabId|selectedTabId), message\.tabTitle\)/,
    'SET_TARGET_TAB must await successful activation before acknowledging it');
assert.match(background, /addTabHostAccessRequest\(chrome, tabId, access\.originPattern\)/,
    'failed injection must register Chrome host-access request');
assert.match(background, /retryPendingTarget\(\)/,
    'pending target must resume after the user grants access');
assert.match(background, /activationGeneration !== targetActivationGeneration/,
    'stale concurrent tab activations must not overwrite the newest selection');
assert.match(background, /pendingTargetRequestId/,
    'pending access recovery must use an identity token');
assert.match(background, /addedOrigins\.includes\(pending\.originPattern\)/,
    'unrelated permission grants must not activate a pending target');
assert.match(background, /isCurrentTargetIdentity\(tabId, targetGeneration\)/,
    'stale content-routing retries must not reactivate an old target');
assert.match(background, /message\.expectedTabId/,
    'popup playback events must be rejected after their target changes');
assert.match(background, /completeForceSyncBeforeTargetChange\(selectedTabId\)/,
    'a target switch must finish an in-flight force sync on the old target');
assert.match(background, /FORCE_SYNC_ACK'[\s\S]*ignored_unselected_tab/,
    'stale content scripts must not acknowledge force sync for a new target');
const activateTargetBody = background.slice(
    background.indexOf('async function activateTargetTab'),
    background.indexOf('async function retryPendingTarget')
);
assert.ok(
    activateTargetBody.indexOf('await injectContentScript') < activateTargetBody.indexOf('currentTabId = selectedTabId'),
    'a tab must not become current until its content script injection succeeds'
);
assert.match(background, /removeTabHostAccessRequest\([\s\S]*pendingTabId/,
    'clearing a pending target must also clear Chrome toolbar access requests');
assert.match(popup, /response\?\.status === 'host_permission_required'/,
    'popup must render the structured host-access failure');
assert.match(popup, /requestOriginPermission\(chrome, requestedOriginPattern\)/,
    'retry button must request withheld host access directly');
assert.match(popup, /expectedCurrentTabId: tabId/,
    'manual reinjection must be tied to the selected target identity');
assert.match(popup, /expectedTabId: tabId/,
    'force sync must be tied to the tab whose time was sampled');
assert.doesNotMatch(tabManager, /injectContentScript/,
    'tab reload recovery must use the guarded background activation path');
assert.equal(
    (background.match(/tabs\.onRemoved\.addListener/g) || []).length
        + (tabManager.match(/tabs\.onRemoved\.addListener/g) || []).length,
    1,
    'target-tab closure must have exactly one state owner'
);
assert.match(popupHtml, /id="siteAccessNotice"/,
    'popup must contain a persistent site-access notice');

console.log('host access recovery tests passed');
