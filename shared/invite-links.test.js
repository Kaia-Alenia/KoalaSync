import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(async () => {
    await import('./invite-links.js');
});

describe('invite links', () => {
    it('round-trips official and custom j2 links', () => {
        const api = globalThis.KoalaSyncInviteLinks;
        const official = api.buildJ2Hash({
            roomId: 'SAPPHIRE-DUCK-49',
            password: '0X:UK3C',
            chatKey: 'R5Ti1nxp0crfAFHf3gVncw'
        });
        expect(api.parseInviteHash(official)).toEqual({
            format: 'j2',
            roomId: 'SAPPHIRE-DUCK-49',
            password: '0X:UK3C',
            chatKey: 'R5Ti1nxp0crfAFHf3gVncw',
            useCustomServer: false,
            serverUrl: ''
        });

        const custom = api.buildJ2Hash({
            roomId: 'SILENT-EAGLE-90',
            password: '30PXPD',
            chatKey: 'R5Ti1nxp0crfAFHf3gVncw',
            serverUrl: 'wss://sync.example.test/socket?region=eu'
        });
        expect(api.parseInviteHash(custom)).toMatchObject({
            useCustomServer: true,
            serverUrl: 'wss://sync.example.test/socket?region=eu'
        });
    });

    it('keeps legacy links compatible, including colons in passwords', () => {
        const parse = globalThis.KoalaSyncInviteLinks.parseInviteHash;
        expect(parse('#join:ROOM-1:pass:with:colons')).toMatchObject({
            format: 'legacy',
            password: 'pass:with:colons',
            chatKey: '',
            useCustomServer: false
        });
        expect(parse('#join:ROOM-1:pass:with:colons:1:wss%3A%2F%2Frelay.example')).toMatchObject({
            password: 'pass:with:colons',
            useCustomServer: true,
            serverUrl: 'wss://relay.example'
        });
    });

    it('rejects incomplete or malformed invite hashes', () => {
        const parse = globalThis.KoalaSyncInviteLinks.parseInviteHash;
        expect(parse('#j2:r=ROOM&p=PASS')).toBeNull();
        expect(parse('#join:ROOM')).toBeNull();
        expect(parse('#join:ROOM:PASS:1:%E0%A4%A')).toBeNull();
        expect(parse('#other:r=ROOM&p=PASS&k=KEY')).toBeNull();
    });
});
