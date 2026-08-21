import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface SecureObjectReceipt {
  objectKey: string;
  plaintextSha256: string;
  ciphertextSha256: string;
  kmsKey: string;
  storageProvider: 'GCS' | 'LOCAL_DEV';
}

interface EncryptedEnvelope {
  v: 1;
  alg: 'A256GCM';
  aad: string;
  iv: string;
  tag: string;
  wrappedKey: string;
  ciphertext: string;
  plaintextSha256: string;
  createdAt: string;
}

const metadataTokenUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function googleAccessToken() {
  const override = process.env.GOOGLE_OAUTH_ACCESS_TOKEN?.trim();
  if (override) return override;
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60_000) return cachedToken.value;
  const response = await fetch(metadataTokenUrl, {
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(2_500)
  });
  if (!response.ok) throw new Error(`GOOGLE_METADATA_TOKEN_FAILED_${response.status}`);
  const payload = await response.json() as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('GOOGLE_METADATA_TOKEN_MISSING');
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in || 300)) * 1000
  };
  return cachedToken.value;
}

function cleanObjectKey(value: string) {
  const normalized = value.replace(/[^a-zA-Z0-9/_-]/g, '_').replace(/\/{2,}/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || normalized.length > 500) throw new Error('INVALID_OBJECT_KEY');
  return normalized;
}

function kmsKeyName() {
  const key = process.env.GCP_KMS_KEY_NAME?.trim() || '';
  if (!/^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(key)) {
    throw new Error('GCP_KMS_KEY_NAME_NOT_CONFIGURED');
  }
  return key;
}

async function kmsEncrypt(key: Buffer) {
  const keyName = kmsKeyName();
  const token = await googleAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:encrypt`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ plaintext: key.toString('base64') }),
    signal: AbortSignal.timeout(10_000)
  });
  const payload = await response.json() as { ciphertext?: string; error?: { message?: string } };
  if (!response.ok || !payload.ciphertext) throw new Error(`KMS_ENCRYPT_FAILED_${response.status}`);
  return payload.ciphertext;
}

async function kmsDecrypt(wrappedKey: string) {
  const keyName = kmsKeyName();
  const token = await googleAccessToken();
  const response = await fetch(`https://cloudkms.googleapis.com/v1/${keyName}:decrypt`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ciphertext: wrappedKey }),
    signal: AbortSignal.timeout(10_000)
  });
  const payload = await response.json() as { plaintext?: string };
  if (!response.ok || !payload.plaintext) throw new Error(`KMS_DECRYPT_FAILED_${response.status}`);
  return Buffer.from(payload.plaintext, 'base64');
}

async function putGcsObject(objectKey: string, bytes: Buffer) {
  const bucket = process.env.GCS_SECURE_BUCKET?.trim();
  if (!bucket) throw new Error('GCS_SECURE_BUCKET_NOT_CONFIGURED');
  const token = await googleAccessToken();
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(objectKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/octet-stream'
    },
    body: bytes,
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`GCS_UPLOAD_FAILED_${response.status}`);
}

