import { describe, expect, it } from 'vitest';
import { createChatActivityStore } from './chat-activity.js';

describe('chat activity store', () => {
    it('deduplicates commands and retains only the newest bounded entries', () => {
        const store = createChatActivityStore(2);
        expect(store.add({ action: 'play', senderId: 'a', timestamp: 1 })).toMatchObject({ id: 'play:a:1' });
        expect(store.add({ action: 'play', senderId: 'a', timestamp: 1 })).toBeNull();
        store.add({ action: 'pause', senderId: 'b', username: 'Bear', timestamp: 2 });
        store.add({ action: 'seek', senderId: 'a', timestamp: 3 });

        expect(store.snapshot()).toEqual([
            { id: 'pause:b:2', action: 'pause', senderId: 'b', username: 'Bear', timestamp: 2 },
            { id: 'seek:a:3', action: 'seek', senderId: 'a', username: '', timestamp: 3 }
        ]);
    });

    it('restores only valid activity without sharing mutable references', () => {
        const store = createChatActivityStore();
        store.restore([
            { id: 'joined:b:4', action: 'joined', senderId: 'b', username: 'Koala', timestamp: 4 },
            { action: 'unknown', senderId: 'b', timestamp: 5 },
            { action: 'left', senderId: '', timestamp: 6 }
        ]);

        const snapshot = store.snapshot();
        snapshot[0].username = 'Changed';
        expect(store.snapshot()).toEqual([
            { id: 'joined:b:4', action: 'joined', senderId: 'b', username: 'Koala', timestamp: 4 }
        ]);
    });
});
