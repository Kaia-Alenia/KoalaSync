import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => {
    await import('./chat-format.js');
});

describe('chat formatting', () => {
    it('escapes executable HTML before applying limited Markdown', () => {
        const result = globalThis.KoalaSyncChatFormat.formatChatText('<img src=x onerror=alert(1)> **bold** *italic*');
        expect(result).toBe('&lt;img src=x onerror=alert(1)&gt; <strong>bold</strong> <em>italic</em>');
        expect(result).not.toContain('<img');
    });

    it('tokenizes only text, strong, and emphasis nodes', () => {
        expect(globalThis.KoalaSyncChatFormat.tokenizeChatText('<script>x</script> **bold** *italic*')).toEqual([
            { type: 'text', text: '<script>x</script> ' },
            { type: 'strong', text: 'bold' },
            { type: 'text', text: ' ' },
            { type: 'em', text: 'italic' }
        ]);
    });

    it('splits up to 5000 Unicode code points into at most ten ordered chat-v1 messages', () => {
        const split = globalThis.KoalaSyncChatFormat.splitChatText;
        expect(split('hello world', 500, 10)).toEqual(['hello world']);

        const emojiChunks = split('😀'.repeat(1001), 500, 10);
        expect(emojiChunks.map(chunk => [...chunk].length)).toEqual([500, 500, 1]);

        const maximumChunks = split('x'.repeat(5000), 500, 10);
        expect(maximumChunks).toHaveLength(10);
        expect(maximumChunks.every(chunk => [...chunk].length === 500)).toBe(true);
        expect(maximumChunks.join('')).toBe('x'.repeat(5000));

        expect(() => split('x'.repeat(5001), 500, 10)).toThrow(RangeError);
    });

    it('prefers whitespace boundaries without creating more chunks than the limit allows', () => {
        const split = globalThis.KoalaSyncChatFormat.splitChatText;
        const chunks = split(`${'a'.repeat(420)} ${'b'.repeat(179)}`, 500, 10);
        expect(chunks).toEqual(['a'.repeat(420), 'b'.repeat(179)]);
    });
});
