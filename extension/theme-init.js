(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
    let mode = 'system';

    const normalize = value => ['system', 'dark', 'light'].includes(value) ? value : 'system';
    const apply = value => {
        mode = normalize(value);
        const light = mode === 'light' || (mode === 'system' && systemTheme.matches);
        document.documentElement.classList.toggle('theme-light', light);
        document.documentElement.dataset.theme = light ? 'light' : 'dark';
        document.documentElement.style.colorScheme = light ? 'light' : 'dark';
    };

    apply('system');
    window.koalaTheme = {
        getMode: () => mode,
        setMode: apply
    };

    systemTheme.addEventListener('change', () => {
        if (mode === 'system') apply('system');
    });

    if (!globalThis.chrome?.storage?.local) return;
    chrome.storage.local.get(['themeMode'], data => apply(data.themeMode));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.themeMode) apply(changes.themeMode.newValue);
    });
})();
