import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { openTestDatabase } from './test-db';
import { createOrCoalesceNotification } from './notifications';
import {
  apnsPayload, apnsProviderToken, createApnsSender, notificationUrl, pushToUser, registerNativeToken, setApnsSender,
  type ApnsClientLike, type ApnsConnect
} from './apns-push';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const env = { APNS_KEY_P8: keyPem, APNS_KEY_ID: 'KEY1234567', APNS_TEAM_ID: 'TEAM123456', APNS_TOPIC: 'com.dralfailakawi.majal' };
const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);

type Sent = { headers: Record<string, string>; body: string };
/** Mocked HTTP/2: answers each token with a scripted status/reason; never touches the network. */
function mockConnect(answers: Record<string, { status: number; reason?: string }>, sent: Sent[]): ApnsConnect {
  return () => {
    const client = new EventEmitter() as EventEmitter & ApnsClientLike;
    client.close = () => undefined;
    client.request = (headers: Record<string, string>) => {
      const req = new EventEmitter() as EventEmitter & { end(body?: string): void; setEncoding(): void };
      req.setEncoding = () => undefined;
      req.end = (body?: string) => {
        sent.push({ headers, body: body || '' });
        const token = headers[':path'].split('/').pop() as string;
        const answer = answers[token] || { status: 200 };
        setImmediate(() => {
          req.emit('response', { ':status': answer.status });
          if (answer.reason) req.emit('data', JSON.stringify({ reason: answer.reason }));
          req.emit('end');
        });
      };
      return req;
    };
    return client;
  };
}

test('provider JWT is ES256, carries kid/iss/iat and verifies with the public key', () => {
  const jwt = apnsProviderToken({ key: keyPem, keyId: env.APNS_KEY_ID, teamId: env.APNS_TEAM_ID }, 1_700_000_000);
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'ES256', kid: 'KEY1234567' });
  assert.deepEqual(JSON.parse(Buffer.from(p, 'base64url').toString()), { iss: 'TEAM123456', iat: 1_700_000_000 });
  assert.equal(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true);
});

test('any missing APNS_* variable makes the sender a silent no-op', async () => {
  for (const name of Object.keys(env)) {
    const sent: Sent[] = [];
    const partial: Record<string, string | undefined> = { ...env, [name]: '' };
    const sender = createApnsSender({ env: () => partial, connect: mockConnect({}, sent) });
    assert.equal(sender.configured(), false);
    const result = await sender.send(tokenA, { title: 't' });
    assert.equal(result.skipped, true);
    assert.equal(sent.length, 0);
  }
});

test('payload carries the target url and headers carry topic and bearer token', async () => {
  const sent: Sent[] = [];
  const sender = createApnsSender({ env: () => env, connect: mockConnect({}, sent) });
  const result = await sender.send(tokenA, { title: 'طلب جديد', body: 'وصل طلب', url: notificationUrl('HOST', 'ntf_1') });
  assert.equal(result.ok, true);
  assert.equal(sent[0].headers['apns-topic'], 'com.dralfailakawi.majal');
  assert.equal(sent[0].headers[':path'], `/3/device/${tokenA}`);
  assert.match(sent[0].headers.authorization, /^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  const body = JSON.parse(sent[0].body);
  assert.equal(body.url, '/?surface=HOST&notification=ntf_1');
  assert.equal(body.aps.alert.title, 'طلب جديد');
  assert.equal(apnsPayload({ title: 'x' }).includes('"url"'), false);
  assert.equal(notificationUrl('NOT_A_SURFACE'), '/');
});

test('tokens answered 410, BadDeviceToken or Unregistered are dropped; others kept', async () => {
  const db = await openTestDatabase();
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u1','User','u1@apns.test','','CONSUMER','ACTIVE','h','s',?,?)").run(now, now);
  const tokenC = 'c'.repeat(64);
  const tokenD = 'd'.repeat(64);
  for (const t of [tokenA, tokenB, tokenC, tokenD]) assert.equal(await registerNativeToken(db, 'u1', t), true);
  assert.equal(await registerNativeToken(db, 'u1', 'not-hex'), false);
  const sent: Sent[] = [];
  setApnsSender(createApnsSender({ env: () => env, connect: mockConnect({
    [tokenA]: { status: 410, reason: 'Unregistered' },
    [tokenB]: { status: 400, reason: 'BadDeviceToken' },
    [tokenC]: { status: 410 },
    [tokenD]: { status: 200 }
  }, sent) }));
  try {
    const result = await pushToUser(db, 'u1', { title: 'x', url: '/' });
    assert.deepEqual({ sent: result.sent, dropped: result.dropped }, { sent: 1, dropped: 3 });
    const left = await db.prepare('SELECT token FROM apns_device_tokens').all<{ token: string }>();
    assert.deepEqual(left.map(r => r.token), [tokenD]);
  } finally {
    setApnsSender(null);
    await db.close();
  }
});

test('a new personal notification also pushes to the user device with its url', async () => {
  const db = await openTestDatabase();
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO users(id,name,email,phone,role,status,password_hash,password_salt,created_at,updated_at) VALUES('u2','User','u2@apns.test','','CONSUMER','ACTIVE','h','s',?,?)").run(now, now);
  await registerNativeToken(db, 'u2', tokenA);
  const sent: Sent[] = [];
  setApnsSender(createApnsSender({ env: () => env, connect: mockConnect({}, sent) }));
  try {
    const created = await createOrCoalesceNotification(db, { userId: 'u2', category: 'ORDER', priority: 'NOW', title: 'تغيّرت حالة طلبك', body: 'طلبك جاهز', actionSurface: 'CONSUMER', dedupeKey: 'order:1' });
    for (let i = 0; i < 50 && !sent.length; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(sent.length, 1);
    assert.equal(JSON.parse(sent[0].body).url, `/?surface=CONSUMER&notification=${created.id}`);
    await createOrCoalesceNotification(db, { userId: 'u2', category: 'ORDER', priority: 'NOW', title: 'x', body: 'y', dedupeKey: 'order:1' });
    await new Promise(r => setTimeout(r, 30));
    assert.equal(sent.length, 1, 'a coalesced repeat does not push again');
  } finally {
    setApnsSender(null);
    await db.close();
  }
});
