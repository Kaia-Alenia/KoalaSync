import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionDir = path.dirname(new URL(import.meta.url).pathname);
const overlaySource = fs.readFileSync(path.join(extensionDir, 'chat-overlay.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(extensionDir, 'background.js'), 'utf8');
const localeDir = path.join(extensionDir, 'locales');
const chatKeys = [
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
