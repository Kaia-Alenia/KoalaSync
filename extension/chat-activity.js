const ALLOWED_ACTIONS = new Set([
    'play',
    'pause',
    'seek',
    'force_sync_prepare',
    'force_sync_execute',
    'joined',
    'left'
]);

export function createChatActivityStore(limit = 100) {
    const maxEntries = Number.isInteger(limit) && limit > 0 ? limit : 100;
    let entries = [];

    function normalize(value) {
        if (!value || !ALLOWED_ACTIONS.has(value.action) || typeof value.senderId !== 'string' || !value.senderId) {
            return null;
        }
        const timestamp = Number(value.timestamp);
        if (!Number.isFinite(timestamp)) return null;
        const id = typeof value.id === 'string' && value.id
            ? value.id
            : `${value.action}:${value.senderId}:${timestamp}`;
        return {
            id,
            action: value.action,
            senderId: value.senderId,
            username: typeof value.username === 'string' ? value.username : '',
            timestamp
        };
    }

    return {
        add(value) {
            const entry = normalize(value);
            if (!entry || entries.some(candidate => candidate.id === entry.id)) return null;
            entries.push(entry);
            if (entries.length > maxEntries) entries = entries.slice(-maxEntries);
            return { ...entry };
        },
        clear() {
            entries = [];
        },
        restore(values) {
            entries = [];
            for (const value of Array.isArray(values) ? values : []) {
                const entry = normalize(value);
                if (!entry || entries.some(candidate => candidate.id === entry.id)) continue;
                entries.push(entry);
            }
            entries = entries.slice(-maxEntries);
        },
        snapshot() {
            return entries.map(entry => ({ ...entry }));
        }
    };
}
