(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
    let mode = 'system';
    let palette = 'eucalyptus';

    const normalize = value => ['system', 'dark', 'light'].includes(value) ? value : 'system';
    const normalizePalette = value => ['eucalyptus', 'cyber', 'graphite'].includes(value) ? value : 'eucalyptus';

    const apply = value => {
        mode = normalize(value);
        const light = mode === 'light' || (mode === 'system' && systemTheme.matches);
        document.documentElement.classList.toggle('theme-light', light);
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    };

    const applyPalette = value => {
        palette = normalizePalette(value);
        document.documentElement.dataset.palette = palette;
    };

    apply('system');
    applyPalette('eucalyptus');
    window.koalaTheme = {
        getMode: () => mode,
        setMode: apply,
        getPalette: () => palette,
        setPalette: applyPalette
    };

    systemTheme.addEventListener('change', () => {
        if (mode === 'system') apply('system');
    });

    if (!globalThis.chrome?.storage?.local) return;
    chrome.storage.local.get(['themeMode', 'themePalette'], data => {
        apply(data.themeMode);
        applyPalette(data.themePalette);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.themeMode) apply(changes.themeMode.newValue);
        if (changes.themePalette) applyPalette(changes.themePalette.newValue);
    });
})();
