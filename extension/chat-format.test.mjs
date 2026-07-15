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
});
