import { extractEpisodeId } from './episode-utils.js';

export const TITLE_PRIVACY_MODES = Object.freeze({
    FULL: 'full',
    EPISODE: 'episode',
    HIDDEN: 'hidden'
});

export function normalizeTitlePrivacyMode(mode) {
    return Object.values(TITLE_PRIVACY_MODES).includes(mode)
        ? mode
        : TITLE_PRIVACY_MODES.FULL;
}

export function normalizeSendTabTitle(sendTabTitle, legacyMode = TITLE_PRIVACY_MODES.FULL) {
    if (typeof sendTabTitle === 'boolean') return sendTabTitle;
    return normalizeTitlePrivacyMode(legacyMode) === TITLE_PRIVACY_MODES.FULL;
}

export function sanitizeTabTitle(title, sendTabTitle) {
    if (!sendTabTitle) return null;
    return typeof title === 'string' && title.length > 0 ? title : null;
}

export function sanitizeSharedTitle(title, mode) {
    const normalizedMode = normalizeTitlePrivacyMode(mode);
    if (normalizedMode === TITLE_PRIVACY_MODES.HIDDEN) return null;

    if (typeof title !== 'string' || title.length === 0) return null;
    if (normalizedMode === TITLE_PRIVACY_MODES.EPISODE) {
        return extractEpisodeId(title) || null;
    }
    return title;
}

export function applyTitlePrivacyToPayload(payload, mode, keys = ['mediaTitle', 'expectedTitle', 'title']) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const next = { ...source };
    keys.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(next, key)) {
            next[key] = sanitizeSharedTitle(next[key], mode);
        }
    });
    return next;
}
