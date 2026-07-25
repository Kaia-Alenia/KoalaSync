(function exposeChatFormat(root) {
    function escapeChatHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatChatText(value) {
        return escapeChatHtml(value)
            .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    }

    function tokenizeChatText(value) {
        const text = String(value ?? '');
        const tokens = [];
        const pattern = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
        let cursor = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            if (match.index > cursor) tokens.push({ type: 'text', text: text.slice(cursor, match.index) });
            tokens.push({ type: match[1] !== undefined ? 'strong' : 'em', text: match[1] ?? match[2] });
            cursor = pattern.lastIndex;
        }
        if (cursor < text.length) tokens.push({ type: 'text', text: text.slice(cursor) });
        return tokens;
    }

    root.KoalaSyncChatFormat = Object.freeze({ escapeChatHtml, formatChatText, tokenizeChatText });
})(globalThis);
