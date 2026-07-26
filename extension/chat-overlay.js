(function initKoalaSyncChatOverlay() {
    if (window.koalaSyncChatOverlay?.refresh) {
        window.koalaSyncChatOverlay.refresh();
        return;
    }

    const MAX_MESSAGES = 200;
    const MIN_WIDTH = 300;
    const MIN_HEIGHT = 320;
    const DEFAULT_WIDTH = 360;
    const DEFAULT_HEIGHT = 520;
    const SIZE_PRESETS = Object.freeze({
        compact: Object.freeze({ width: 320, height: 400 }),
        standard: Object.freeze({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }),
        large: Object.freeze({ width: 440, height: 640 })
    });
    const storageKey = `chatOverlayLayout:${location.origin}`;
    const systemTheme = window.matchMedia('(prefers-color-scheme: light)');
    let context = null;
    let opened = false;
    let destroyed = false;
    let saveTimer = null;
    let applyingLayout = false;
    let preferencesLoaded = false;
    let startStateApplied = false;
    let refreshGeneration = 0;
    let sendGeneration = 0;
    let sending = false;
    let layout = {
        mode: 'right',
        x: 24,
        y: 72,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        customWidth: DEFAULT_WIDTH,
        customHeight: DEFAULT_HEIGHT,
        detachedInitialized: false
    };
    let chatPosition = 'right';
    let chatSize = 'standard';
    let chatStartMode = 'bubble';
    let themeMode = 'system';
    let themePalette = 'eucalyptus';

    const host = document.createElement('div');
    host.id = 'koalasync-chat-overlay-host';
    host.style.cssText = 'all:initial;display:none;position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:layout style paint;transform:translateZ(0);';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
        :host { all: initial; }
        * { box-sizing: border-box; }
        #app {
            --bg: oklch(0.205 0.025 155); --card: oklch(0.30 0.035 150);
            --surface-alt: oklch(0.265 0.032 150); --surface-deep: oklch(0.205 0.025 155);
            --accent: oklch(0.73 0.13 155); --accent-hover: oklch(0.79 0.12 155);
            --text: oklch(0.96 0.01 90); --text-muted: oklch(0.78 0.02 90);
            --border-soft: oklch(0.88 0.025 145 / 0.09); --border-strong: oklch(0.39 0.038 145);
            --text-on-green: oklch(0.14 0.02 90); --danger: oklch(0.63 0.18 25);
            position: fixed; inset: 0; pointer-events: none; color: var(--text);
            font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        #app[data-theme="light"] {
            --bg: oklch(0.935 0.018 110); --card: oklch(0.995 0.006 100);
            --surface-alt: oklch(0.91 0.022 115); --surface-deep: oklch(0.935 0.018 110);
            --accent: oklch(0.52 0.13 155); --accent-hover: oklch(0.45 0.12 155);
            --text: oklch(0.21 0.03 140); --text-muted: oklch(0.43 0.03 135);
            --border-soft: oklch(0.28 0.035 140 / 0.10); --border-strong: oklch(0.73 0.035 125);
            --text-on-green: oklch(0.16 0.03 140);
        }
        #app[data-palette="cyber"] {
            --bg: oklch(0.185 0.04 265); --card: oklch(0.285 0.05 265);
            --surface-alt: oklch(0.25 0.048 265); --surface-deep: oklch(0.185 0.04 265);
            --accent: oklch(0.59 0.20 275); --accent-hover: oklch(0.69 0.17 275);
            --text: oklch(0.97 0.012 265); --text-muted: oklch(0.74 0.03 265);
            --border-soft: oklch(0.9 0.03 265 / 0.10); --border-strong: oklch(0.42 0.05 265);
            --text-on-green: oklch(0.99 0.006 275);
        }
        #app[data-palette="cyber"][data-theme="light"] {
            --bg: oklch(0.945 0.014 265); --card: oklch(0.995 0.005 265);
            --surface-alt: oklch(0.915 0.02 265); --surface-deep: oklch(0.945 0.014 265);
            --accent: oklch(0.53 0.21 275); --accent-hover: oklch(0.46 0.20 275);
            --text: oklch(0.26 0.05 265); --text-muted: oklch(0.48 0.045 265);
            --border-soft: oklch(0.30 0.05 265 / 0.12); --border-strong: oklch(0.79 0.03 265);
            --text-on-green: oklch(0.99 0.005 275);
        }
        #app[data-palette="graphite"] {
            --bg: oklch(0.165 0.004 260); --card: oklch(0.255 0.005 260);
            --surface-alt: oklch(0.225 0.005 260); --surface-deep: oklch(0.165 0.004 260);
            --accent: oklch(0.93 0.006 260); --accent-hover: oklch(0.99 0.003 260);
            --text: oklch(0.97 0.003 260); --text-muted: oklch(0.72 0.005 260);
            --border-soft: oklch(0.92 0.008 260 / 0.11); --border-strong: oklch(0.42 0.006 260);
            --text-on-green: oklch(0.20 0.004 260);
        }
        #app[data-palette="graphite"][data-theme="light"] {
            --bg: oklch(0.928 0.003 260); --card: oklch(1 0 0);
            --surface-alt: oklch(0.90 0.004 260); --surface-deep: oklch(0.928 0.003 260);
            --accent: oklch(0.28 0.006 260); --accent-hover: oklch(0.18 0.005 260);
            --text: oklch(0.22 0.005 260); --text-muted: oklch(0.46 0.006 260);
            --border-soft: oklch(0.20 0.006 260 / 0.13); --border-strong: oklch(0.77 0.004 260);
            --text-on-green: oklch(0.98 0.002 260);
        }
        button, textarea { font: inherit; }
        button { color: inherit; }
        .launcher {
            position: fixed; width: 48px; height: 48px; border: 1px solid var(--border-strong);
            border-radius: 16px; background: var(--card); color: var(--text); cursor: pointer;
            pointer-events: auto; box-shadow: 0 10px 28px rgb(0 0 0 / .32); font-size: 22px;
        }
        .launcher:hover:not([aria-disabled="true"]) { border-color: var(--accent); transform: translateY(-1px); }
        .launcher[aria-disabled="true"] { cursor: not-allowed; opacity: .58; }
        .panel {
            position: fixed; display: none; flex-direction: column; overflow: hidden;
            min-width: min(${MIN_WIDTH}px, calc(100vw - 16px)); min-height: min(${MIN_HEIGHT}px, calc(100vh - 16px)); max-width: calc(100vw - 16px);
            max-height: calc(100vh - 16px); pointer-events: auto; color: var(--text);
            background: var(--card); border: 1px solid var(--border-strong); border-radius: 18px;
            box-shadow: 0 18px 55px rgb(0 0 0 / .38); transform: translateZ(0);
        }
        .panel.open { display: flex; }
        .header { display: flex; align-items: center; gap: 10px; padding: 12px; border-bottom: 1px solid var(--border-soft); user-select: none; }
        .header.detached { cursor: move; }
        .heading { min-width: 0; flex: 1; }
        .title { font-size: 14px; font-weight: 760; }
        .subtitle { color: var(--text-muted); font-size: 11px; }
        .modes { display: flex; gap: 4px; }
        .icon-button { width: 30px; height: 30px; border: 1px solid var(--border-soft); border-radius: 9px; background: var(--surface-alt); cursor: pointer; }
        .icon-button:hover, .icon-button.active { border-color: var(--accent); color: var(--accent); }
        .messages { flex: 1; min-height: 0; overflow-y: auto; padding: 12px; background: var(--bg); overscroll-behavior: contain; }
        .empty { color: var(--text-muted); text-align: center; padding: 32px 12px; font-size: 12px; }
        .message { margin-bottom: 11px; overflow-wrap: anywhere; }
        .meta { display: flex; align-items: baseline; gap: 7px; margin-bottom: 2px; }
        .sender { color: var(--accent); font-weight: 700; font-size: 12px; }
        .time { color: var(--text-muted); font-size: 10px; }
        .body { white-space: pre-wrap; color: var(--text); }
        .composer { padding: 10px; border-top: 1px solid var(--border-soft); background: var(--card); }
        textarea { width: 100%; min-height: 62px; max-height: 132px; resize: vertical; border: 1px solid var(--border-strong); border-radius: 11px; padding: 9px; background: var(--surface-deep); color: var(--text); outline: none; }
        textarea:focus { border-color: var(--accent); }
        textarea::placeholder { color: var(--text-muted); }
        .composer-row { display: flex; align-items: center; gap: 8px; margin-top: 7px; }
        .count { flex: 1; color: var(--text-muted); font-size: 10px; }
        .status { color: var(--danger); font-size: 10px; min-height: 14px; }
        .send { border: 0; border-radius: 10px; padding: 8px 13px; background: var(--accent); color: var(--text-on-green); font-weight: 750; cursor: pointer; }
        .send:hover:not(:disabled) { background: var(--accent-hover); }
        .send:disabled { opacity: .55; cursor: wait; }
        .visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
        @media (max-width: 520px) { .panel { max-width: calc(100vw - 12px); } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
    `;

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    const app = element('div');
    app.id = 'app';
    const launcher = element('button', 'launcher', '💬');
    launcher.type = 'button';
    const launcherHint = element('span', 'visually-hidden');
    launcherHint.id = 'chat-launcher-hint';
    const panel = element('section', 'panel');
    panel.setAttribute('role', 'dialog');
    const header = element('header', 'header');
    const heading = element('div', 'heading');
    const title = element('div', 'title');
    const subtitle = element('div', 'subtitle');
    heading.append(title, subtitle);
    const modes = element('div', 'modes');
    const leftButton = element('button', 'icon-button', '←');
    const detachedButton = element('button', 'icon-button', '↗');
    const rightButton = element('button', 'icon-button', '→');
    const closeButton = element('button', 'icon-button', '×');
    for (const button of [leftButton, detachedButton, rightButton, closeButton]) button.type = 'button';
    modes.append(leftButton, detachedButton, rightButton, closeButton);
    header.append(heading, modes);
    const messages = element('div', 'messages');
    messages.setAttribute('aria-live', 'polite');
    const empty = element('div', 'empty');
    messages.append(empty);
    const composer = element('form', 'composer');
    const textareaLabel = element('label', 'visually-hidden');
    textareaLabel.htmlFor = 'chat-composer-input';
    const textarea = element('textarea');
    textarea.id = 'chat-composer-input';
    textarea.setAttribute('aria-describedby', 'chat-composer-count chat-composer-status');
    const composerRow = element('div', 'composer-row');
    const count = element('span', 'count', '0/500');
    count.id = 'chat-composer-count';
    const sendButton = element('button', 'send');
    sendButton.type = 'submit';
    composerRow.append(count, sendButton);
    const status = element('div', 'status');
    status.id = 'chat-composer-status';
    status.setAttribute('role', 'status');
    composer.append(textareaLabel, textarea, composerRow, status);
    panel.append(header, messages, composer);
    app.append(launcherHint, launcher, panel);
    shadow.append(style, app);
    document.documentElement.append(host);

    function messageRuntime(payload, timeoutMs = 5000) {
        return new Promise(resolve => {
            let settled = false;
            const finish = response => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(response || null);
            };
            const timeout = setTimeout(() => finish(null), timeoutMs);
            try {
                chrome.runtime.sendMessage(payload, response => {
                    if (chrome.runtime.lastError) finish(null);
                    else finish(response);
                });
            } catch (_) {
                finish(null);
            }
        });
    }

    function strings() {
        return context?.strings || {};
    }

    function applyStrings() {
        const text = strings();
        title.textContent = text.title || '';
        subtitle.textContent = text.liveOnly || '';
        launcher.setAttribute('aria-label', text.open || '');
        const unavailableHint = context?.supported && !context?.hasKey
            ? (text.missingKey || '')
            : context?.supported && !context?.connected ? (text.sendFailed || '') : '';
        launcher.title = unavailableHint || text.open || '';
        launcherHint.textContent = unavailableHint;
        if (unavailableHint) launcher.setAttribute('aria-describedby', launcherHint.id);
        else launcher.removeAttribute('aria-describedby');
        panel.setAttribute('aria-label', text.title || '');
        textarea.placeholder = text.placeholder || '';
        textareaLabel.textContent = text.placeholder || text.title || '';
        sendButton.textContent = text.send || '';
        empty.textContent = text.empty || '';
        leftButton.title = text.dockLeft || '';
        detachedButton.title = text.detached || '';
        rightButton.title = text.dockRight || '';
        closeButton.title = text.close || '';
        leftButton.setAttribute('aria-label', text.dockLeft || '');
        detachedButton.setAttribute('aria-label', text.detached || '');
        rightButton.setAttribute('aria-label', text.dockRight || '');
        closeButton.setAttribute('aria-label', text.close || '');
    }

    function applyTheme() {
        const light = themeMode === 'light' || (themeMode === 'system' && systemTheme.matches);
        app.dataset.theme = light ? 'light' : 'dark';
        app.dataset.palette = ['eucalyptus', 'cyber', 'graphite'].includes(themePalette) ? themePalette : 'eucalyptus';
    }

    function viewportBounds() {
        return { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) };
    }

    function normalizePosition(value) {
        return ['left', 'right', 'detached'].includes(value) ? value : 'right';
    }

    function normalizeSize(value) {
        return ['compact', 'standard', 'large', 'custom'].includes(value) ? value : 'standard';
    }

    function preferredSize() {
        return SIZE_PRESETS[chatSize] || {
            width: Number(layout.customWidth) || DEFAULT_WIDTH,
            height: Number(layout.customHeight) || DEFAULT_HEIGHT
        };
    }

    function clampDetached() {
        const viewport = viewportBounds();
        const maxWidth = Math.max(1, Math.min(600, viewport.width - 16));
        const maxHeight = Math.max(1, viewport.height - 16);
        const horizontalInset = Math.min(8, Math.max(0, Math.floor((viewport.width - 1) / 2)));
        const verticalInset = Math.min(8, Math.max(0, Math.floor((viewport.height - 1) / 2)));
        layout.width = Math.min(Math.max(Number(layout.width) || DEFAULT_WIDTH, Math.min(MIN_WIDTH, maxWidth)), maxWidth);
        layout.height = Math.min(Math.max(Number(layout.height) || DEFAULT_HEIGHT, Math.min(MIN_HEIGHT, maxHeight)), maxHeight);
        layout.x = Math.min(Math.max(Number(layout.x) || horizontalInset, horizontalInset), Math.max(horizontalInset, viewport.width - layout.width - horizontalInset));
        layout.y = Math.min(Math.max(Number(layout.y) || verticalInset, verticalInset), Math.max(verticalInset, viewport.height - layout.height - verticalInset));
    }

    function saveLayout() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            chrome.storage.local.set({ [storageKey]: layout }).catch(() => {});
        }, 150);
    }

    function applyLayout() {
        applyingLayout = true;
        const size = preferredSize();
        panel.style.right = 'auto';
        panel.style.left = 'auto';
        panel.style.bottom = 'auto';
        panel.style.resize = 'none';
        header.classList.toggle('detached', layout.mode === 'detached');
        leftButton.classList.toggle('active', layout.mode === 'left');
        detachedButton.classList.toggle('active', layout.mode === 'detached');
        rightButton.classList.toggle('active', layout.mode === 'right');
        if (layout.mode === 'detached') {
            clampDetached();
            panel.style.left = `${layout.x}px`;
            panel.style.top = `${layout.y}px`;
            panel.style.width = `${layout.width}px`;
            panel.style.height = `${layout.height}px`;
            panel.style.resize = 'both';
            launcher.style.left = `${layout.x}px`;
            launcher.style.right = 'auto';
            launcher.style.top = `${layout.y}px`;
        } else {
            const viewport = viewportBounds();
            const gutter = Math.min(16, Math.max(0, Math.floor((viewport.width - 1) / 2)));
            const panelTop = viewport.height < MIN_HEIGHT + 80 ? Math.min(8, Math.max(0, viewport.height - 1)) : 64;
            panel.style.top = `${panelTop}px`;
            panel.style.width = `${Math.max(1, Math.min(size.width, viewport.width - gutter * 2))}px`;
            panel.style.height = `${Math.max(1, Math.min(size.height, viewport.height - panelTop - Math.min(16, Math.max(0, viewport.height - panelTop - 1))))}px`;
            panel.style[layout.mode] = `${gutter}px`;
            launcher.style.top = `${Math.max(0, Math.min(viewport.height - 48, viewport.height / 2 - 24))}px`;
            launcher.style.left = layout.mode === 'left' ? `${gutter}px` : 'auto';
            launcher.style.right = layout.mode === 'right' ? `${gutter}px` : 'auto';
        }
        globalThis.queueMicrotask(() => { applyingLayout = false; });
    }

    function setMode(mode, persistPreference = true) {
        mode = normalizePosition(mode);
        if (mode === 'detached' && !layout.detachedInitialized) {
            const size = preferredSize();
            layout.x = Math.max(8, Math.round((window.innerWidth - size.width) / 2));
            layout.y = Math.max(8, Math.round((window.innerHeight - size.height) / 2));
            layout.detachedInitialized = true;
        }
        chatPosition = mode;
        layout.mode = mode;
        applyLayout();
        saveLayout();
        if (persistPreference) chrome.storage.local.set({ chatPosition: mode }).catch(() => {});
    }

    function setSize(size, persistPreference = true) {
        chatSize = normalizeSize(size);
        const preset = SIZE_PRESETS[chatSize];
        if (preset) {
            layout.width = preset.width;
            layout.height = preset.height;
        } else {
            layout.width = Number(layout.customWidth) || DEFAULT_WIDTH;
            layout.height = Number(layout.customHeight) || DEFAULT_HEIGHT;
        }
        if (layout.mode === 'detached') clampDetached();
        applyLayout();
        saveLayout();
        if (persistPreference) chrome.storage.local.set({ chatSize }).catch(() => {});
    }

    function setOpened(next) {
        opened = !!next && !!context?.enabled;
        panel.classList.toggle('open', opened);
        launcher.style.display = opened ? 'none' : '';
        if (opened) {
            textarea.focus();
            messages.scrollTop = messages.scrollHeight;
        }
    }

    function applyContext(next) {
        const previousRoomId = context?.roomId;
        context = next || null;
        const supported = !!context?.supported;
        const optedIn = !!context?.enabled;
        const hasKey = !!context?.hasKey;
        const connected = !!context?.connected;
        context = context ? { ...context, enabled: supported && optedIn && hasKey && connected } : null;
        if (previousRoomId && previousRoomId !== context?.roomId) {
            clearMessages();
            startStateApplied = false;
        }
        host.style.display = supported && optedIn ? '' : 'none';
        launcher.setAttribute('aria-disabled', String(!context?.enabled));
        if (!optedIn) startStateApplied = false;
        if (!context?.enabled) {
            setOpened(false);
        } else if (preferencesLoaded && !startStateApplied) {
            startStateApplied = true;
            setOpened(chatStartMode === 'open');
        }
        applyStrings();
        applyLayout();
    }

    async function refresh() {
        if (destroyed) return;
        const generation = ++refreshGeneration;
        const next = await messageRuntime({ type: 'GET_CHAT_CONTEXT' });
        if (destroyed || generation !== refreshGeneration) return;
        applyContext(next);
    }

    function appendMessage(message) {
        if (!context?.enabled || !message || typeof message.text !== 'string') return;
        if (empty.isConnected) empty.remove();
        const wrapper = element('article', 'message');
        const meta = element('div', 'meta');
        const own = message.senderId === context.peerId;
        const sender = element('span', 'sender', own ? (strings().you || '') : (message.username || message.senderId || ''));
        const time = element('time', 'time');
        const date = new Date(message.timestamp);
        time.textContent = Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        meta.append(sender, time);
        const body = element('div', 'body');
        const tokens = globalThis.KoalaSyncChatFormat?.tokenizeChatText(message.text) || [{ type: 'text', text: message.text }];
        for (const token of tokens) {
            const node = token.type === 'strong' ? document.createElement('strong') : token.type === 'em' ? document.createElement('em') : document.createTextNode(token.text);
            if (node.nodeType === 1) node.textContent = token.text;
            body.append(node);
        }
        wrapper.append(meta, body);
        messages.append(wrapper);
        while (messages.querySelectorAll('.message').length > MAX_MESSAGES) messages.querySelector('.message')?.remove();
        messages.scrollTop = messages.scrollHeight;
    }

    function clearMessages() {
        messages.replaceChildren(empty);
    }

    function resetComposer() {
        sendGeneration++;
        sending = false;
        textarea.value = '';
        count.textContent = '0/500';
        count.style.color = '';
        status.textContent = '';
        sendButton.disabled = false;
    }

    launcher.addEventListener('click', () => setOpened(true));
    closeButton.addEventListener('click', () => setOpened(false));
    leftButton.addEventListener('click', () => setMode('left'));
    detachedButton.addEventListener('click', () => setMode('detached'));
    rightButton.addEventListener('click', () => setMode('right'));

    textarea.addEventListener('input', () => {
        const length = [...textarea.value].length;
        count.textContent = `${length}/500`;
        count.style.color = length > 500 ? 'var(--danger)' : '';
        status.textContent = length > 500 ? (strings().tooLong || '') : '';
    });
    textarea.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (!sending) composer.requestSubmit();
        }
    });
    composer.addEventListener('submit', async event => {
        event.preventDefault();
        if (sending || !context?.enabled) return;
        const submittedValue = textarea.value;
        const text = textarea.value.trim();
        if (!text) return;
        if ([...text].length > 500) {
            status.textContent = strings().tooLong || '';
            return;
        }
        const generation = ++sendGeneration;
        sending = true;
        sendButton.disabled = true;
        status.textContent = '';
        const response = await messageRuntime({ type: 'CHAT_SEND', text });
        if (destroyed || generation !== sendGeneration) return;
        sending = false;
        sendButton.disabled = false;
        if (response?.status === 'ok') {
            if (textarea.value === submittedValue) {
                textarea.value = '';
                count.textContent = '0/500';
            }
        } else {
            status.textContent = response?.status === 'too_long' ? (strings().tooLong || '') : (strings().sendFailed || '');
        }
    });

    let drag = null;
    header.addEventListener('pointerdown', event => {
        if (layout.mode !== 'detached' || event.target.closest('button')) return;
        drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: layout.x, y: layout.y };
        header.setPointerCapture(event.pointerId);
    });
    header.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        layout.x = drag.x + event.clientX - drag.startX;
        layout.y = drag.y + event.clientY - drag.startY;
        clampDetached();
        applyLayout();
    });
    header.addEventListener('pointerup', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        drag = null;
        saveLayout();
    });

    const resizeObserver = new globalThis.ResizeObserver(() => {
        if (applyingLayout || layout.mode !== 'detached') return;
        const rect = panel.getBoundingClientRect();
        if (!opened || !rect?.width || !rect.height) return;
        if (Math.abs(rect.width - layout.width) < 1 && Math.abs(rect.height - layout.height) < 1) return;
        layout.width = rect.width;
        layout.height = rect.height;
        layout.customWidth = rect.width;
        layout.customHeight = rect.height;
        if (chatSize !== 'custom') {
            chatSize = 'custom';
            chrome.storage.local.set({ chatSize }).catch(() => {});
        }
        clampDetached();
        saveLayout();
    });
    resizeObserver.observe(panel);

    function moveIntoFullscreen() {
        const parent = document.fullscreenElement || document.documentElement;
        if (parent && host.parentNode !== parent) parent.append(host);
        globalThis.requestAnimationFrame(applyLayout);
    }

    function handleResize() {
        if (layout.mode === 'detached') {
            clampDetached();
            applyLayout();
            saveLayout();
        }
    }

    function handleSystemTheme() {
        if (themeMode === 'system') applyTheme();
    }

    function handleStorage(changes, area) {
        if (area !== 'local') return;
        if (changes.themeMode) themeMode = changes.themeMode.newValue || 'system';
        if (changes.themePalette) themePalette = changes.themePalette.newValue || 'eucalyptus';
        if (changes.themeMode || changes.themePalette) applyTheme();
        if (changes.chatPosition) setMode(changes.chatPosition.newValue, false);
        if (changes.chatSize) setSize(changes.chatSize.newValue, false);
        if (changes.chatStartMode) {
            chatStartMode = changes.chatStartMode.newValue === 'open' ? 'open' : 'bubble';
            if (context?.enabled) {
                startStateApplied = true;
                setOpened(chatStartMode === 'open');
            }
        }
        if (changes.locale) refresh();
    }

    function handleRuntime(message) {
        if (message?.type === 'CHAT_MESSAGE') appendMessage(message.message);
        if (message?.type === 'CHAT_CONTEXT_UPDATE' || message?.type === 'CONNECTION_STATUS') refresh();
        if (message?.type === 'CHAT_RESET') {
            clearMessages();
            resetComposer();
            refresh();
        }
        if (message?.type === 'CHAT_DESTROY') destroy();
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        refreshGeneration++;
        sendGeneration++;
        if (saveTimer) clearTimeout(saveTimer);
        resizeObserver.disconnect();
        document.removeEventListener('fullscreenchange', moveIntoFullscreen);
        window.removeEventListener('resize', handleResize);
        systemTheme.removeEventListener('change', handleSystemTheme);
        chrome.storage.onChanged.removeListener(handleStorage);
        chrome.runtime.onMessage.removeListener(handleRuntime);
        host.remove();
        window.koalaSyncChatOverlay = null;
    }

    document.addEventListener('fullscreenchange', moveIntoFullscreen);
    window.addEventListener('resize', handleResize, { passive: true });
    systemTheme.addEventListener('change', handleSystemTheme);
    chrome.storage.onChanged.addListener(handleStorage);
    chrome.runtime.onMessage.addListener(handleRuntime);
    chrome.storage.local.get([storageKey, 'themeMode', 'themePalette', 'chatPosition', 'chatSize', 'chatStartMode'], data => {
        const storedLayout = data[storageKey];
        if (storedLayout && typeof storedLayout === 'object') {
            layout = { ...layout, ...storedLayout };
            layout.customWidth = Number(storedLayout.customWidth) || Number(storedLayout.width) || DEFAULT_WIDTH;
            layout.customHeight = Number(storedLayout.customHeight) || Number(storedLayout.height) || DEFAULT_HEIGHT;
        }
        chatPosition = normalizePosition(data.chatPosition);
        chatSize = normalizeSize(data.chatSize);
        chatStartMode = data.chatStartMode === 'open' ? 'open' : 'bubble';
        layout.mode = chatPosition;
        if (layout.mode === 'detached') layout.detachedInitialized = true;
        const preset = SIZE_PRESETS[chatSize];
        if (preset) {
            layout.width = preset.width;
            layout.height = preset.height;
        }
        themeMode = data.themeMode || 'system';
        themePalette = data.themePalette || 'eucalyptus';
        preferencesLoaded = true;
        applyTheme();
        applyLayout();
        refresh();
    });

    window.koalaSyncChatOverlay = { refresh, destroy };
})();
