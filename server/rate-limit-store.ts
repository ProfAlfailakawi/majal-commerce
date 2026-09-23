import { MemoryStore, type ClientRateLimitInfo, type IncrementResponse, type Options, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { structuredLog } from './observability';

/**
 * Shared rate-limit counters across Cloud Run instances.
 *
 * With REDIS_URL set, every limiter counts in Redis, so a client cannot multiply its budget
 * by landing on different instances. Without it (local/dev, or a single instance) counters
 * stay in memory, exactly as before.
 *
 * Redis is an availability dependency we refuse to let take the site down:
 *   - boot waits at most REDIS_CONNECT_TIMEOUT_MS, then serves with per-instance limits;
 *   - each command is bounded (REDIS_COMMAND_TIMEOUT_MS) and never queued while offline;
 *   - a failing command falls back to that instance's in-memory counter for the request,
 *     so limits degrade to per-instance instead of disappearing. Errors are logged at most
 *     once a minute, which is what the monitoring alert keys on.
 */

type RedisClient = ReturnType<typeof createClient>;
let client: RedisClient | null = null;

export type RateLimitBackend = 'redis' | 'memory';

const COMMAND_TIMEOUT_MS = Number(process.env.REDIS_COMMAND_TIMEOUT_MS) > 0 ? Number(process.env.REDIS_COMMAND_TIMEOUT_MS) : 750;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let lastDegradedLog = 0;
function logDegraded(scope: string, error: unknown) {
  const now = Date.now();
  if (now - lastDegradedLog < 60_000) return;
  lastDegradedLog = now;
  structuredLog('ERROR', 'rate_limit_store_degraded', { scope, fallback: 'memory', error: errorMessage(error) });
}

export async function initRateLimitStore(url = process.env.REDIS_URL?.trim()): Promise<RateLimitBackend> {
  if (!url) return 'memory';
  const connectTimeout = Number(process.env.REDIS_CONNECT_TIMEOUT_MS) > 0 ? Number(process.env.REDIS_CONNECT_TIMEOUT_MS) : 5_000;
  const candidate: RedisClient = createClient({
    url,
    // Fail fast while disconnected instead of queueing: a queued command would hold the
    // HTTP request open for as long as Redis is away.
    disableOfflineQueue: true,
    socket: { connectTimeout, reconnectStrategy: retries => Math.min(200 * (retries + 1), 5_000) }
  });
  let lastErrorLog = 0;
  candidate.on('error', error => {
    const now = Date.now();
    if (now - lastErrorLog < 60_000) return;
    lastErrorLog = now;
    structuredLog('ERROR', 'redis_error', { error: errorMessage(error) });
  });
  try {
    await withTimeout(candidate.connect(), connectTimeout, 'redis connect');
    client = candidate;
    structuredLog('INFO', 'rate_limit_store', { backend: 'redis' });
    return 'redis';
  } catch (error) {
    structuredLog('CRITICAL', 'rate_limit_store_unavailable', { backend: 'memory', error: errorMessage(error) });
    await candidate.disconnect().catch(() => undefined);
    return 'memory';
  }
}

export function rateLimitBackend(): RateLimitBackend {
  return client ? 'redis' : 'memory';
}

/** Redis-backed store with a per-instance in-memory fallback; undefined means "use the default memory store". */
export function rateLimitStore(scope: string): Store | undefined {
  if (!client) return undefined;
  const redis = client;
  const primary = new RedisStore({
    prefix: `majal:rl:${scope}:`,
    sendCommand: (...args: string[]) => withTimeout(redis.sendCommand(args), COMMAND_TIMEOUT_MS, 'redis command')
  });
  return new FallbackStore(primary, new MemoryStore(), scope);
}

export async function closeRateLimitStore() {
  const current = client;
  client = null;
  if (!current) return;
  // quit() needs a live connection to send QUIT and would never settle while Redis is
  // down; disconnect() also stops the reconnect loop.
  const closing = current.isReady ? current.quit() : current.disconnect();
  await withTimeout(Promise.resolve(closing), 2_000, 'redis close').catch(() => current.disconnect().catch(() => undefined));
}

class FallbackStore implements Store {
  // Counts are shared across instances while Redis is healthy.
  localKeys = false;

  constructor(private readonly primary: Store, private readonly fallback: MemoryStore, private readonly scope: string) {}

  init(options: Options) {
    this.primary.init?.(options);
    this.fallback.init(options);
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      return await this.primary.get?.(key);
    } catch (error) {
      logDegraded(this.scope, error);
      return this.fallback.get(key);
    }
  }

  async increment(key: string): Promise<IncrementResponse> {
    try {
      return await this.primary.increment(key);
    } catch (error) {
      logDegraded(this.scope, error);
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string) {
    try {
      await this.primary.decrement(key);
    } catch (error) {
      logDegraded(this.scope, error);
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string) {
    await Promise.allSettled([this.primary.resetKey(key), this.fallback.resetKey(key)]);
  }

  shutdown() {
    this.fallback.shutdown();
  }
}
