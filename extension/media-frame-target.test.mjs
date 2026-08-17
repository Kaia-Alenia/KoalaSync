import { describe, expect, it, vi } from 'vitest';
import {
    MEDIA_FRAME_ACCESS_REQUIRED,
    MEDIA_FRAME_AMBIGUOUS,
    inspectMediaFrame,
    resolveMediaContentTarget,
    selectMediaFrame
} from './media-frame-target.js';

function video(overrides = {}) {
    const candidate = {
        hasSource: true,
        rendered: true,
        background: false,
        shortUncontrolled: false,
        sizeBucket: 18,
        playing: false,
        controls: true,
        readyState: 4,
        duration: 1200,
        renderedArea: 830 * 498,
        ...overrides
    };
    candidate.shortUncontrolled = overrides.shortUncontrolled ?? (
        !candidate.controls && candidate.duration > 0 && candidate.duration < 300
    );
    return candidate;
}

function frame(frameId, overrides = {}) {
    return {
        frameId,
        documentId: `document-${frameId}`,
        result: {
            href: `https://player-${frameId}.example/embed`,
            origin: `https://player-${frameId}.example`,
            isTop: frameId === 0,
            videoCount: 1,
            bestVideo: video(),
            frameArea: 830 * 498,
            parentFrameVisible: true,
            parentFrameArea: 830 * 498,
            embeddedFrames: [],
            ...overrides
        }
    };
}

