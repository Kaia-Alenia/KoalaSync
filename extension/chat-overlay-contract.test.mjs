import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const extensionDir = path.dirname(fileURLToPath(import.meta.url));
const overlaySource = fs.readFileSync(path.join(extensionDir, 'chat-overlay.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8');
const popupSource = fs.readFileSync(path.join(extensionDir, 'popup.js'), 'utf8');
const localeDir = path.join(extensionDir, 'locales');
const chatKeys = [
    'LABEL_CHAT_ENABLED',
    'LABEL_CHAT_ENABLED_TOOLTIP',
    'CHAT_TITLE',
    'CHAT_LIVE_ONLY',
    'CHAT_OPEN',
    'CHAT_CLOSE',
    'CHAT_DOCK_LEFT',
    'CHAT_DOCK_RIGHT',
    'CHAT_DETACHED',
    'CHAT_PLACEHOLDER',
    'CHAT_SEND',
    'CHAT_MISSING_KEY',
    'CHAT_TOO_LONG',
    'CHAT_SEND_FAILED',
    'CHAT_EMPTY'
];

describe('chat overlay contract', () => {
    it('isolates the overlay and never renders markup as HTML', () => {
        expect(overlaySource).toContain("attachShadow({ mode: 'open' })");
        expect(overlaySource).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|\.outerHTML\s*=/);
        expect(overlaySource).toContain('document.createTextNode(token.text)');
    });

    it('injects formatting and overlay code only with the selected-tab content script', () => {
        expect(backgroundSource).toContain("files: ['chat-format.js', 'chat-overlay.js', 'content.js']");
        expect(overlaySource).toContain("const storageKey = `chatOverlayLayout:${location.origin}`");
        expect(overlaySource).toContain('document.fullscreenElement || document.documentElement');
    });

    it('supports all layout and theme combinations with bounded message DOM', () => {
        expect(overlaySource).toContain("['left', 'right', 'detached']");
        expect(overlaySource).toContain('!layout.detachedInitialized');
        expect(overlaySource).toContain('const rect = panel.getBoundingClientRect()');
        expect(overlaySource).not.toContain('contentRect');
        expect(overlaySource).toContain("#app[data-palette=\"cyber\"][data-theme=\"light\"]");
        expect(overlaySource).toContain("#app[data-palette=\"graphite\"][data-theme=\"light\"]");
        expect(overlaySource).toContain('const MAX_MESSAGES = 200');
        expect(overlaySource).toContain('while (messages.querySelectorAll(\'.message\').length > MAX_MESSAGES)');
        expect(overlaySource).toContain('Math.max(1, window.innerWidth)');
        expect(overlaySource).toContain('min(${MIN_WIDTH}px, calc(100vw - 16px))');
    });

    it('blocks page playback shortcuts while the chat composer owns keyboard input', () => {
        expect(overlaySource).toContain("for (const eventName of ['keydown', 'keyup', 'keypress'])");
        expect(overlaySource).toContain('window.addEventListener(eventName, stopPageKeyboardShortcut, true)');
        expect(overlaySource).toContain('path.includes(textarea)');
        expect(overlaySource).toContain('event.stopImmediatePropagation()');
        expect(overlaySource).toContain('window.removeEventListener(eventName, stopPageKeyboardShortcut, true)');
    });

    it('keeps the launcher draggable independently from dock mode', () => {
        expect(overlaySource).toContain("launcher.addEventListener('pointerdown'");
        expect(overlaySource).toContain("launcher.addEventListener('pointermove'");
        expect(overlaySource).toContain('layout.launcherX = launcherDrag.x + deltaX');
        expect(overlaySource).toContain('layout.launcherY = launcherDrag.y + deltaY');
        expect(overlaySource).toContain('suppressLauncherClick = launcherDrag.moved');
        expect(overlaySource).not.toMatch(/launcher\.style\.left = `\$\{layout\.x\}px`/);
    });

    it('reserves page space for real left and right dock modes', () => {
        expect(overlaySource).toContain("const PAGE_DOCK_ATTRIBUTE = 'data-koalasync-chat-dock'");
        expect(overlaySource).toContain('padding-left: var(${PAGE_DOCK_WIDTH}) !important');
        expect(overlaySource).toContain('padding-right: var(${PAGE_DOCK_WIDTH}) !important');
        expect(overlaySource).toContain('document.documentElement.setAttribute(PAGE_DOCK_ATTRIBUTE, side)');
        expect(overlaySource).toContain('applyPageDock(layout.mode, dockWidth)');
        expect(overlaySource).toContain('clearPageDock()');
    });

    it('counts unread remote messages on the bubble and clears the badge when opened', () => {
        expect(overlaySource).toContain("const unreadBadge = element('span', 'unread')");
        expect(overlaySource).toContain('if (!opened && !own) setUnreadCount(unreadCount + 1)');
        expect(overlaySource).toMatch(/if \(opened\) \{\s*setUnreadCount\(0\)/);
        expect(overlaySource).toContain("unreadBadge.classList.toggle('visible', unreadCount > 0)");
        expect(backgroundSource).toMatch(/received\.senderId !== peerId[\s\S]*showChatNotification\([\s\S]*senderPeer\.username[\s\S]*received\.senderId/);
        expect(backgroundSource).toContain("chrome.notifications.create(`chat_${Date.now()}`");
        expect(backgroundSource).toContain("if (settings.chatNotifications === false) return");
    });

    it('renders timestamped room activity and keeps activity notifications opt-in', () => {
        expect(overlaySource).toContain("if (message?.type === 'CHAT_EVENT') appendEvent(message.event)");
        expect(overlaySource).toContain("const time = element('time', 'time')");
        expect(overlaySource).toContain("date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })");
        expect(overlaySource).toContain('if (!opened && context.eventNotifications) setUnreadCount(unreadCount + 1)');
        expect(backgroundSource).toContain("eventNotifications: localeData.browserNotifications === true");
        expect(backgroundSource).toContain("sendChatActivity(message.action, peerId, timestamp)");
        expect(backgroundSource).toContain("sendChatActivity(event, data.senderId, data.actionTimestamp)");
        expect(backgroundSource).toContain("sendChatActivity('joined', data.peerId, Date.now())");
        expect(backgroundSource).toContain("sendChatActivity('left', data.peerId, Date.now())");
    });

    it('guards async refresh/send work and clears all composer state on room reset', () => {
        expect(overlaySource).toContain('generation !== refreshGeneration');
        expect(overlaySource).toContain('if (sending || !context?.enabled) return');
        expect(overlaySource).toContain('textarea.value === submittedValue');
        expect(overlaySource).toMatch(/CHAT_RESET[\s\S]*resetComposer\(\)/);
        expect(overlaySource).toContain('setTimeout(() => finish(null), timeoutMs)');
        expect(backgroundSource).toContain('chatReceiveQueue = chatReceiveQueue.catch(() => {}).then');
        expect(backgroundSource).toContain("status: 'rate_limited'");
    });

    it('keeps chat hidden by default without discarding the room chat key', () => {
        expect(popupSource).toContain('localData.chatEnabled === true');
        expect(backgroundSource).toContain('chatEnabled: data.chatEnabled === true');
        expect(backgroundSource).toContain('clientCapabilities: CLIENT_CAPABILITIES');
        expect(overlaySource).toContain('all:initial;display:none;position:fixed');
        expect(overlaySource).toContain("host.style.display = supported && optedIn ? '' : 'none'");
        expect(overlaySource).toContain('supported && optedIn && hasKey && connected');
        expect(popupSource).toContain("chrome.storage.local.set({ chatEnabled: elements.chatEnabled.checked })");
        expect(popupSource).toMatch(/if \(isCreating\) \{[\s\S]*?type: 'CREATE_CHAT_KEY'[\s\S]*?chatKey = normalizeChatKey/);
        expect(popupSource).not.toMatch(/chatEnabled[\s\S]{0,120}chatKey:\s*''/);
    });

    it('keeps unavailable chat controls discoverable to assistive technology', () => {
        expect(overlaySource).toContain("launcher.setAttribute('aria-disabled'");
        expect(overlaySource).not.toContain('launcher.disabled =');
        expect(overlaySource).toContain("launcher.setAttribute('aria-describedby', launcherHint.id)");
        expect(overlaySource).toContain("textarea.setAttribute('aria-describedby', 'chat-composer-count chat-composer-status')");
        expect(overlaySource).toContain("status.setAttribute('role', 'status')");
    });

    it('creates a chat key for both generated-room entry points', () => {
        expect(popupSource).toContain('let pendingRoomCreation = false');
        expect(popupSource).toContain('const isCreating = pendingRoomCreation || !roomIdInput');
        expect(popupSource).toMatch(/function handleCreateRoom\(\)[\s\S]*pendingRoomCreation = true[\s\S]*elements\.joinBtn\.click\(\)/);
        expect(popupSource).toContain("type: 'CREATE_CHAT_KEY'");
    });

    it('contains every chat string in all 15 extension locales', () => {
        const localeFiles = fs.readdirSync(localeDir).filter(file => file.endsWith('.json')).sort();
        expect(localeFiles).toHaveLength(15);
        for (const file of localeFiles) {
            const messages = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
            for (const key of chatKeys) {
                expect(messages[key], `${file}: ${key}`).toBeTypeOf('string');
                expect(messages[key], `${file}: ${key}`).not.toBe('');
                expect(messages[key], `${file}: ${key}`).not.toMatch(/[—–]/);
            }
        }
    });
});
