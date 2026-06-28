import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connectionCounts, clearRateLimitMaps } from '../server/rate-limiter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, '..', 'server', 'package.json'));
const WebSocket = require('ws');

let port, mod, clients = [];

function wsu() { return `ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket&version=2.4.0&token=62170b705234c4f4807a9b22420bb93cf1a2aacfa4c5d3b47804482babb8eb50`; }
async function c() {
    const ws = new WebSocket(wsu()); clients.push(ws); ws._m = []; ws.on('message', d => ws._m.push(d.toString()));
    await new Promise((r, j) => { const t = setTimeout(() => j(Error('connect')), 5e3); ws.on('open', () => { clearTimeout(t); r(); }); });
    ws.send('40'); const s = Date.now(); while (ws._m.length < 2 && Date.now()-s < 5e3) await new Promise(r => setTimeout(r, 50));
    if (ws._m.length < 2) throw Error('handshake');
    ws._m.length = 0; return ws;
}
function s(ws, evt, d={}) { ws.send(`42${JSON.stringify([evt,d])}`); }
function a(ws) { if (ws._m.length) { const r=ws._m.shift(); return r.startsWith('42') ? JSON.parse(r.substring(2)) : r; } return new Promise((resolve, reject) => { const t=setTimeout(()=>reject(Error('timeout')),3e3); const h=(d)=>{clearTimeout(t);ws.removeListener('message',h);const r=d.toString();resolve(r.startsWith('42')?JSON.parse(r.substring(2)):r);};ws.on('message',h);}); }
async function w(ws, evt, ms=3000) { const st=Date.now(); while(Date.now()-st<ms) { for(let i=0;i<ws._m.length;i++){const r=ws._m[i];ws._m.splice(i,1);if(r.startsWith('42')){try{const[e]=JSON.parse(r.substring(2));if(e===evt)return e}catch{/* skip */}}} await new Promise(r=>setTimeout(r,50));} throw Error(`wait:${evt}`); }
async function j(ws, rid, pid, pw=null) { s(ws,'join_room',{roomId:rid,peerId:pid,password:pw,protocolVersion:'1.0.0'}); assert.equal((await a(ws))[0],'room_data'); }
function close() { clients.forEach(w=>{try{w.close()}catch{/* ignore */}}); clients.length=0; }
// Test suite opens >10 connections/min — clear the IP connection counter so the
// connection rate limiter doesn't mask test failures (test-only, never at runtime).
function resetConnectionRate() { connectionCounts.clear(); clearRateLimitMaps(); }