describe('cross-origin media-frame targeting', () => {
    it('selects a visible cross-origin player over a hidden loaded copy', () => {
        const selected = selectMediaFrame([
            frame(4),
            frame(5, { parentFrameVisible: false, bestVideo: video({ playing: true }) })
        ]);
        expect(selected.frameId).toBe(4);
    });

    it('does not select a video hidden inside a same-origin descendant', () => {
        expect(selectMediaFrame([
            frame(0, { bestVideo: video({ rendered: false }) }),
            frame(6, {
                parentFrameVisible: false,
                bestVideo: video({ rendered: true, playing: true })
            })
        ])).toBeNull();
    });

    it('keeps a real player ahead of a larger muted looping background video', () => {
        const selected = selectMediaFrame([
            frame(2, { bestVideo: video({ sizeBucket: 24, background: true, controls: false }) }),
            frame(7, { bestVideo: video({ sizeBucket: 18 }) })
        ]);
        expect(selected.frameId).toBe(7);
    });

    it('keeps an active long player ahead of a larger ordinary ad video', () => {
        const selected = selectMediaFrame([
            frame(2, { bestVideo: video({ sizeBucket: 24, duration: 30, playing: false, controls: false }) }),
            frame(7, { bestVideo: video({ sizeBucket: 18, duration: 1200, playing: true, controls: true }) })
        ]);
        expect(selected.frameId).toBe(7);
    });

    it('keeps a paused long player ahead of a playing short uncontrolled ad', () => {
        const selected = selectMediaFrame([
            frame(2, { bestVideo: video({
                sizeBucket: 24,
                duration: 30,
                playing: true,
                controls: false,
                shortUncontrolled: true
            }) }),
            frame(7, { bestVideo: video({
                sizeBucket: 18,
                duration: 1200,
                playing: false,
                controls: true
            }) })
        ]);
        expect(selected.frameId).toBe(7);
    });

    it('keeps same-origin reachable media under the top-frame controller', () => {
        const sharedVideo = video();
        const selected = selectMediaFrame([
            frame(0, { bestVideo: sharedVideo, videoCount: 1 }),
            frame(6, { bestVideo: sharedVideo, videoCount: 1 })
        ]);
        expect(selected.frameId).toBe(0);
    });

    it('refuses to guess between equally-ranked frames without visibility evidence', () => {
        expect(selectMediaFrame([
            frame(3, { parentFrameVisible: null }),
            frame(4, { parentFrameVisible: null })
        ])).toBeNull();
    });

    it('returns the exact selected frame and document after probing', async () => {
        const results = [frame(0, { bestVideo: null, videoCount: 0 }), frame(8)];
        const executeScript = vi.fn().mockResolvedValue(results);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            42,
            { attempts: 1, probeDelayMs: 0 }
        )).resolves.toEqual({
            frameId: 8,
            documentId: 'document-8',
            frameUrl: 'https://player-8.example/embed',
            hasVideo: true,
            scriptTarget: { tabId: 42, documentIds: ['document-8'] }
        });
        const visibilityDispatches = executeScript.mock.calls.filter(([options]) => (
            options.func?.name === 'dispatchParentFrameVisibilityProbe'
        ));
        expect(visibilityDispatches).toHaveLength(4);
    });

    it('keeps the top target inactive when the only discovered video is hidden', async () => {
        const results = [
            frame(0, { bestVideo: video({ rendered: false }) }),
            frame(6, { parentFrameVisible: false })
        ];
        const executeScript = vi.fn().mockResolvedValue(results);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            42,
            { attempts: 1, probeDelayMs: 0 }
        )).resolves.toEqual({
            frameId: 0,
            documentId: null,
            frameUrl: null,
            hasVideo: false,
            scriptTarget: { tabId: 42 }
        });
    });

    it('uses all-frame probing without a navigation permission', async () => {
        const executeScript = vi.fn().mockResolvedValue([frame(8)]);

        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            42,
            { attempts: 1, probeDelayMs: 0 }
        )).resolves.toMatchObject({
            frameId: 8,
            hasVideo: true,
            scriptTarget: { tabId: 42, documentIds: ['document-8'] }
        });
        expect(executeScript.mock.calls[0][0].target).toEqual({ tabId: 42, allFrames: true });
    });

    it('does not trust parent visibility from an older probe token', () => {
        const originalWindow = globalThis.window;
        const originalDocument = globalThis.document;
        const fakeWindow = {
            top: {},
            location: { href: 'https://player.example/embed', origin: 'https://player.example' },
            innerWidth: 800,
            innerHeight: 450,
            __koalaParentFrameVisibility: { token: 'old-token', visible: true, area: 360000 }
        };
        const fakeDocument = {
            location: fakeWindow.location,
            defaultView: fakeWindow,
            querySelectorAll: () => []
        };
        globalThis.window = fakeWindow;
        globalThis.document = fakeDocument;
        try {
            expect(inspectMediaFrame('new-token')).toMatchObject({
                parentFrameVisible: null,
                parentFrameArea: null
            });
        } finally {
            if (originalWindow === undefined) delete globalThis.window;
            else globalThis.window = originalWindow;
            if (originalDocument === undefined) delete globalThis.document;
            else globalThis.document = originalDocument;
        }
    });

    it('recognizes the current Google Drive youtube.googleapis.com player', async () => {
        const top = frame(0, {
            href: 'https://drive.google.com/drive/u/0/search?q=video',
            origin: 'https://drive.google.com',
            bestVideo: null,
            videoCount: 0,
            embeddedFrames: [{
                href: 'https://youtube.googleapis.com/embed/drive-file-id?origin=https%3A%2F%2Fdrive.google.com',
                origin: 'https://youtube.googleapis.com',
                area: 280 * 157,
                width: 280,
                height: 157,
                visible: true,
                depth: 1,
                mediaHint: false
            }]
        });
        const executeScript = vi.fn()
            .mockResolvedValueOnce([top])
            .mockResolvedValueOnce([top]);

        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            42,
            { attempts: 1, probeDelayMs: 0 }
        )).rejects.toMatchObject({
            code: MEDIA_FRAME_ACCESS_REQUIRED,
            host: 'youtube.googleapis.com',
            originPattern: 'https://youtube.googleapis.com/*'
        });
    });

    it('recognizes a YummyAnime-style nested inaccessible player origin', async () => {
        const top = frame(0, {
            href: 'https://yummyanime.tv/show.html',
            origin: 'https://yummyanime.tv',
            bestVideo: null,
            videoCount: 0,
            embeddedFrames: [{
                href: 'https://absciss.thealloha.club/?token=redacted',
                origin: 'https://absciss.thealloha.club',
                area: 830 * 498,
                width: 830,
                height: 498,
                visible: true,
                depth: 2,
                mediaHint: true
            }]
        });
        const executeScript = vi.fn()
            .mockResolvedValueOnce([top])
            .mockResolvedValueOnce([top]);

        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            43,
            { attempts: 1, probeDelayMs: 0 }
        )).rejects.toMatchObject({
            code: MEDIA_FRAME_ACCESS_REQUIRED,
            host: 'absciss.thealloha.club',
            originPattern: 'https://absciss.thealloha.club/*'
        });
    });

    it('requests the inaccessible player instead of selecting an accessible background video', async () => {
        const top = frame(0, {
            bestVideo: video({ background: true, controls: false, renderedArea: 900 * 506 }),
            embeddedFrames: [{
                href: 'https://player.external.example/watch',
                origin: 'https://player.external.example',
                area: 900 * 506,
                width: 900,
                height: 506,
                visible: true,
                mediaHint: true
            }]
        });
        const executeScript = vi.fn().mockResolvedValue([top]);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            44,
            { attempts: 1, probeDelayMs: 0 }
        )).rejects.toMatchObject({
            code: MEDIA_FRAME_ACCESS_REQUIRED,
            originPattern: 'https://player.external.example/*'
        });
    });

    it('requests the inaccessible main player instead of selecting a larger short ad', async () => {
        const top = frame(0, {
            bestVideo: video({
                playing: true,
                controls: false,
                duration: 30,
                renderedArea: 500 * 281,
                sizeBucket: 24
            }),
            embeddedFrames: [{
                href: 'https://player.external.example/watch',
                origin: 'https://player.external.example',
                area: 900 * 506,
                width: 900,
                height: 506,
                visible: true,
                mediaHint: true
            }]
        });
        const executeScript = vi.fn().mockResolvedValue([top]);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            44,
            { attempts: 1, probeDelayMs: 0 }
        )).rejects.toMatchObject({
            code: MEDIA_FRAME_ACCESS_REQUIRED,
            originPattern: 'https://player.external.example/*'
        });
    });

    it('keeps a paused long custom player over a larger inaccessible heuristic frame', async () => {
        const top = frame(0, {
            bestVideo: video({
                playing: false,
                controls: false,
                duration: 7200,
                renderedArea: 600 * 338
            }),
            embeddedFrames: [{
                href: 'https://widget.external.example/watch',
                origin: 'https://widget.external.example',
                area: 900 * 506,
                width: 900,
                height: 506,
                visible: true,
                mediaHint: true
            }]
        });
        const executeScript = vi.fn().mockResolvedValue([top]);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            44,
            { attempts: 1, probeDelayMs: 0 }
        )).resolves.toMatchObject({ frameId: 0, hasVideo: true });
    });

    it('uses Firefox-compatible portless match patterns for embedded origins', async () => {
        const top = frame(0, {
            bestVideo: null,
            videoCount: 0,
            embeddedFrames: [{
                href: 'http://127.0.0.1:4173/player',
                origin: 'http://127.0.0.1:4173',
                area: 900 * 506,
                width: 900,
                height: 506,
                visible: true,
                mediaHint: true
            }]
        });
        const executeScript = vi.fn().mockResolvedValue([top]);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            45,
            { attempts: 1, probeDelayMs: 0 }
        )).rejects.toMatchObject({ originPattern: 'http://127.0.0.1/*' });
    });

    it('does not request access for one large non-media iframe', async () => {
        const top = frame(0, {
            bestVideo: null,
            videoCount: 0,
            embeddedFrames: [{
                href: 'https://maps.example/view',
                origin: 'https://maps.example',
                area: 900 * 506,
                width: 900,
                height: 506,
                visible: true,
                mediaHint: false
            }]
        });
        const executeScript = vi.fn().mockResolvedValue([top]);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            46,
            { attempts: 1, probeDelayMs: 0 }
        )).resolves.toMatchObject({ frameId: 0, hasVideo: false });
    });

    it('does not retain a permission prompt for a player frame that disappeared', async () => {
        const withPlayer = frame(0, {
            bestVideo: null,
            videoCount: 0,
            embeddedFrames: [{
                href: 'https://player.external.example/watch',
                origin: 'https://player.external.example',
                area: 900 * 506,
                width: 900,
                height: 506,
                visible: true,
                mediaHint: true
            }]
        });
        const withoutPlayer = frame(0, { bestVideo: null, videoCount: 0, embeddedFrames: [] });
        const executeScript = vi.fn()
            .mockResolvedValueOnce([withPlayer])
            .mockResolvedValueOnce([withoutPlayer]);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            46,
            { attempts: 2, retryDelayMs: 0, probeDelayMs: 0 }
        )).resolves.toMatchObject({ frameId: 0, hasVideo: false });
    });

    it('does not request access for small or ambiguously-sized embedded frames', async () => {
        const top = frame(0, {
            bestVideo: null,
            videoCount: 0,
            embeddedFrames: [
                { href: 'https://ad-one.example', origin: 'https://ad-one.example', area: 300 * 250, width: 300, height: 250, visible: true },
                { href: 'https://ad-two.example', origin: 'https://ad-two.example', area: 300 * 250, width: 300, height: 250, visible: true }
            ]
        });
        const executeScript = vi.fn()
            .mockResolvedValueOnce([top])
            .mockResolvedValueOnce([top]);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            44,
            { attempts: 1, probeDelayMs: 0 }
        )).resolves.toMatchObject({ frameId: 0, scriptTarget: { tabId: 44 } });
    });

    it('reports ambiguity rather than controlling an arbitrary equal player', async () => {
        const results = [
            frame(3, { parentFrameVisible: null }),
            frame(4, { parentFrameVisible: null })
        ];
        const executeScript = vi.fn().mockResolvedValue(results);
        await expect(resolveMediaContentTarget(
            { scripting: { executeScript } },
            45,
            { attempts: 1, probeDelayMs: 0 }
        )).rejects.toMatchObject({ code: MEDIA_FRAME_AMBIGUOUS });
    });
});
