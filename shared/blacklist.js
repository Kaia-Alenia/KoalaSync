/**
 * blacklist.js
 * 
 * ⚠️ WARNING: This is the SINGLE SOURCE OF TRUTH.
 * If you edit this file, you MUST run: node scripts/build-extension.cjs
 * to propagate changes to the extension and relay server.
 * 
 * Domains to be filtered out from the tab selection dropdown to reduce "noise".
 * These are typically sites that won't contain shareable video content.
 */
export const BLACKLIST_DOMAINS = [
    // Search Engines & Portals
    'google.com',
    'bing.com',
    'duckduckgo.com',
    'yahoo.com',
    'msn.com',
    'baidu.com',
    'yandex.ru',
    'ecosia.org',
    'startpage.com',
    'search.brave.com',
    'qwant.com',
    'you.com',
    'perplexity.ai',
    'ask.com',
    'search.yahoo.com',
    'swisscows.ch',
    'mojeek.com',

    // Mail Providers
    'mail.google.com',
    'gmail.com',
    'outlook.live.com',
    'outlook.office.com',
    'mail.yahoo.com',
    'gmx.net',
    'gmx.de',
    'gmx.com',
    'web.de',
    'protonmail.com',
    'proton.me',
    't-online.de',
    'posteo.de',
    'mailbox.org',
    'mail.de',
    'zoho.com',
    'fastmail.com',
    'tutanota.com',
    'mail.ru',

    // Cloud Storage & Documents
    'docs.google.com',
    'sheets.google.com',
    'slides.google.com',

    // Messengers
    'web.whatsapp.com',
    'web.telegram.org',
    'discord.com',
    'element.io',
    'app.slack.com',

    // Productivity & Project Management
    'atlassian.net',
    'trello.com',
    'notion.so',
    'monday.com',
    'asana.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stackoverflow.com',

    // Social Media & Forums
    'linkedin.com',
    'twitter.com',
    'x.com',
    'facebook.com',
    'instagram.com',
    'reddit.com',
    'quora.com',
    'threads.net',
    'bsky.app',
    'mastodon.social',
    'vk.com',
    'weibo.com',
    '9gag.com',
    'imgur.com',

    // E-Commerce
    'ebay.com',
    'aliexpress.com',
    'etsy.com',

    // Media Information & Reviews
    'rottentomatoes.com',
    'imdb.com',
    'thetvdb.com',
    'themoviedb.org',
    'letterboxd.com',
    'metacritic.com',
    'myanimelist.net',

    // Development & Utilities
    'koalastuff.net',
    'auth.koalastuff.net',
    'blog.koalastuff.net',
    'clicker.koalastuff.net',
    'cookies.koalastuff.net',
    'multibox.koalastuff.net',
    'snippets.koalastuff.net',
    'status.koalastuff.net',
    'sync.koalastuff.net',
    'timer.koalastuff.net',
    'zoom.us',
    'teams.microsoft.com',
    'meet.google.com',
    'chrome.google.com',

    // Music Streaming
    'music.youtube.com',
    'open.spotify.com',
    'soundcloud.com',
    'deezer.com',
    'tidal.com',

    // Knowledge & Blogs
    'wikipedia.org',
    'medium.com',
    'dev.to',
    'news.ycombinator.com',

    // Design & Creative Tools
    'figma.com',
    'canva.com',
    'miro.com',

    // Online IDEs & Hosting
    'vscode.dev',
    'replit.com',
    'codesandbox.io',
    'vercel.com',
    'netlify.com',

    // Social & Image Sharing
    'pinterest.com',
    'tumblr.com',

    // Language Learning
    'duolingo.com',
    'hellotalk.com',

    // Google Utilities
    'calendar.google.com',
    'keep.google.com',

    // Finance & Payments
    'paypal.com',
    'stripe.com',

    // Games & Idle Sites
    'milkywayidle.com',
    'melvoridle.com',
    'orteil.dashnet.org',
    'clickerheroes.com',
    'kongregate.com',
    'armorgames.com',
    'crazygames.com',
    'poki.com',
    'newgrounds.com',
    'krunker.io',
    'slither.io',
    'agar.io',
    'diep.io',
    'geoguessr.com',
    'chess.com',
    'lichess.org',
    'skribbl.io'
];

/**
 * Hosts KoalaSync supports through a site-specific player path. A broad parent
 * domain in the list (e.g. 'google.com') must not hide them from tab selection.
 * An exact entry for the host itself still filters it, so users stay in control.
 */
export const BLACKLIST_SUFFIX_EXCEPTIONS = [
    'drive.google.com'
];

/**
 * Legacy key (<= v3.0.x): held a full snapshot of the effective list, which
 * froze the shipped defaults at the moment the user first saved. Read once for
 * migration, then replaced by BLACKLIST_OVERRIDES_STORAGE_KEY.
 */
export const CUSTOM_BLACKLIST_STORAGE_KEY = 'customBlacklistDomains';

/**
 * Current key. Stores only the delta against the shipped list:
 * { removedDefaults: string[], addedDomains: string[] }
 * so newly shipped defaults reach existing users without touching the
 * defaults they removed or the domains they added themselves.
 */
