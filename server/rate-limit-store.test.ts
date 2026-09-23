import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer, type AddressInfo } from 'node:net';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { closeRateLimitStore, initRateLimitStore, rateLimitBackend, rateLimitStore } from './rate-limit-store';

const hasRedisServer = spawnSync('redis-server', ['--version']).status === 0;

async function freePort() {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function startInstance(limit: number) {
  const app = express();
  app.get('/', rateLimit({ windowMs: 60_000, limit, store: rateLimitStore('shared-test'), passOnStoreError: true }), (_req, res) => { res.send('ok'); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('without REDIS_URL the limiter keeps its in-memory default', async () => {
  assert.equal(await initRateLimitStore(''), 'memory');
  assert.equal(rateLimitBackend(), 'memory');
  assert.equal(rateLimitStore('any'), undefined);
});

test('an unreachable Redis does not block boot and falls back to memory', async () => {
  process.env.REDIS_CONNECT_TIMEOUT_MS = '500';
  const started = Date.now();
  assert.equal(await initRateLimitStore(`redis://127.0.0.1:${await freePort()}`), 'memory');
  assert.ok(Date.now() - started < 3_000, 'boot must not wait on a dead Redis');
  assert.equal(rateLimitStore('any'), undefined);
});

test('Redis shares one budget across instances and degrades safely when it dies', { skip: !hasRedisServer && 'redis-server not installed' }, async () => {
  const port = await freePort();
  const redis = spawn('redis-server', ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' });
  try {
    let backend: string = 'memory';
    for (let attempt = 0; attempt < 20 && backend !== 'redis'; attempt++) {
      backend = await initRateLimitStore(`redis://127.0.0.1:${port}`);
      if (backend !== 'redis') await new Promise(resolve => setTimeout(resolve, 150));
    }
    assert.equal(backend, 'redis');

    // Two "instances" with separate limiter objects: the budget of 3 is shared, not 3 each.
    const a = await startInstance(3);
    const b = await startInstance(3);
    try {
      const statuses = [];
      for (const url of [a.url, b.url, a.url, b.url]) statuses.push((await fetch(url)).status);
      assert.deepEqual(statuses, [200, 200, 200, 429]);

      // Redis goes away: requests are still served promptly, now limited per instance.
      redis.kill('SIGKILL');
      await new Promise(resolve => redis.once('exit', resolve));
      const started = Date.now();
      const degraded = await fetch(a.url);
      assert.equal(degraded.status, 200);
      assert.ok(Date.now() - started < 2_000, 'a dead Redis must not hold requests open');
    } finally {
      await a.close();
      await b.close();
    }
  } finally {
    if (redis.exitCode === null) redis.kill('SIGKILL');
    await closeRateLimitStore();
  }
});
