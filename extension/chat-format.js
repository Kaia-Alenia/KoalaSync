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

    function splitChatText(value, maxCodePoints = 500, maxChunks = 10) {
        if (!Number.isInteger(maxCodePoints) || maxCodePoints < 1 || !Number.isInteger(maxChunks) || maxChunks < 1) {
            throw new TypeError('Chat chunk limits must be positive integers');
        }
        let remaining = [...String(value ?? '').trim()];
        if (remaining.length === 0) return [];
        if (remaining.length > maxCodePoints * maxChunks) {
            throw new RangeError('Chat composer text exceeds the chunk limit');
        }

        const chunks = [];
        while (remaining.length > 0) {
            if (remaining.length <= maxCodePoints) {
                chunks.push(remaining.join('').trim());
                break;
            }

            const remainingSlots = maxChunks - chunks.length;
            const minimumSplit = Math.max(1, remaining.length - (remainingSlots - 1) * maxCodePoints);
            let splitAt = maxCodePoints;
            for (let index = maxCodePoints - 1; index >= minimumSplit; index--) {
                if (/\s/u.test(remaining[index])) {
                    splitAt = index;
                    break;
                }
            }

            const chunk = remaining.slice(0, splitAt).join('').trim();
            remaining = remaining.slice(splitAt);
            while (remaining.length > 0 && /\s/u.test(remaining[0])) remaining.shift();
            if (chunk) chunks.push(chunk);
        }

        return chunks;
    }

    root.KoalaSyncChatFormat = Object.freeze({ escapeChatHtml, formatChatText, tokenizeChatText, splitChatText });
})(globalThis);
