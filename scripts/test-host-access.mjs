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

assert.match(background, /await activateTargetTab\(message\.tabId, message\.tabTitle\)/,
    'SET_TARGET_TAB must await successful activation before acknowledging it');
assert.match(background, /addTabHostAccessRequest\(chrome, tabId, access\.originPattern\)/,
    'failed injection must register Chrome host-access request');
assert.match(background, /retryPendingTarget\(\)/,
    'pending target must resume after the user grants access');
assert.match(background, /activationGeneration !== targetActivationGeneration/,
    'stale concurrent tab activations must not overwrite the newest selection');
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
assert.match(popupHtml, /id="siteAccessNotice"/,
    'popup must contain a persistent site-access notice');

console.log('host access recovery tests passed');
