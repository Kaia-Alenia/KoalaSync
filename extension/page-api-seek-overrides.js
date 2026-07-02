(function(root) {
    const PAGE_API_SEEK_PROVIDERS = [
        { domain: 'netflix.com', provider: 'netflix' } // Avoids M7375 when seeking via video.currentTime.
    ];

    function normalizeHost(input) {
        try {
            return new URL(input).hostname.toLowerCase();
        } catch (_e) {
            return String(input || '').toLowerCase();
        }
    }

    function matchesDomain(host, domain) {
        return host === domain || host.endsWith(`.${domain}`);
    }

    root.KOALA_PAGE_API_SEEK_PROVIDERS = PAGE_API_SEEK_PROVIDERS;
    root.koalaFindPageApiSeekProvider = (input) => {
        const host = normalizeHost(input);
        return PAGE_API_SEEK_PROVIDERS.find(entry => matchesDomain(host, entry.domain)) || null;
    };
})(globalThis);
