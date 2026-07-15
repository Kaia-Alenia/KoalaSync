export const HOST_ACCESS_REQUIRED_STATUS = 'host_permission_required';

export function normalizeTabId(value) {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? value : null;
    }
    if (typeof value !== 'string') return null;

    const normalized = value.trim();
    if (!/^[1-9]\d*$/.test(normalized)) return null;
    const tabId = Number(normalized);
    return Number.isSafeInteger(tabId) ? tabId : null;
}

function browserSupportsPortMatchPatterns(chromeApi) {
    // runtime.getBrowserInfo is a Firefox-only WebExtension API. Firefox does
    // not accept ports in match patterns, while Chromium does.
    return typeof chromeApi?.runtime?.getBrowserInfo !== 'function';
}

export function describeTabUrl(rawUrl, { includePort = true } = {}) {
    if (typeof rawUrl !== 'string' || !rawUrl) return null;

    try {
        const url = new URL(rawUrl);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            const permissionHost = includePort ? url.host : url.hostname;
            return {
                url: rawUrl,
                host: url.host,
                originPattern: `${url.protocol}//${permissionHost}/*`
            };
        }
        if (url.protocol === 'file:') {
            return {
                url: rawUrl,
                host: 'local file',
                originPattern: 'file:///*'
            };
        }
    } catch (_e) {
        // Invalid and browser-internal URLs cannot receive host access.
    }

    return null;
}

export async function inspectTabHostAccess(chromeApi, tabId) {
    const tab = await chromeApi.tabs.get(tabId);
    // executeScript targets the committed document. pendingUrl may already point
    // at another origin while tab.url is still the document being injected into.
    const descriptor = describeTabUrl(tab?.url || tab?.pendingUrl || '', {
        includePort: browserSupportsPortMatchPatterns(chromeApi)
    });
    if (!descriptor) {
        return {
            tab,
            url: tab?.url || '',
            host: null,
            originPattern: null,
            granted: null
        };
    }

    if (typeof chromeApi.permissions?.contains !== 'function') {
        return { tab, ...descriptor, granted: null };
    }

    try {
        const granted = await callBooleanPermissionMethod(
            chromeApi,
            'contains',
            { origins: [descriptor.originPattern] },
            { timeoutMs: 1000 }
        );
        return {
            tab,
            ...descriptor,
            granted: granted === null ? null : granted === true
        };
    } catch (_e) {
        // Permission inspection is advisory. The actual script injection below
        // remains the source of truth, including temporary activeTab access.
        return { tab, ...descriptor, granted: null };
    }
}

function callBooleanPermissionMethod(chromeApi, methodName, request, { timeoutMs = null } = {}) {
    const method = chromeApi.permissions?.[methodName];
    if (typeof method !== 'function') return Promise.resolve(null);

    return new Promise((resolve, reject) => {
        let settled = false;
        let timeout = null;
        const clearSettlementTimeout = () => {
            if (timeout !== null) {
                clearTimeout(timeout);
                timeout = null;
            }
        };
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearSettlementTimeout();
            resolve(value === true ? true : value === false ? false : null);
        };
        const fail = (error) => {
            if (settled) return;
            settled = true;
            clearSettlementTimeout();
            reject(error instanceof Error ? error : new Error(String(error || 'Permission request failed')));
        };
        const callback = (value) => {
            const lastError = chromeApi.runtime?.lastError;
            if (lastError) {
                fail(new Error(lastError.message || String(lastError)));
                return;
            }
            finish(value);
        };

        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
            timeout = setTimeout(() => finish(null), timeoutMs);
        }

        try {
            const result = method.call(chromeApi.permissions, request, callback);
            if (result && typeof result.then === 'function') {
                result.then(finish, fail);
            } else if (typeof result === 'boolean') {
                finish(result);
            }
            // Callback-based Chromium/Firefox APIs return undefined and settle
            // through callback. Promise-based implementations settle above.
        } catch (error) {
            fail(error);
        }
    });
}

export function requestOriginPermission(chromeApi, originPattern) {
    if (typeof originPattern !== 'string' || !originPattern) {
        return Promise.resolve(null);
    }
    return callBooleanPermissionMethod(
        chromeApi,
        'request',
        { origins: [originPattern] },
        { timeoutMs: 60000 }
    ).catch(() => false);
}

export function isHostAccessError(error) {
    const message = typeof error?.message === 'string' ? error.message : String(error || '');
    return /host permission|permission to access (?:this|the|respective) host|cannot access contents of/i.test(message);
}

function hostAccessRequestDetails(tabId, originPattern) {
    const request = { tabId };
    if (typeof originPattern === 'string' && originPattern) {
        request.pattern = originPattern;
    }
    return request;
}

export async function addTabHostAccessRequest(chromeApi, tabId, originPattern = null) {
    if (typeof chromeApi.permissions?.addHostAccessRequest !== 'function') {
        return false;
    }

    try {
        await chromeApi.permissions.addHostAccessRequest(
            hostAccessRequestDetails(tabId, originPattern)
        );
        return true;
    } catch (_e) {
        return false;
    }
}

export async function removeTabHostAccessRequest(chromeApi, tabId, originPattern = null) {
    if (typeof chromeApi.permissions?.removeHostAccessRequest !== 'function') {
        return false;
    }

    try {
        await chromeApi.permissions.removeHostAccessRequest(
            hostAccessRequestDetails(tabId, originPattern)
        );
        return true;
    } catch (_e) {
        return false;
    }
}
