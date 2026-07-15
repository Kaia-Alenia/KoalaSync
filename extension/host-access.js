export const HOST_ACCESS_REQUIRED_STATUS = 'host_permission_required';

export function normalizeTabId(value) {
    if (value === null || value === undefined || value === '') return null;
    const tabId = Number(value);
    return Number.isInteger(tabId) && tabId > 0 ? tabId : null;
}

export function describeTabUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl) return null;

    try {
        const url = new URL(rawUrl);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return {
                url: rawUrl,
                host: url.host,
                originPattern: `${url.origin}/*`
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
    const descriptor = describeTabUrl(tab?.url || '');
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
        const granted = await chromeApi.permissions.contains({
            origins: [descriptor.originPattern]
        });
        return { tab, ...descriptor, granted: granted === true };
    } catch (_e) {
        // Permission inspection is advisory. The actual script injection below
        // remains the source of truth, including temporary activeTab access.
        return { tab, ...descriptor, granted: null };
    }
}

export async function addTabHostAccessRequest(chromeApi, tabId) {
    if (typeof chromeApi.permissions?.addHostAccessRequest !== 'function') {
        return false;
    }

    try {
        await chromeApi.permissions.addHostAccessRequest({ tabId });
        return true;
    } catch (_e) {
        return false;
    }
}

export async function removeTabHostAccessRequest(chromeApi, tabId) {
    if (typeof chromeApi.permissions?.removeHostAccessRequest !== 'function') {
        return false;
    }

    try {
        await chromeApi.permissions.removeHostAccessRequest({ tabId });
        return true;
    } catch (_e) {
        return false;
    }
}