export const BLACKLIST_OVERRIDES_STORAGE_KEY = 'blacklistOverrides';

export const MAX_BLACKLIST_DOMAINS = 500;

export const BLACKLIST_SOURCE_DEFAULT = 'default';
export const BLACKLIST_SOURCE_USER = 'user';

/** Lines starting with this marker are editor notes, not domains. */
export const BLACKLIST_COMMENT_PREFIX = '#';

/**
 * Normalize a user-entered domain or URL to a hostname.
 * Returns null when the value cannot safely be used as a hostname filter.
 */
export function normalizeBlacklistDomain(value) {
    if (typeof value !== 'string') return null;
    const input = value.trim().toLowerCase();
    if (!input) return '';

    try {
        const parsed = new URL(input.includes('://') ? input : `https://${input}`);
        const hostname = parsed.hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
        if (!hostname || hostname.length > 253) return null;

        const labels = hostname.split('.');
        const valid = labels.every(label => (
            label.length > 0
            && label.length <= 63
            && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
        ));
        return valid ? hostname : null;
    } catch {
        return null;
    }
}

export function parseBlacklistDomains(value) {
    const entries = Array.isArray(value)
        ? value
        : String(value ?? '').split(/\r?\n/);
    const domains = [];
    const invalid = [];
    const seen = new Set();

    for (const entry of entries) {
        if (typeof entry === 'string' && entry.trim().startsWith(BLACKLIST_COMMENT_PREFIX)) continue;
        const normalized = normalizeBlacklistDomain(entry);
        if (normalized === '') continue;
        if (normalized === null) {
            invalid.push(String(entry).trim());
            continue;
        }
        if (!seen.has(normalized)) {
            seen.add(normalized);
            domains.push(normalized);
        }
    }

    return { domains, invalid };
}

export function createEmptyBlacklistOverrides() {
    return { removedDefaults: [], addedDomains: [] };
}

export function normalizeBlacklistOverrides(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createEmptyBlacklistOverrides();

    const addedDomains = parseBlacklistDomains(Array.isArray(raw.addedDomains) ? raw.addedDomains : []).domains;
    const added = new Set(addedDomains);
    // A domain cannot be removed and added at the same time; the addition wins
    // so a re-added default is never filtered out by a stale removal entry.
    const removedDefaults = parseBlacklistDomains(Array.isArray(raw.removedDefaults) ? raw.removedDefaults : [])
        .domains.filter(domain => !added.has(domain));

    return { removedDefaults, addedDomains };
}

/**
 * Turn a fully edited list back into a delta.
 *
 * `previous` keeps an explicit user addition tagged as such even after the same
 * domain later ships as a default, so dropping it from the defaults does not
 * silently drop it from that user's list.
 */
export function deriveBlacklistOverrides(submittedDomains, previous = null) {
    const { domains } = parseBlacklistDomains(submittedDomains);
    const kept = new Set(domains);
    const shipped = new Set(BLACKLIST_DOMAINS);
    const previouslyAdded = new Set(normalizeBlacklistOverrides(previous).addedDomains);

    return {
        removedDefaults: BLACKLIST_DOMAINS.filter(domain => !kept.has(domain)),
        addedDomains: domains.filter(domain => !shipped.has(domain) || previouslyAdded.has(domain))
    };
}

/**
 * Accepts the current delta object, a legacy full-list array, or nothing.
 */
export function toBlacklistOverrides(stored) {
    if (Array.isArray(stored)) return deriveBlacklistOverrides(stored);
    if (stored && typeof stored === 'object') return normalizeBlacklistOverrides(stored);
    return createEmptyBlacklistOverrides();
}

export function getEffectiveBlacklistDomains(stored) {
    const { removedDefaults, addedDomains } = toBlacklistOverrides(stored);
    const removed = new Set(removedDefaults);
    const domains = [];
    const seen = new Set();

    for (const domain of BLACKLIST_DOMAINS) {
        if (removed.has(domain) || seen.has(domain)) continue;
        seen.add(domain);
        domains.push(domain);
    }
    for (const domain of addedDomains) {
        if (seen.has(domain)) continue;
        seen.add(domain);
        domains.push(domain);
    }

    return domains.slice(0, MAX_BLACKLIST_DOMAINS);
}

/**
 * The effective list tagged by origin, for an editor that shows the user which
 * entries are theirs and which arrive with the extension.
 */
export function getBlacklistEntries(stored) {
    const added = new Set(toBlacklistOverrides(stored).addedDomains);
    return getEffectiveBlacklistDomains(stored).map(domain => ({
        domain,
        source: added.has(domain) ? BLACKLIST_SOURCE_USER : BLACKLIST_SOURCE_DEFAULT
    }));
}

export function isUrlBlacklisted(rawUrl, domains = BLACKLIST_DOMAINS) {
    if (typeof rawUrl !== 'string' || !rawUrl) return false;
    let hostname;
    try {
        hostname = new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, '');
    } catch {
        return false;
    }

    return domains.some(domain => {
        if (hostname === domain) return true;
        if (!hostname.endsWith(`.${domain}`)) return false;
        return !BLACKLIST_SUFFIX_EXCEPTIONS.includes(hostname);
    });
}