try {
    process.env.ADMIN_METRICS_TOKEN = 'ws-integration-test-32chars-minimum!';
    mod = await import('../server/index.js');
    await mod.startServer(0,'127.0.0.1');
    port = mod.httpServer.address().port;

    // --- Pool: 2 peers in 1 room, test everything ---
    const rid = 't-'+Date.now();
    const p1 = await c(), p2 = await c();

    // Room + join
    await j(p1, rid, 'a'); await j(p2, rid, 'b'); p1._m.length = p2._m.length = 0;

    // Relay
    s(p1,'play',{currentTime:10}); await w(p2,'play');
    s(p1,'pause',{currentTime:20}); await w(p2,'pause');
    s(p1,'seek',{currentTime:30}); await w(p2,'seek');

    // Force Sync
    s(p1,'force_sync_prepare',{targetTime:0}); await w(p2,'force_sync_prepare');
    s(p1,'force_sync_ack',{}); await w(p2,'force_sync_ack');
    s(p1,'force_sync_execute',{}); await w(p2,'force_sync_execute');

    // EVENT_ACK
    s(p2,'event_ack',{targetId:'a',actionTimestamp:Date.now()}); await w(p1,'event_ack');

    // Lobby
    s(p1,'episode_lobby',{expectedTitle:'S01E01'}); await w(p2,'episode_lobby');

    // Leave
    s(p1,'leave_room',{}); const [ev,d]=await a(p2); assert.equal(ev,'peer_status');assert.equal(d.status,'left');

    close();
    resetConnectionRate();

    // --- Capabilities: ROOM_DATA advertises server features for client detection ---
    const capClient = await c();
    s(capClient, 'join_room', { roomId: 'cap-'+Date.now(), peerId: 'capp', protocolVersion: '1.0.0' });
    const [capEv, capData] = await a(capClient);
    assert.equal(capEv, 'room_data');
    assert.ok(Array.isArray(capData.capabilities) && capData.capabilities.includes('host-control'),
        'ROOM_DATA advertises the host-control capability');
    close();
    resetConnectionRate();

    // --- Default 'everyone' mode does NOT gate anyone (host-control OFF = unchanged) ---
    // Confirms that with host-only off, a non-host guest can still drive every
    // room-moving event exactly like before the feature existed.
    const erid = 'every-'+Date.now();
    const e1 = await c(), e2 = await c();        // e1 = creator/host, e2 = guest
    await j(e1, erid, 'ehost'); await j(e2, erid, 'eguest'); e1._m.length = e2._m.length = 0;
    s(e2,'play',{currentTime:1});                 await w(e1,'play');
    s(e2,'pause',{currentTime:2});                await w(e1,'pause');
    s(e2,'seek',{currentTime:3});                 await w(e1,'seek');
    s(e2,'force_sync_prepare',{targetTime:0});    await w(e1,'force_sync_prepare');
    s(e2,'episode_lobby',{expectedTitle:'S1E1'}); await w(e1,'episode_lobby');
    // (reaching here without a wait timeout == nothing was gated)
    close();
    resetConnectionRate();

    // --- Host Control Mode ---
    const hrid = 'host-'+Date.now();
    const h1 = await c(), h2 = await c();          // h1 = host (first joiner), h2 = guest
    await j(h1, hrid, 'host1'); await j(h2, hrid, 'guest1'); h1._m.length = h2._m.length = 0;

    // Host enables host-only -> both peers get the control_mode broadcast
    s(h1,'set_control_mode',{controlMode:'host-only'});
    await w(h1,'control_mode'); await w(h2,'control_mode');
    h1._m.length = h2._m.length = 0;

    // Guest's room-moving event (pause) is dropped -> host must NOT receive it
    s(h2,'pause',{currentTime:5});
    let guestPauseDropped = false; try { await w(h1,'pause',600); } catch { guestPauseDropped = true; }
    assert.ok(guestPauseDropped, 'guest pause dropped in host-only');

    // Host's own pause still relays to the guest
    s(h1,'pause',{currentTime:7}); await w(h2,'pause');
    h1._m.length = h2._m.length = 0;

    // desynced flag is relayed through PEER_STATUS heartbeats so the host's UI
    // can show "Solo" for guests watching on their own.
    s(h2,'peer_status',{status:'heartbeat',desynced:true,currentTime:42,playbackState:'playing'});
    let hbData = null; const hbStart = Date.now();
    while (Date.now()-hbStart < 600 && !hbData) {
        for (let i=0;i<h1._m.length;i++){ const r=h1._m[i]; if(r.startsWith('42')){ const [e,dd]=JSON.parse(r.substring(2)); if(e==='peer_status'){ h1._m.splice(i,1); hbData=dd; break; } } }
        await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(hbData && hbData.desynced === true, 'desynced=true relayed in heartbeat');
    h1._m.length = h2._m.length = 0;

    // Guest cannot change the control mode -> host must NOT receive a broadcast.
    // The rejected sender gets a unicast of the *actual* state so any optimistic
    // UI reverts (H-5); assert both halves.
    s(h2,'set_control_mode',{controlMode:'everyone'});
    let guestSetBlocked = false; try { await w(h1,'control_mode',600); } catch { guestSetBlocked = true; }
    assert.ok(guestSetBlocked, 'non-host cannot set control mode');
    let rejectSync = null; const rsStart = Date.now();
    while (Date.now()-rsStart < 600 && !rejectSync) {
        for (let i=0;i<h2._m.length;i++){ const r=h2._m[i]; if(r.startsWith('42')){ const [e,dd]=JSON.parse(r.substring(2)); if(e==='control_mode'){ h2._m.splice(i,1); rejectSync=dd; break; } } }
        await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(rejectSync && rejectSync.controlMode==='host-only' && rejectSync.hostPeerId==='host1',
        'rejected sender is re-synced to actual state');
    h1._m.length = h2._m.length = 0;

    // Host leaves -> room falls back to 'everyone' and reassigns host to the guest
    s(h1,'leave_room',{});
    let fb = null; const fbStart = Date.now();
    while (Date.now()-fbStart < 2000 && !fb) {
        for (let i=0;i<h2._m.length;i++){ const r=h2._m[i]; if(r.startsWith('42')){ const [e,dd]=JSON.parse(r.substring(2)); if(e==='control_mode'){ h2._m.splice(i,1); fb=dd; break; } } }
        await new Promise(r=>setTimeout(r,50));
    }
    assert.ok(fb && fb.controlMode==='everyone' && fb.hostPeerId==='guest1', 'host leave -> fallback everyone + new host');
    close();

    // --- M-4: rapid control-mode toggles are debounced per-room ---
    const drid = 'debounce-'+Date.now();
    const db1 = await c(), db2 = await c();
    await j(db1, drid, 'dhost'); await j(db2, drid, 'dguest'); db1._m.length = db2._m.length = 0;

    // First toggle (everyone → host-only) goes through.
    s(db1,'set_control_mode',{controlMode:'host-only'});
    await w(db1,'control_mode'); await w(db2,'control_mode');
    db1._m.length = db2._m.length = 0;

    // Immediate second toggle (host-only → everyone) should be debounced:
    // broadcast goes to neither peer, but sender gets a re-sync unicast.
    s(db1,'set_control_mode',{controlMode:'everyone'});
    let dGuestGotIt = false; try { await w(db2,'control_mode',600); } catch { dGuestGotIt = true; }
    assert.ok(dGuestGotIt, 'rapid control-mode toggle is debounced (no broadcast)');
    let dSenderResync = null; const dsStart = Date.now();
    while (Date.now()-dsStart < 600 && !dSenderResync) {
        for (let i=0;i<db1._m.length;i++){ const r=db1._m[i]; if(r.startsWith('42')){ const [e,dd]=JSON.parse(r.substring(2)); if(e==='control_mode'){ db1._m.splice(i,1); dSenderResync=dd; break; } } }
        await new Promise(r=>setTimeout(r,30));
    }
    assert.ok(dSenderResync && dSenderResync.controlMode==='host-only',
        'debounced toggle re-syncs sender to actual state');
    close();
    resetConnectionRate();

    // --- Host role survives peerId dedup (reconnect / second tab) ---
    const hdrid = 'dedup-host-'+Date.now();
    const hd1 = await c(), hd2 = await c();
    await j(hd1, hdrid, 'dhost'); await j(hd2, hdrid, 'dguest'); hd1._m.length = hd2._m.length = 0;
    s(hd1,'set_control_mode',{controlMode:'host-only'});
    await w(hd1,'control_mode'); await w(hd2,'control_mode');
    hd1._m.length = hd2._m.length = 0;
    // The host's peerId re-joins on a fresh socket → server dedupes the old socket.
    // This must NOT demote the host or reset the mode (a network blip / second tab).
    const hd3 = await c();
    s(hd3,'join_room',{roomId:hdrid,peerId:'dhost',protocolVersion:'1.0.0'});
    const hdrd = await a(hd3);
    assert.equal(hdrd[0],'room_data');
    assert.ok(hdrd[1].controlMode === 'host-only' && hdrd[1].hostPeerId === 'dhost',
        'host role + host-only mode survive peerId dedup (reconnect/second tab)');
    close();
    resetConnectionRate();

    // --- Co-Host: owner promotes a guest to controller (can drive); demote re-gates ---
    const crid = 'cohost-'+Date.now();
    const co1 = await c(), co2 = await c(), co3 = await c(); // owner / to-promote / stays guest
    await j(co1, crid, 'owner'); await j(co2, crid, 'cohost'); await j(co3, crid, 'guestx');
    co1._m.length = co2._m.length = co3._m.length = 0;
    s(co1,'set_control_mode',{controlMode:'host-only'});
    await w(co1,'control_mode'); await w(co2,'control_mode'); await w(co3,'control_mode');
    co1._m.length = co2._m.length = co3._m.length = 0;
    // before promotion the co-host is gated
    s(co2,'pause',{currentTime:1});
    let coGatedBefore=false; try { await w(co1,'pause',500); } catch { coGatedBefore=true; }
    assert.ok(coGatedBefore, 'co-host gated before promotion');
    // owner promotes co-host → controllers broadcast includes owner + cohost
    s(co1,'set_peer_role',{peerId:'cohost',controller:true});
    let promo=null; const pps=Date.now();
    while(Date.now()-pps<800 && !promo){ for(let i=0;i<co2._m.length;i++){const r=co2._m[i];if(r.startsWith('42')){const[e,dd]=JSON.parse(r.substring(2));if(e==='control_mode'){co2._m.splice(i,1);promo=dd;break;}}} await new Promise(r=>setTimeout(r,30)); }
    assert.ok(promo && Array.isArray(promo.controllers) && promo.controllers.includes('cohost') && promo.controllers.includes('owner'),
        'promotion broadcasts controllers (owner + cohost)');
    co1._m.length = co2._m.length = co3._m.length = 0;
    // promoted co-host can now drive; a plain guest still cannot
    s(co2,'pause',{currentTime:2}); await w(co1,'pause');
    s(co3,'play',{currentTime:3});
    let plainGuestGated=false; try { await w(co1,'play',500); } catch { plainGuestGated=true; }
    assert.ok(plainGuestGated, 'plain guest still gated after a co-host is promoted');
    co1._m.length = co2._m.length = co3._m.length = 0;
    // a non-owner (the co-host) cannot promote anyone
    s(co2,'set_peer_role',{peerId:'guestx',controller:true});
    let nonOwnerBlocked=false; try { await w(co3,'control_mode',500); } catch { nonOwnerBlocked=true; }
    assert.ok(nonOwnerBlocked, 'non-owner cannot promote (no room broadcast)');
    co1._m.length = co2._m.length = co3._m.length = 0;
    // owner demotes the co-host → gated again
    s(co1,'set_peer_role',{peerId:'cohost',controller:false});
    await w(co2,'control_mode');
    co1._m.length = co2._m.length = co3._m.length = 0;
    s(co2,'seek',{currentTime:4});
    let coGatedAfter=false; try { await w(co1,'seek',500); } catch { coGatedAfter=true; }
    assert.ok(coGatedAfter, 'demoted co-host is gated again');
    close();
    resetConnectionRate();

    // --- Password room ---
    const prid = 'pw-'+Date.now();
    const pw1 = await c(); await j(pw1, prid, 'admin', 's3cret');
    const pw2 = await c();
    s(pw2,'join_room',{roomId:prid,password:'BAD',peerId:'bad',protocolVersion:'1.0.0'});
    assert.equal((await a(pw2))[0],'error','wrong pw');
    const pw3 = await c();
    s(pw3,'join_room',{roomId:prid,password:'s3cret',peerId:'good',protocolVersion:'1.0.0'});
    assert.equal((await a(pw3))[0],'room_data','correct pw');
    close();

    // --- Protocol check + Ping + GET_ROOMS + Health ---
    const x = await c();
    s(x,'join_room',{roomId:'v-'+Date.now(),peerId:'old',protocolVersion:'0.0.1'});
    await w(x,'error'); // version mismatch
    x._m.length = 0;
    s(x,'ping',{t:Date.now()}); await w(x,'pong');
    await j(x,'lst-'+Date.now(),'l1');
    x._m.length = 0;
    s(x,'get_rooms',{}); await w(x,'room_list');
    close();

    // Dedup
    const did = 'dup-'+Date.now();
    const d1 = await c(), d2 = await c();
    await j(d1, did, 'dup'); d1._m.length = 0;
    s(d2,'join_room',{roomId:did,peerId:'dup',protocolVersion:'1.0.0'});
    assert.equal((await a(d2))[0],'room_data','dedup');
    close();

    // Health HTTP (no conn needed)
    const [st,body] = await new Promise(r => http.get(`http://127.0.0.1:${port}/`, res => {
        let d=''; res.on('data',c=>d+=c); res.on('end',()=>r([res.statusCode,JSON.parse(d)])); }));
    assert.equal(st,200); assert.equal(body.status,'online');

    console.log('All WebSocket integration tests passed (incl. host control mode)');
} catch(e) {
    console.error('FAILED:', e.message);
    process.exitCode=1;
} finally {
    close();
    if (mod?.stopServerForTests) await mod.stopServerForTests();
}
