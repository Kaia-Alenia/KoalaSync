import assert from 'node:assert/strict';
import {
  buildHealthPayload,
  checkCooldown,
  isAdminMetricsAuthorized
} from '../server/ops.js';

const missingAuth = isAdminMetricsAuthorized(undefined, 'secret-token');
assert.equal(missingAuth, false, 'missing Authorization header must not authorize metrics');

const wrongAuth = isAdminMetricsAuthorized('Bearer wrong-token', 'secret-token');
assert.equal(wrongAuth, false, 'wrong bearer token must not authorize metrics');

const correctAuth = isAdminMetricsAuthorized('Bearer secret-token', 'secret-token');
assert.equal(correctAuth, true, 'correct bearer token should authorize metrics');

const disabledAuth = isAdminMetricsAuthorized('Bearer secret-token', '');
assert.equal(disabledAuth, false, 'empty admin token disables admin metrics');

const cooldowns = new Map();
assert.equal(checkCooldown(cooldowns, 'socket-1', 10_000, 100_000), true, 'first cooldown check passes');
assert.equal(checkCooldown(cooldowns, 'socket-1', 10_000, 105_000), false, 'second cooldown check inside window fails');
assert.equal(checkCooldown(cooldowns, 'socket-1', 10_000, 110_000), true, 'cooldown check after window passes');

const roomA = { peers: new Set(['a', 'b']), activeLobby: null };
const roomB = { peers: new Set(['c', 'd', 'e']), activeLobby: { expectedTitle: 'Episode 2' } };
const rooms = new Map([['room-a', roomA], ['room-b', roomB]]);

const basicHealth = buildHealthPayload({
  rooms,
  connections: 5,
  includeMetrics: false,
  now: 1234,
  uptime: 99,
  memoryUsage: () => ({ rss: 10, heapUsed: 5, heapTotal: 8 }),
  rateLimitSizes: { connections: 1, events: 2, health: 3, authFailures: 4, roomList: 5 }
});

assert.deepEqual(
  Object.keys(basicHealth).sort(),
  ['connections', 'rooms', 'status', 'timestamp', 'uptime'].sort(),
  'basic health should not expose extended metrics'
);

const adminHealth = buildHealthPayload({
  rooms,
  connections: 5,
  includeMetrics: true,
  now: 1234,
  uptime: 99,
  memoryUsage: () => ({ rss: 10, heapUsed: 5, heapTotal: 8 }),
  rateLimitSizes: { connections: 1, events: 2, health: 3, authFailures: 4, roomList: 5 }
});

assert.equal(adminHealth.peers, 5, 'admin metrics should include aggregate peer count');
assert.equal(adminHealth.roomsWithLobby, 1, 'admin metrics should count active lobbies');
assert.equal(adminHealth.avgPeersPerRoom, 2.5, 'admin metrics should include average room size');
assert.equal(adminHealth.maxPeersInRoom, 3, 'admin metrics should include max room size');
assert.deepEqual(adminHealth.memory, { rss: 10, heapUsed: 5, heapTotal: 8 }, 'admin metrics should expose process memory');
assert.deepEqual(
  adminHealth.rateLimitEntries,
  { connections: 1, events: 2, health: 3, authFailures: 4, roomList: 5 },
  'admin metrics should expose aggregate rate-limit map sizes'
);

console.log('server ops tests passed');
