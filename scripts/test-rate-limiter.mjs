import assert from 'node:assert/strict';
import {
    checkConnectionRate,
    checkEventRate,
    checkHealthRate,
    checkAdminMetricsAuthRate,
    checkLeaveRoomRate,
    checkAuthRate,
    recordAuthFailure,
    clearRateLimitMaps,
    connectionCounts,
    failedAuthAttempts,
    eventCounts,
    healthCounts,
    adminMetricsAuthCounts,
    roomListCooldowns,
    leaveRoomCounts,
    rateLimitDenied,
    startRateLimitCleanup,
    stopRateLimitCleanup,
    CONNECTION_RATE_LIMIT,
    EVENT_RATE_LIMIT,
    LEAVE_ROOM_RATE_LIMIT
} from '../server/rate-limiter.js';

// Helper: mock io for cleanup
const mockIo = { sockets: { sockets: new Map() } };

// Reset state before each test group
function reset() {
    clearRateLimitMaps();
    Object.assign(rateLimitDenied, { connections: 0, events: 0, health: 0, adminMetricsAuth: 0, roomList: 0, leaveRoom: 0 });
    stopRateLimitCleanup();
}

// --- checkConnectionRate ---
reset();
assert.equal(checkConnectionRate('1.1.1.1'), true, 'first connection allowed');
// Exhaust the rest of the budget (first call above counted as 1).
for (let i = 0; i < CONNECTION_RATE_LIMIT - 1; i++) checkConnectionRate('1.1.1.1');
assert.equal(checkConnectionRate('1.1.1.1'), false, `connection beyond ${CONNECTION_RATE_LIMIT}/window blocked`);
assert.equal(rateLimitDenied.connections, 1, 'denial counter incremented');

reset();
assert.equal(checkConnectionRate('2.2.2.2'), true, 'separate IP independent');

// --- checkEventRate ---
reset();
assert.equal(checkEventRate('sock1'), true, 'first event allowed');
// Exhaust the rest of the budget (first call above counted as 1).
for (let i = 0; i < EVENT_RATE_LIMIT - 1; i++) checkEventRate('sock1');
assert.equal(checkEventRate('sock1'), false, `event beyond ${EVENT_RATE_LIMIT}/window blocked`);
assert.equal(rateLimitDenied.events, 1);

reset();
assert.equal(checkEventRate('sock2'), true, 'separate socket independent');

// --- checkLeaveRoomRate ---
reset();
assert.equal(checkLeaveRoomRate('sock-leave-1'), true, 'first leave-room event allowed');
for (let i = 0; i < LEAVE_ROOM_RATE_LIMIT - 1; i++) checkLeaveRoomRate('sock-leave-1');
assert.equal(checkLeaveRoomRate('sock-leave-1'), false, `leave-room beyond ${LEAVE_ROOM_RATE_LIMIT}/window blocked`);
assert.equal(rateLimitDenied.leaveRoom, 1);

reset();
assert.equal(checkLeaveRoomRate('sock-leave-2'), true, 'separate leave-room socket independent');

// --- checkHealthRate ---
reset();
assert.equal(checkHealthRate('1.2.3.4'), true, 'first health check allowed');
for (let i = 0; i < 9; i++) checkHealthRate('1.2.3.4');
assert.equal(checkHealthRate('1.2.3.4'), false, '11th health check blocked');
assert.equal(rateLimitDenied.health, 1);

// --- checkAdminMetricsAuthRate ---
reset();
assert.equal(checkAdminMetricsAuthRate('5.6.7.8'), true, 'first admin auth allowed');
for (let i = 0; i < 4; i++) checkAdminMetricsAuthRate('5.6.7.8');
assert.equal(checkAdminMetricsAuthRate('5.6.7.8'), false, '6th admin auth blocked');
assert.equal(rateLimitDenied.adminMetricsAuth, 1);

// --- checkAuthRate ---
reset();
assert.equal(checkAuthRate('10.0.0.1', 'room-a'), true, 'first auth attempt allowed');
for (let i = 0; i < 5; i++) recordAuthFailure('10.0.0.1', 'room-a');
assert.equal(checkAuthRate('10.0.0.1', 'room-a'), false, '6th auth attempt blocked');
assert.equal(checkAuthRate('10.0.0.1', 'room-b'), true, 'different room not blocked');

// --- recordAuthFailure ---
reset();
recordAuthFailure('10.0.0.2', 'room-x');
assert.equal(failedAuthAttempts.size, 1, 'failure recorded');
const record = failedAuthAttempts.get('10.0.0.2:room-x');
assert.equal(record.count, 1, 'count incremented');
assert.ok(record.lastAttempt <= Date.now(), 'timestamp set');

recordAuthFailure('10.0.0.2', 'room-x');
assert.equal(failedAuthAttempts.get('10.0.0.2:room-x').count, 2, 'count increments on repeat');

// --- clearRateLimitMaps ---
reset();
connectionCounts.set('ip1', { count: 1, resetTime: Date.now() + 60000 });
eventCounts.set('sock1', { count: 1, resetTime: Date.now() + 10000 });
healthCounts.set('ip2', { count: 1, resetTime: Date.now() + 60000 });
adminMetricsAuthCounts.set('ip3', { count: 1, resetTime: Date.now() + 60000 });
roomListCooldowns.set('sock2', Date.now());
leaveRoomCounts.set('sock3', { count: 1, resetTime: Date.now() + 60000 });
clearRateLimitMaps();
assert.equal(connectionCounts.size, 0, 'connectionCounts cleared');
assert.equal(eventCounts.size, 0, 'eventCounts cleared');
assert.equal(healthCounts.size, 0, 'healthCounts cleared');
assert.equal(adminMetricsAuthCounts.size, 0, 'adminMetricsAuthCounts cleared');
assert.equal(roomListCooldowns.size, 0, 'roomListCooldowns cleared');
assert.equal(leaveRoomCounts.size, 0, 'leaveRoomCounts cleared');

// --- startRateLimitCleanup / stopRateLimitCleanup ---
reset();
startRateLimitCleanup(mockIo);
startRateLimitCleanup(mockIo); // double-start guard
stopRateLimitCleanup();
assert.ok(true, 'cleanup start/stop does not throw');

// --- rateLimitDenied reset ---
reset();
rateLimitDenied.connections = 5;
rateLimitDenied.leaveRoom = 5;
Object.assign(rateLimitDenied, { connections: 0, events: 0, health: 0, adminMetricsAuth: 0, roomList: 0, leaveRoom: 0 });
assert.equal(rateLimitDenied.connections, 0, 'denial counter resettable');
assert.equal(rateLimitDenied.leaveRoom, 0, 'leave-room denial counter resettable');

console.log('rate-limiter tests passed');