async function getGcsObject(objectKey: string) {
  const bucket = process.env.GCS_SECURE_BUCKET?.trim();
  if (!bucket) throw new Error('GCS_SECURE_BUCKET_NOT_CONFIGURED');
  const token = await googleAccessToken();
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectKey)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`GCS_DOWNLOAD_FAILED_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function putLocalDevObject(objectKey: string, bytes: Buffer) {
  const root = path.resolve(process.env.MAJAL_LOCAL_VAULT_DIR || path.join(process.cwd(), 'var', 'vault'));
  const target = path.resolve(root, objectKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('LOCAL_VAULT_PATH_ESCAPE');
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, bytes, { mode: 0o600 });
}

async function getLocalDevObject(objectKey: string) {
  const root = path.resolve(process.env.MAJAL_LOCAL_VAULT_DIR || path.join(process.cwd(), 'var', 'vault'));
  const target = path.resolve(root, objectKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('LOCAL_VAULT_PATH_ESCAPE');
  return fs.readFile(target);
}


async function deleteGcsObject(objectKey: string) {
  const bucket = process.env.GCS_SECURE_BUCKET?.trim();
  if (!bucket) throw new Error('GCS_SECURE_BUCKET_NOT_CONFIGURED');
  const token = await googleAccessToken();
  const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectKey)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok && response.status !== 404) throw new Error(`GCS_DELETE_FAILED_${response.status}`);
}

async function deleteLocalDevObject(objectKey: string) {
  const root = path.resolve(process.env.MAJAL_LOCAL_VAULT_DIR || path.join(process.cwd(), 'var', 'vault'));
  const target = path.resolve(root, objectKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('LOCAL_VAULT_PATH_ESCAPE');
  await fs.rm(target, { force: true });
}

export function secureStorageReadiness() {
  const production = process.env.NODE_ENV === 'production';
  const bucket = Boolean(process.env.GCS_SECURE_BUCKET?.trim());
  const kms = Boolean(process.env.GCP_KMS_KEY_NAME?.trim());
  return {
    configured: production ? bucket && kms : true,
    provider: production ? 'GCS+KMS' : bucket && kms ? 'GCS+KMS' : 'LOCAL_DEV',
    missing: [!bucket && production ? 'GCS_SECURE_BUCKET' : null, !kms && production ? 'GCP_KMS_KEY_NAME' : null].filter(Boolean)
  };
}

export async function putEncryptedJson(scope: string, entityId: string, value: unknown): Promise<SecureObjectReceipt> {
  const objectKey = cleanObjectKey(`vault/${scope}/${entityId}/${Date.now()}-${randomBytes(8).toString('hex')}.json.enc`);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  if (plaintext.length > 2 * 1024 * 1024) throw new Error('SECURE_OBJECT_TOO_LARGE');
  const plaintextSha256 = createHash('sha256').update(plaintext).digest('hex');
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const aad = `MAJAL:${scope}:${entityId}:v1`;
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const production = process.env.NODE_ENV === 'production';
  const usingCloud = Boolean(process.env.GCS_SECURE_BUCKET?.trim() && process.env.GCP_KMS_KEY_NAME?.trim());
  if (production && !usingCloud) throw new Error('SECURE_STORAGE_NOT_CONFIGURED');
  const wrappedKey = usingCloud ? await kmsEncrypt(dataKey) : dataKey.toString('base64');
  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: 'A256GCM',
    aad,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    wrappedKey,
    ciphertext: ciphertext.toString('base64'),
    plaintextSha256,
    createdAt: new Date().toISOString()
  };
  const bytes = Buffer.from(JSON.stringify(envelope), 'utf8');
  if (usingCloud) await putGcsObject(objectKey, bytes);
  else await putLocalDevObject(objectKey, bytes);
  return {
    objectKey,
    plaintextSha256,
    ciphertextSha256: createHash('sha256').update(bytes).digest('hex'),
    kmsKey: usingCloud ? kmsKeyName() : 'LOCAL_DEV_KEY',
    storageProvider: usingCloud ? 'GCS' : 'LOCAL_DEV'
  };
}

export async function getEncryptedJson<T>(objectKey: string, scope: string, entityId: string): Promise<T> {
  const key = cleanObjectKey(objectKey);
  const usingCloud = Boolean(process.env.GCS_SECURE_BUCKET?.trim() && process.env.GCP_KMS_KEY_NAME?.trim());
  const bytes = usingCloud ? await getGcsObject(key) : await getLocalDevObject(key);
  const envelope = JSON.parse(bytes.toString('utf8')) as EncryptedEnvelope;
  const expectedAad = `MAJAL:${scope}:${entityId}:v1`;
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM' || envelope.aad !== expectedAad) throw new Error('SECURE_OBJECT_AAD_MISMATCH');
  const dataKey = usingCloud ? await kmsDecrypt(envelope.wrappedKey) : Buffer.from(envelope.wrappedKey, 'base64');
  if (dataKey.length !== 32) throw new Error('SECURE_OBJECT_KEY_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from(envelope.aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64')), decipher.final()]);
  const actualHash = createHash('sha256').update(plaintext).digest('hex');
  if (actualHash !== envelope.plaintextSha256) throw new Error('SECURE_OBJECT_HASH_MISMATCH');
  return JSON.parse(plaintext.toString('utf8')) as T;
}


export async function deleteEncryptedObject(objectKey: string) {
  const key = cleanObjectKey(objectKey);
  const usingCloud = Boolean(process.env.GCS_SECURE_BUCKET?.trim() && process.env.GCP_KMS_KEY_NAME?.trim());
  if (process.env.NODE_ENV === 'production' && !usingCloud) throw new Error('SECURE_STORAGE_NOT_CONFIGURED');
  if (usingCloud) await deleteGcsObject(key);
  else await deleteLocalDevObject(key);
}
