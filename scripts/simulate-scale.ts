import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { openMajalDatabase, withTransaction } from '../server/database';

const positiveInteger = (value: string | undefined, fallback: number, maximum: number) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
};

const catalogRows = positiveInteger(process.env.SCALE_CATALOG_ROWS, 1_000_000, 20_000_000);
const eventRows = positiveInteger(process.env.SCALE_EVENT_ROWS, 2_000_000, 50_000_000);
const tenantCount = positiveInteger(process.env.SCALE_TENANTS, 10_000, 1_000_000);
const querySamples = positiveInteger(process.env.SCALE_QUERY_SAMPLES, 300, 10_000);
const batchSize = positiveInteger(process.env.SCALE_INSERT_BATCH, 50_000, 500_000);
const keepDatabase = process.env.SCALE_KEEP_DATABASE === 'true';
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'majal-scale-'));
const databasePath = path.join(temporaryDirectory, 'scale.sqlite');
const categories = ['BAKERY', 'DESSERT', 'SAUCE', 'MEAL', 'BEVERAGE', 'RETAIL'];
const statuses = ['LIVE', 'LIVE', 'LIVE', 'REVIEW', 'PAUSED'] as const;
const eventTypes = ['CREATED', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED'] as const;
const baseTime = Date.UTC(2026, 7, 20, 12, 0, 0);

const percentile = (values: number[], ratio: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] || 0;
};

const measure = async (operation: () => unknown, samples: number) => {
  const durations: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    await operation();
    durations.push(performance.now() - startedAt);
  }
  return {
    p50Ms: Number(percentile(durations, 0.5).toFixed(3)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(3)),
    p99Ms: Number(percentile(durations, 0.99).toFixed(3)),
    maxMs: Number(Math.max(...durations).toFixed(3))
  };
};

const progress = (kind: string, current: number, total: number) => {
  if (current === total || current % 250_000 === 0) process.stderr.write(`[scale] ${kind}: ${current.toLocaleString('en-US')}/${total.toLocaleString('en-US')}\n`);
};

const db = await openMajalDatabase({ filename: databasePath });
const startedAt = performance.now();

try {
  const insertCatalog = db.prepare(`
    INSERT INTO catalog_records(
      id, public_id, tenant_id, creator_id, category, status,
      price_fils, inventory_units, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let start = 1; start <= catalogRows; start += batchSize) {
    const end = Math.min(catalogRows, start + batchSize - 1);
    await withTransaction(db, async () => {
      for (let id = start; id <= end; id += 1) {
        const timestamp = new Date(baseTime - id * 1_000).toISOString();
        await insertCatalog.run(
          id,
          `prd_${String(id).padStart(10, '0')}`,
          `tenant_${id % tenantCount}`,
          `creator_${id % Math.max(1, Math.floor(tenantCount / 2))}`,
          categories[id % categories.length],
          statuses[id % statuses.length],
          500 + (id % 30_000),
          id % 5_000,
          timestamp,
          timestamp
        );
      }
    });
    progress('catalog', end, catalogRows);
  }
  const catalogInsertSeconds = (performance.now() - startedAt) / 1000;

  const eventsStartedAt = performance.now();
  const insertEvent = db.prepare(`
    INSERT INTO order_events(
      id, tenant_id, order_public_id, catalog_record_id, event_type, amount_fils, created_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?)
  `);
  for (let start = 1; start <= eventRows; start += batchSize) {
    const end = Math.min(eventRows, start + batchSize - 1);
    await withTransaction(db, async () => {
      for (let id = start; id <= end; id += 1) {
        const catalogId = ((id - 1) % catalogRows) + 1;
        await insertEvent.run(
          id,
          `tenant_${catalogId % tenantCount}`,
          `ord_${Math.floor((id - 1) / 3) + 1}`,
          catalogId,
          eventTypes[id % eventTypes.length],
          500 + (catalogId % 30_000),
          new Date(baseTime - id * 500).toISOString()
        );
      }
    });
    progress('events', end, eventRows);
  }
  const eventInsertSeconds = (performance.now() - eventsStartedAt) / 1000;

  await db.exec('PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);');

  const tenantFeed = db.prepare(`
    SELECT id, public_id, status, price_fils, created_at
    FROM catalog_records
    WHERE tenant_id = ? AND status = 'LIVE'
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `);
  const categoryFeed = db.prepare(`
    SELECT id, public_id, price_fils, created_at
    FROM catalog_records
    WHERE category = ? AND status = 'LIVE'
    ORDER BY created_at DESC, id DESC
    LIMIT 50
  `);
  const orderTimeline = db.prepare(`
    SELECT id, event_type, amount_fils, created_at
    FROM order_events
    WHERE order_public_id = ?
    ORDER BY created_at ASC, id ASC
    LIMIT 50
  `);

  const tenantMetrics = await measure(() => tenantFeed.all(`tenant_${Math.floor(Math.random() * tenantCount)}`), querySamples);
  const categoryMetrics = await measure(() => categoryFeed.all(categories[Math.floor(Math.random() * categories.length)]), querySamples);
  const orderMetrics = await measure(() => orderTimeline.all(`ord_${1 + Math.floor(Math.random() * Math.max(1, eventRows / 3))}`), querySamples);
  const integrity = await db.prepare(`
    SELECT
      (SELECT count(*) FROM catalog_records) AS catalog_count,
      (SELECT count(*) FROM order_events) AS event_count,
      (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_failures,
      (SELECT count(*) FROM pragma_integrity_check WHERE integrity_check != 'ok') AS integrity_failures
  `).get() as unknown as Record<string, number>;
  const queryPlans = {
    tenantFeed: await db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM catalog_records WHERE tenant_id = ? AND status = 'LIVE' ORDER BY created_at DESC, id DESC LIMIT 50`).all('tenant_42'),
    categoryFeed: await db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM catalog_records WHERE category = ? AND status = 'LIVE' ORDER BY created_at DESC, id DESC LIMIT 50`).all('BAKERY'),
    orderTimeline: await db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM order_events WHERE order_public_id = ? ORDER BY created_at ASC, id ASC LIMIT 50`).all('ord_42')
  };

  const result = {
    generatedAt: new Date().toISOString(),
    database: 'SQLite (node:sqlite) local scale simulator',
    rows: { catalog: catalogRows, orderEvents: eventRows, total: catalogRows + eventRows, tenants: tenantCount },
    insert: {
      catalogSeconds: Number(catalogInsertSeconds.toFixed(2)),
      eventSeconds: Number(eventInsertSeconds.toFixed(2)),
      totalRowsPerSecond: Math.round((catalogRows + eventRows) / ((performance.now() - startedAt) / 1000))
    },
    queries: {
      samplesPerQuery: querySamples,
      pageSize: 50,
      metrics: { tenantFeed: tenantMetrics, categoryFeed: categoryMetrics, orderTimeline: orderMetrics }
    },
    integrity,
    queryPlans,
    databaseSizeBytes: fs.statSync(databasePath).size,
    residentMemoryBytes: process.memoryUsage().rss,
    target: { standardReadP95Ms: 400 },
    passed: integrity.catalog_count === catalogRows && integrity.event_count === eventRows && integrity.foreign_key_failures === 0 && integrity.integrity_failures === 0 && Math.max(tenantMetrics.p95Ms, categoryMetrics.p95Ms, orderMetrics.p95Ms) < 400
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await db.close();
  if (!keepDatabase) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  else process.stderr.write(`[scale] database kept at ${databasePath}\n`);
}
