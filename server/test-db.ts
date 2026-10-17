import { randomBytes } from 'node:crypto';
import { openMajalDatabase, type MajalDatabase } from './database';

/**
 * In-memory SQLite by default. When TEST_DATABASE_URL points at a PostgreSQL server, each call
 * instead creates a throw-away database there (migrations included) and drops it on close, so the
 * same suites can prove the SQL on the production dialect without sharing rows between tests.
 */
export async function openTestDatabase(): Promise<MajalDatabase> {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) return openMajalDatabase({ filename: ':memory:' });
  const { Pool } = await import('pg');
  const name = `majal_t_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: url, max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const target = new URL(url);
  target.pathname = `/${name}`;
  const db = await openMajalDatabase({ databaseUrl: target.toString() });
  const close = db.close.bind(db);
  db.close = async () => {
    await close();
    const cleanup = new Pool({ connectionString: url, max: 1 });
    await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await cleanup.end();
  };
  return db;
}
