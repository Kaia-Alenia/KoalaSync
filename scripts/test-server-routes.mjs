import assert from 'node:assert/strict';

// Must set env before dynamic import — ESM hoists static imports
process.env.ADMIN_METRICS_TOKEN = process.env.ADMIN_METRICS_TOKEN || 'test-admin-token-with-more-than-32-chars';
const {
  ADMIN_METRICS_AUTH_RATE_LIMIT_PER_MINUTE,
  HEALTH_RATE_LIMIT_PER_MINUTE,
  healthCounts,
  adminMetricsAuthCounts,
  healthResponseCache,
  httpServer,
  rooms,
  startServer,
  stopServerForTests
} = await import('../server/index.js');

const adminToken = process.env.ADMIN_METRICS_TOKEN;
const baseHeaders = { 'x-forwarded-for': '203.0.113.10' };

function url(path) {
  const address = httpServer.address();
  return `http://127.0.0.1:${address.port}${path}`;
}

async function request(path, options = {}) {
  return fetch(url(path), {
    ...options,
    headers: {
      ...baseHeaders,
      ...(options.headers || {})
    }
  });
}

try {
  await startServer(0, '127.0.0.1');

  let res = await request('/');
  assert.equal(res.status, 200, 'root health endpoint should respond');
  assert.equal(res.headers.get('cache-control'), 'no-store', 'root response should disable HTTP caching');
  assert.deepEqual(await res.json(), { status: 'online', service: 'KoalaSync Relay' });

  res = await request('/health');
  assert.equal(res.status, 200, 'basic health endpoint should respond');
  assert.equal(res.headers.get('cache-control'), 'no-store', 'basic health response should disable HTTP caching');
  const basicHealth = await res.json();
  assert.equal(basicHealth.status, 'ok', 'basic health should report ok');
  assert.equal(basicHealth.rooms, 0, 'basic health should include room count');
  assert.equal('peers' in basicHealth, false, 'basic health should not expose admin metrics');
  assert.equal('memory' in basicHealth, false, 'basic health should not expose memory metrics');

  rooms.set('route-test-room', {
    peers: new Set(['socket-a', 'socket-b']),
    peerData: new Map(),
    peerIds: new Map(),
    activeLobby: { expectedTitle: 'Episode 1', initiatorPeerId: 'peer-a', readyPeers: ['peer-a'] }
  });
  healthResponseCache.clear();
  healthCounts.clear();

  res = await request('/health', {
    headers: { authorization: `Bearer ${adminToken}`, 'x-forwarded-for': '203.0.113.20' }
  });
  assert.equal(res.status, 200, 'authorized admin health endpoint should respond');
  const adminHealth = await res.json();
  assert.equal(adminHealth.rooms, 1, 'admin health should include room count');
  assert.equal(adminHealth.peers, 2, 'admin health should include aggregate peer count');
  assert.equal(adminHealth.roomsWithLobby, 1, 'admin health should include aggregate lobby count');
  assert.equal(typeof adminHealth.memory?.rss, 'number', 'admin health should include aggregate memory metrics');
  assert.equal('route-test-room' in adminHealth, false, 'admin health should not expose room identifiers');

  healthCounts.clear();
  adminMetricsAuthCounts.clear();
  for (let i = 0; i < ADMIN_METRICS_AUTH_RATE_LIMIT_PER_MINUTE; i++) {
    res = await request('/health', {
      headers: { authorization: 'Bearer wrong-token', 'x-forwarded-for': '203.0.113.30' }
    });
    assert.equal(res.status, 200, `wrong admin bearer attempt ${i + 1} should still return basic health`);
  }
  res = await request('/health', {
    headers: { authorization: 'Bearer wrong-token', 'x-forwarded-for': '203.0.113.30' }
  });
  assert.equal(res.status, 429, 'wrong admin bearer attempts should be throttled after the limit');

  healthCounts.clear();
  for (let i = 0; i < HEALTH_RATE_LIMIT_PER_MINUTE; i++) {
    const path = i % 2 === 0 ? '/' : '/health';
    res = await request(path, { headers: { 'x-forwarded-for': '203.0.113.40' } });
    assert.equal(res.status, 200, `shared health request ${i + 1} should be allowed`);
  }
  res = await request('/', { headers: { 'x-forwarded-for': '203.0.113.40' } });
  assert.equal(res.status, 429, 'root and health should share the public health rate limit');

  console.log('server route tests passed');
} finally {
  await stopServerForTests();
}
