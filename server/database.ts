import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const toSqliteParams = (params: unknown[]) => params as SQLInputValue[];

export interface DatabaseRunResult {
  changes: number;
}

export interface MajalStatement {
  get<T = Record<string, unknown>>(...params: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<DatabaseRunResult>;
}

export interface MajalDatabase {
  readonly dialect: 'sqlite' | 'postgres';
  prepare(sql: string): MajalStatement;
  exec(sql: string): Promise<void>;
  transaction<T>(operation: (tx: MajalDatabase) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function sqliteStatement(statement: ReturnType<DatabaseSync['prepare']>): MajalStatement {
  return {
    async get<T>(...params: unknown[]) {
      return statement.get(...toSqliteParams(params)) as T | undefined;
    },
    async all<T>(...params: unknown[]) {
      return statement.all(...toSqliteParams(params)) as T[];
    },
    async run(...params: unknown[]) {
      const result = statement.run(...toSqliteParams(params));
      return { changes: Number(result.changes) };
    }
  };
}

class SqliteMajalDatabase implements MajalDatabase {
  readonly dialect = 'sqlite' as const;
  // A single SQLite connection cannot hold two open transactions at once. In production
  // each transaction runs on its own pooled PostgreSQL connection, but under SQLite
  // (dev/test) overlapping async transactions would throw "transaction within a
  // transaction". This promise-chain mutex serializes them so concurrent callers queue
  // deterministically instead of racing — the same guarantee the PG pool gives for free.
  private writeQueue: Promise<unknown> = Promise.resolve();
  constructor(readonly raw: DatabaseSync) {}

  prepare(sql: string): MajalStatement {
    return sqliteStatement(this.raw.prepare(sql));
  }

  async exec(sql: string) {
    this.raw.exec(sql);
  }

  async transaction<T>(operation: (tx: MajalDatabase) => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(() => this.runExclusiveTransaction(operation));
    // Keep the queue alive even if this transaction rejects, so later callers still run.
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runExclusiveTransaction<T>(operation: (tx: MajalDatabase) => Promise<T>): Promise<T> {
    this.raw.exec('BEGIN IMMEDIATE;');
    try {
      const result = await operation(this);
      this.raw.exec('COMMIT;');
      return result;
    } catch (error) {
      this.raw.exec('ROLLBACK;');
      throw error;
    }
  }

  async close() {
    this.raw.close();
  }
}

type PgQueryResult = { rows: Array<Record<string, unknown>>; rowCount: number | null };
type PgQueryClient = { query(sql: string, params?: unknown[]): Promise<PgQueryResult> };
type PgPoolLike = PgQueryClient & {
  connect(): Promise<PgQueryClient & { release(): void }>;
  end(): Promise<void>;
};

function postgresPlaceholders(sql: string) {
  let parameterIndex = 0;
  let output = '';
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (char === "'" && !doubleQuoted) {
      output += char;
      if (singleQuoted && next === "'") {
        output += next;
        index += 1;
        continue;
      }
      singleQuoted = !singleQuoted;
      continue;
    }
    if (char === '"' && !singleQuoted) {
      doubleQuoted = !doubleQuoted;
      output += char;
      continue;
    }
    if (char === '?' && !singleQuoted && !doubleQuoted) {
      parameterIndex += 1;
      output += `$${parameterIndex}`;
      continue;
    }
    output += char;
  }
  return output;
}

class PostgresMajalDatabase implements MajalDatabase {
  readonly dialect = 'postgres' as const;
  constructor(private readonly client: PgQueryClient, private readonly pool?: PgPoolLike) {}

  prepare(sql: string): MajalStatement {
    const pgSql = postgresPlaceholders(sql);
    return {
      get: async <T>(...params: unknown[]) => {
        const result = await this.client.query(pgSql, params);
        return result.rows[0] as T | undefined;
      },
      all: async <T>(...params: unknown[]) => {
        const result = await this.client.query(pgSql, params);
        return result.rows as T[];
      },
      run: async (...params: unknown[]) => {
        const result = await this.client.query(pgSql, params);
        return { changes: Number(result.rowCount ?? 0) };
      }
    };
  }

  async exec(sql: string) {
    await this.client.query(sql);
  }

  async transaction<T>(operation: (tx: MajalDatabase) => Promise<T>): Promise<T> {
    if (!this.pool) {
      await this.client.query('BEGIN');
      try {
        const result = await operation(this);
        await this.client.query('COMMIT');
        return result;
      } catch (error) {
        await this.client.query('ROLLBACK');
        throw error;
      }
    }
    const connection = await this.pool.connect();
    const tx = new PostgresMajalDatabase(connection);
    await connection.query('BEGIN');
    try {
      const result = await operation(tx);
      await connection.query('COMMIT');
      return result;
    } catch (error) {
      await connection.query('ROLLBACK');
      throw error;
    } finally {
      connection.release();
    }
  }

  async close() {
    if (this.pool) await this.pool.end();
  }
}

const ROLE_VALUES = [
  'CREATOR',
  'HOST_OWNER',
  'HOST_OPERATIONS',
  'HOST_CHEF',
  'HOST_FINANCE',
  'HOST_MARKETING',
  'HOST_SUPPORT',
  'ADMIN',
  'SUPER_ADMIN',
  'CONSUMER'
] as const;

const roleConstraint = ROLE_VALUES.map(role => `'${role}'`).join(', ');

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 120),
        email TEXT NOT NULL COLLATE NOCASE UNIQUE,
        phone TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL CHECK(role IN (${roleConstraint})),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'INVITED')),
        creator_id TEXT,
        host_business_id TEXT,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        mfa_secret_encrypted TEXT,
        mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK(mfa_enabled IN (0, 1)),
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status, id);
      CREATE INDEX IF NOT EXISTS idx_users_host_role ON users(host_business_id, role, status, id);
      CREATE INDEX IF NOT EXISTS idx_users_creator ON users(creator_id, status, id);

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        ip_hash TEXT,
        user_agent_hash TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry ON sessions(user_id, expires_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS auth_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        email_hash TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK(event_type IN (
          'REGISTERED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'ACCOUNT_LOCKED',
          'LOGOUT', 'MFA_ENROLLED', 'MFA_ENABLED', 'MFA_DISABLED'
        )),
        ip_hash TEXT,
        request_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_auth_events_user_time ON auth_events(user_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_auth_events_email_time ON auth_events(email_hash, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS paci_auth_requests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        civil_id_hash TEXT NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'ERROR')),
        provider_reference TEXT UNIQUE,
        request_nonce_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        callback_received_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_paci_user_time ON paci_auth_requests(user_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_paci_status_expiry ON paci_auth_requests(status, expires_at);

      CREATE TABLE IF NOT EXISTS catalog_records (
        id INTEGER PRIMARY KEY,
        public_id TEXT NOT NULL UNIQUE,
        tenant_id TEXT NOT NULL,
        creator_id TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('DRAFT', 'REVIEW', 'LIVE', 'PAUSED', 'ARCHIVED')),
        price_fils INTEGER NOT NULL CHECK(price_fils >= 0),
        inventory_units INTEGER NOT NULL DEFAULT 0 CHECK(inventory_units >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_catalog_public_feed
        ON catalog_records(status, created_at DESC, id DESC)
        WHERE status = 'LIVE';
      CREATE INDEX IF NOT EXISTS idx_catalog_tenant_status_cursor
        ON catalog_records(tenant_id, status, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_catalog_category_status_cursor
        ON catalog_records(category, status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS order_events (
        id INTEGER PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        order_public_id TEXT NOT NULL,
        catalog_record_id INTEGER NOT NULL REFERENCES catalog_records(id) ON DELETE RESTRICT,
        event_type TEXT NOT NULL CHECK(event_type IN ('CREATED', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED')),
        amount_fils INTEGER NOT NULL CHECK(amount_fils >= 0),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_order_events_tenant_time
        ON order_events(tenant_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_order_events_order_time
        ON order_events(order_public_id, created_at ASC, id ASC);
      CREATE INDEX IF NOT EXISTS idx_order_events_catalog_time
        ON order_events(catalog_record_id, created_at DESC, id DESC);
    `
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS payment_intents (
        id TEXT PRIMARY KEY,
        order_public_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        provider TEXT NOT NULL,
        amount_fils INTEGER NOT NULL CHECK(amount_fils > 0),
        currency TEXT NOT NULL DEFAULT 'KWD' CHECK(currency = 'KWD'),
        status TEXT NOT NULL CHECK(status IN (
          'PENDING_PROVIDER', 'REDIRECT_REQUIRED', 'AUTHORIZED', 'PAID',
          'FAILED', 'CANCELLED', 'REFUNDED'
        )),
        idempotency_key TEXT NOT NULL UNIQUE,
        provider_reference TEXT UNIQUE,
        checkout_url TEXT,
        failure_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_payment_intents_user_time
        ON payment_intents(user_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_payment_intents_order
        ON payment_intents(order_public_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_payment_intents_status_time
        ON payment_intents(status, updated_at, id);

      CREATE TABLE IF NOT EXISTS payment_webhook_receipts (
        provider TEXT NOT NULL,
        provider_event_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        signature_valid INTEGER NOT NULL CHECK(signature_valid IN (0, 1)),
        processed INTEGER NOT NULL DEFAULT 0 CHECK(processed IN (0, 1)),
        received_at TEXT NOT NULL,
        processed_at TEXT,
        PRIMARY KEY(provider, provider_event_id)
      );

      CREATE INDEX IF NOT EXISTS idx_payment_webhook_processing
        ON payment_webhook_receipts(processed, received_at, provider_event_id);
    `
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        in_app_enabled INTEGER NOT NULL DEFAULT 1 CHECK(in_app_enabled IN (0, 1)),
        email_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_enabled IN (0, 1)),
        push_enabled INTEGER NOT NULL DEFAULT 0 CHECK(push_enabled IN (0, 1)),
        quiet_hours_start TEXT,
        quiet_hours_end TEXT,
        timezone TEXT NOT NULL DEFAULT 'Asia/Kuwait',
        digest_mode TEXT NOT NULL DEFAULT 'SMART' CHECK(digest_mode IN ('IMMEDIATE', 'SMART', 'DAILY')),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notification_inbox (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        priority TEXT NOT NULL CHECK(priority IN ('URGENT', 'NOW', 'SOON', 'WATCH')),
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        action_label TEXT,
        action_surface TEXT,
        entity_type TEXT,
        entity_id TEXT,
        dedupe_key TEXT,
        occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK(occurrence_count > 0),
        status TEXT NOT NULL DEFAULT 'UNREAD' CHECK(status IN ('UNREAD', 'READ', 'ARCHIVED')),
        first_occurred_at TEXT NOT NULL,
        last_occurred_at TEXT NOT NULL,
        read_at TEXT,
        expires_at TEXT,
        UNIQUE(user_id, dedupe_key)
      );

      CREATE INDEX IF NOT EXISTS idx_notification_inbox_cursor
        ON notification_inbox(user_id, status, last_occurred_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_notification_priority_cursor
        ON notification_inbox(user_id, priority, last_occurred_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS notification_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id TEXT NOT NULL REFERENCES notification_inbox(id) ON DELETE CASCADE,
        channel TEXT NOT NULL CHECK(channel IN ('EMAIL', 'PUSH')),
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SENT', 'FAILED', 'CANCELLED')),
        available_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        UNIQUE(notification_id, channel)
      );

      CREATE INDEX IF NOT EXISTS idx_notification_outbox_delivery
        ON notification_outbox(status, available_at, id);
    `
  },
  {
    version: 4,
    sql: `
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        commercial_name TEXT NOT NULL,
        organization_type TEXT NOT NULL CHECK(organization_type IN ('HOST', 'PLATFORM')),
        verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK(verification_status IN ('UNVERIFIED', 'PENDING', 'VERIFIED', 'NEEDS_ACTION', 'SUSPENDED', 'EXPIRED_DOCS')),
        registration_number_encrypted TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_organizations_verification
        ON organizations(verification_status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS organization_memberships (
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('HOST_OWNER', 'HOST_OPERATIONS', 'HOST_CHEF', 'HOST_FINANCE', 'HOST_MARKETING', 'HOST_SUPPORT')),
        status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'SUSPENDED', 'INVITED')),
        created_at TEXT NOT NULL,
        PRIMARY KEY(organization_id, user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_memberships_user
        ON organization_memberships(user_id, status, organization_id);

      CREATE TABLE IF NOT EXISTS creator_profiles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
        display_name TEXT NOT NULL,
        specialty TEXT NOT NULL,
        completion_score INTEGER NOT NULL DEFAULT 0 CHECK(completion_score BETWEEN 0 AND 100),
        matching_enabled INTEGER NOT NULL DEFAULT 0 CHECK(matching_enabled IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
        public_name TEXT NOT NULL,
        category TEXT NOT NULL,
        short_description TEXT NOT NULL,
        status TEXT NOT NULL,
        estimated_unit_cost_fils INTEGER NOT NULL CHECK(estimated_unit_cost_fils >= 0),
        target_price_fils INTEGER NOT NULL CHECK(target_price_fils > 0),
        is_secret_recipe INTEGER NOT NULL DEFAULT 1 CHECK(is_secret_recipe IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_products_creator_cursor
        ON products(creator_id, status, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_products_market_cursor
        ON products(status, category, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS recipe_versions (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        version_number INTEGER NOT NULL CHECK(version_number > 0),
        encrypted_payload TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        UNIQUE(product_id, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_recipe_versions_product
        ON recipe_versions(product_id, version_number DESC);

      CREATE TRIGGER IF NOT EXISTS prevent_recipe_version_update
      BEFORE UPDATE ON recipe_versions
      BEGIN
        SELECT RAISE(ABORT, 'recipe_versions are immutable');
      END;

      CREATE TABLE IF NOT EXISTS recipe_access_grants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        disclosure_level INTEGER NOT NULL CHECK(disclosure_level BETWEEN 1 AND 3),
        status TEXT NOT NULL CHECK(status IN ('REQUESTED', 'APPROVED', 'REVOKED', 'EXPIRED')),
        purpose TEXT NOT NULL,
        requested_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        granted_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recipe_grants_scope
        ON recipe_access_grants(product_id, organization_id, status, disclosure_level, expires_at);
      CREATE INDEX IF NOT EXISTS idx_recipe_grants_creator_cursor
        ON recipe_access_grants(creator_id, status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS collaborations (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        stage TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(product_id, organization_id)
      );

      CREATE INDEX IF NOT EXISTS idx_collaboration_org_stage
        ON collaborations(organization_id, stage, updated_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_collaboration_creator_stage
        ON collaborations(creator_id, stage, updated_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS offer_versions (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE RESTRICT,
        version_number INTEGER NOT NULL CHECK(version_number > 0),
        sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        selling_price_fils INTEGER NOT NULL CHECK(selling_price_fils > 0),
        creator_royalty_basis_points INTEGER NOT NULL CHECK(creator_royalty_basis_points BETWEEN 0 AND 10000),
        platform_fee_basis_points INTEGER NOT NULL CHECK(platform_fee_basis_points BETWEEN 0 AND 3000),
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
        terms_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(collaboration_id, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_offers_collaboration
        ON offer_versions(collaboration_id, version_number DESC);

      CREATE TABLE IF NOT EXISTS contract_versions (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE RESTRICT,
        version_number INTEGER NOT NULL CHECK(version_number > 0),
        document_sha256 TEXT NOT NULL,
        object_storage_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('DRAFT', 'PENDING_SIGNATURES', 'FULLY_SIGNED', 'EXPIRED', 'VOID')),
        creator_paci_request_id TEXT REFERENCES paci_auth_requests(id) ON DELETE RESTRICT,
        host_paci_request_id TEXT REFERENCES paci_auth_requests(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        UNIQUE(collaboration_id, version_number)
      );

      CREATE INDEX IF NOT EXISTS idx_contracts_collaboration
        ON contract_versions(collaboration_id, version_number DESC);

      CREATE TABLE IF NOT EXISTS launches (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL UNIQUE REFERENCES collaborations(id) ON DELETE RESTRICT,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        status TEXT NOT NULL,
        quantity_cap INTEGER CHECK(quantity_cap IS NULL OR quantity_cap >= 0),
        starts_at TEXT,
        ends_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_launches_market_cursor
        ON launches(status, starts_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_launches_org_status
        ON launches(organization_id, status, starts_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        launch_id TEXT NOT NULL REFERENCES launches(id) ON DELETE RESTRICT,
        consumer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        payment_intent_id TEXT UNIQUE REFERENCES payment_intents(id) ON DELETE RESTRICT,
        units INTEGER NOT NULL CHECK(units > 0),
        unit_price_fils INTEGER NOT NULL CHECK(unit_price_fils > 0),
        total_fils INTEGER NOT NULL CHECK(total_fils > 0),
        status TEXT NOT NULL CHECK(status IN ('PENDING_PAYMENT', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_orders_consumer_cursor
        ON orders(consumer_user_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_orders_launch_status
        ON orders(launch_id, status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS accruals (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
        creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
        amount_fils INTEGER NOT NULL CHECK(amount_fils >= 0),
        status TEXT NOT NULL CHECK(status IN ('PENDING', 'ELIGIBLE', 'LOCKED', 'PAID', 'REVERSED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_accruals_creator_status
        ON accruals(creator_id, status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS settlement_batches (
        id TEXT PRIMARY KEY,
        creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
        total_fils INTEGER NOT NULL CHECK(total_fils >= 0),
        status TEXT NOT NULL CHECK(status IN ('DRAFT', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED')),
        provider_reference TEXT UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_settlements_creator_status
        ON settlement_batches(creator_id, status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS domain_audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
        actor_role TEXT NOT NULL,
        organization_id TEXT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        before_sha256 TEXT,
        after_sha256 TEXT,
        request_id TEXT NOT NULL,
        session_hash TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_domain_audit_entity
        ON domain_audit_events(entity_type, entity_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_domain_audit_actor
        ON domain_audit_events(actor_user_id, created_at DESC, id DESC);
    `
  },
  {
    version: 5,
    sql: `
      CREATE TABLE IF NOT EXISTS domain_idempotency_keys (
        scope TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        request_sha256 TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY(scope, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_domain_idempotency_expiry ON domain_idempotency_keys(expires_at);

      CREATE TABLE IF NOT EXISTS contract_signatures (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contract_versions(id) ON DELETE RESTRICT,
        signer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        signer_side TEXT NOT NULL CHECK(signer_side IN ('CREATOR', 'HOST')),
        paci_request_id TEXT NOT NULL REFERENCES paci_auth_requests(id) ON DELETE RESTRICT,
        document_sha256 TEXT NOT NULL,
        signature_evidence_sha256 TEXT NOT NULL,
        signed_at TEXT NOT NULL,
        UNIQUE(contract_id, signer_side)
      );
      CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract ON contract_signatures(contract_id, signed_at, id);

      CREATE TABLE IF NOT EXISTS launch_gate_items (
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
        gate_key TEXT NOT NULL,
        value INTEGER NOT NULL DEFAULT 0 CHECK(value IN (0, 1)),
        evidence_json TEXT NOT NULL DEFAULT '{}',
        updated_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(collaboration_id, gate_key)
      );

      CREATE TABLE IF NOT EXISTS recipe_seals (
        id TEXT PRIMARY KEY,
        recipe_version_id TEXT NOT NULL UNIQUE REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        commitment_sha256 TEXT NOT NULL UNIQUE,
        salt_object_key TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_recipe_seals_product ON recipe_seals(product_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS taste_dna_profiles (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL CHECK(version_number > 0),
        dimensions_json TEXT NOT NULL,
        descriptors_json TEXT NOT NULL,
        source_sha256 TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'PUBLIC' CHECK(visibility IN ('PUBLIC', 'PARTNERS')),
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        UNIQUE(product_id, version_number)
      );

      CREATE TABLE IF NOT EXISTS shadow_launch_runs (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
        seed TEXT NOT NULL,
        scenario_json TEXT NOT NULL,
        result_json TEXT NOT NULL,
        financial_effect_fils INTEGER NOT NULL DEFAULT 0 CHECK(financial_effect_fils = 0),
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_shadow_launch_collab ON shadow_launch_runs(collaboration_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS deal_fairness_analyses (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
        offer_id TEXT REFERENCES offer_versions(id) ON DELETE RESTRICT,
        assumptions_sha256 TEXT NOT NULL,
        scenarios_json TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS kitchen_capacity_slots (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        capacity_units INTEGER NOT NULL CHECK(capacity_units > 0),
        price_fils INTEGER NOT NULL CHECK(price_fils >= 0),
        status TEXT NOT NULL CHECK(status IN ('OPEN', 'HELD', 'BOOKED', 'CANCELLED')),
        requirements_json TEXT NOT NULL DEFAULT '{}',
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_capacity_market ON kitchen_capacity_slots(status, starts_at, organization_id, id);

      CREATE TABLE IF NOT EXISTS kitchen_capacity_bookings (
        id TEXT PRIMARY KEY,
        slot_id TEXT NOT NULL UNIQUE REFERENCES kitchen_capacity_slots(id) ON DELETE RESTRICT,
        creator_id TEXT NOT NULL REFERENCES creator_profiles(id) ON DELETE RESTRICT,
        product_id TEXT REFERENCES products(id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK(status IN ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
        hold_expires_at TEXT,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS progressive_secret_escrows (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'COMPLETED', 'REVOKED', 'EXPIRED')),
        current_stage INTEGER NOT NULL DEFAULT 0 CHECK(current_stage BETWEEN 0 AND 3),
        expires_at TEXT NOT NULL,
        policy_json TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_secret_escrow_collab ON progressive_secret_escrows(collaboration_id, status, expires_at, id);

      CREATE TABLE IF NOT EXISTS progressive_secret_disclosures (
        id TEXT PRIMARY KEY,
        escrow_id TEXT NOT NULL REFERENCES progressive_secret_escrows(id) ON DELETE CASCADE,
        stage_number INTEGER NOT NULL CHECK(stage_number BETWEEN 1 AND 3),
        disclosure_object_key TEXT NOT NULL,
        condition_sha256 TEXT NOT NULL,
        disclosed_to_organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        disclosed_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        disclosed_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        UNIQUE(escrow_id, stage_number)
      );

      CREATE TABLE IF NOT EXISTS value_attribution_entries (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        category TEXT NOT NULL CHECK(category IN ('RECIPE', 'OPERATIONS', 'MARKETING', 'ACQUISITION', 'PLATFORM')),
        amount_fils INTEGER NOT NULL,
        method TEXT NOT NULL,
        evidence_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(order_id, category)
      );
      CREATE INDEX IF NOT EXISTS idx_value_attribution_order ON value_attribution_entries(order_id, category);

      CREATE TABLE IF NOT EXISTS deal_rescue_rooms (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
        blocker_code TEXT NOT NULL,
        diagnosis_json TEXT NOT NULL,
        decision_owner_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
        deadline_at TEXT,
        shortest_path_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('OPEN', 'RESOLVED', 'ABANDONED')),
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_rescue_rooms_collab ON deal_rescue_rooms(collaboration_id, status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS onboarding_extractions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_object_key TEXT NOT NULL,
        source_sha256 TEXT NOT NULL,
        fields_json TEXT NOT NULL,
        confidence_json TEXT NOT NULL,
        exceptions_json TEXT NOT NULL,
        extractor_provider TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('EXTRACTED', 'NEEDS_REVIEW', 'VERIFIED', 'REJECTED')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_extractions(user_id, status, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS customer_memory_capsules (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        object_storage_key TEXT NOT NULL,
        payload_sha256 TEXT NOT NULL,
        consent_version TEXT NOT NULL,
        purposes_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS consent_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        consent_type TEXT NOT NULL,
        version TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('GRANTED', 'REVOKED')),
        purposes_json TEXT NOT NULL,
        request_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_events(user_id, consent_type, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_sha256 TEXT NOT NULL UNIQUE,
        token_object_key TEXT NOT NULL,
        platform TEXT NOT NULL CHECK(platform IN ('WEB', 'IOS', 'ANDROID')),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_push_user_active ON push_subscriptions(user_id, active, updated_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS notification_delivery_claims (
        outbox_id INTEGER PRIMARY KEY REFERENCES notification_outbox(id) ON DELETE CASCADE,
        owner_id TEXT NOT NULL,
        claimed_until TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS operational_incidents (
        id TEXT PRIMARY KEY,
        severity TEXT NOT NULL CHECK(severity IN ('SEV0','SEV1','SEV2','SEV3')),
        status TEXT NOT NULL CHECK(status IN ('OPEN','MITIGATED','RESOLVED')),
        fingerprint TEXT NOT NULL,
        summary TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_incidents_status ON operational_incidents(status, severity, last_seen_at DESC, id DESC);
    `
  },
  {
    version: 6,
    sql: `
      -- Deterministic Replay Ledger: hash-chained, tamper-evident record of money moves.
      CREATE TABLE IF NOT EXISTS financial_ledger (
        id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL UNIQUE,
        scope TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        amount_fils INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'KWD' CHECK(currency = 'KWD'),
        meta_sha256 TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        entry_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_financial_ledger_scope ON financial_ledger(scope, seq);
      CREATE INDEX IF NOT EXISTS idx_financial_ledger_entity ON financial_ledger(entity_type, entity_id, seq);

      CREATE TABLE IF NOT EXISTS financial_ledger_head (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        last_seq INTEGER NOT NULL,
        last_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO financial_ledger_head(id, last_seq, last_hash, updated_at)
        VALUES(1, 0, '0000000000000000000000000000000000000000000000000000000000000000', '1970-01-01T00:00:00.000Z');

      -- Secret Exposure Budget with decaying half-life: least secret, fewest people, shortest time.
      CREATE TABLE IF NOT EXISTS secret_exposure_grants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        purpose TEXT NOT NULL,
        initial_exposure_bp INTEGER NOT NULL CHECK(initial_exposure_bp BETWEEN 1 AND 10000),
        floor_bp INTEGER NOT NULL CHECK(floor_bp BETWEEN 0 AND 10000),
        half_life_seconds INTEGER NOT NULL CHECK(half_life_seconds > 0),
        access_decay_bp INTEGER NOT NULL DEFAULT 0 CHECK(access_decay_bp >= 0),
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'EXHAUSTED', 'REVOKED', 'EXPIRED')),
        access_count INTEGER NOT NULL DEFAULT 0,
        granted_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        granted_at TEXT NOT NULL,
        hard_expires_at TEXT NOT NULL,
        last_access_at TEXT,
        closed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_secret_exposure_org ON secret_exposure_grants(organization_id, status, hard_expires_at);
      CREATE INDEX IF NOT EXISTS idx_secret_exposure_product ON secret_exposure_grants(product_id, status, id);

      CREATE TABLE IF NOT EXISTS secret_exposure_access_events (
        id TEXT PRIMARY KEY,
        grant_id TEXT NOT NULL REFERENCES secret_exposure_grants(id) ON DELETE CASCADE,
        actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        strength_bp_before INTEGER NOT NULL,
        strength_bp_after INTEGER NOT NULL,
        decision TEXT NOT NULL CHECK(decision IN ('ALLOWED', 'DENIED_FLOOR', 'DENIED_EXPIRED', 'DENIED_REVOKED')),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_secret_exposure_events_grant ON secret_exposure_access_events(grant_id, created_at DESC, id DESC);
    `
  },
  {
    version: 7,
    sql: `
      -- Trust Kill Switch: high-privilege breach containment. Never destroys business data.
      CREATE TABLE IF NOT EXISTS security_kill_switches (
        name TEXT PRIMARY KEY CHECK(name IN ('RECIPE_REVEALS', 'SETTLEMENTS', 'WEBHOOKS', 'TEMP_GRANTS', 'SESSIONS')),
        state TEXT NOT NULL DEFAULT 'CLEAR' CHECK(state IN ('CLEAR', 'ENGAGED')),
        reason TEXT,
        actor_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
        engaged_at TEXT,
        released_at TEXT,
        updated_at TEXT NOT NULL
      );
      INSERT INTO security_kill_switches(name, state, updated_at) VALUES
        ('RECIPE_REVEALS', 'CLEAR', '1970-01-01T00:00:00.000Z'),
        ('SETTLEMENTS', 'CLEAR', '1970-01-01T00:00:00.000Z'),
        ('WEBHOOKS', 'CLEAR', '1970-01-01T00:00:00.000Z'),
        ('TEMP_GRANTS', 'CLEAR', '1970-01-01T00:00:00.000Z'),
        ('SESSIONS', 'CLEAR', '1970-01-01T00:00:00.000Z');

      CREATE TABLE IF NOT EXISTS security_kill_switch_events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('ENGAGE', 'RELEASE')),
        actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        reason TEXT NOT NULL,
        affected_count INTEGER NOT NULL DEFAULT 0,
        request_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_kill_switch_events_time ON security_kill_switch_events(created_at DESC, id DESC);

      -- Contract Drift Detector: immutable snapshots of agreed-vs-actual divergence.
      CREATE TABLE IF NOT EXISTS contract_drift_reports (
        id TEXT PRIMARY KEY,
        collaboration_id TEXT NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
        agreed_json TEXT NOT NULL,
        actual_json TEXT NOT NULL,
        drift_json TEXT NOT NULL,
        max_severity TEXT NOT NULL CHECK(max_severity IN ('NONE', 'INFO', 'WARN', 'CRITICAL')),
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_contract_drift_collab ON contract_drift_reports(collaboration_id, created_at DESC, id DESC);
    `
  },
  {
    version: 8,
    sql: `
      -- Recipe Lineage Graph: provenance edges over immutable recipe versions. No secret content.
      CREATE TABLE IF NOT EXISTS recipe_lineage_edges (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        parent_recipe_version_id TEXT REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        child_recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        relation TEXT NOT NULL CHECK(relation IN ('ORIGIN', 'REVISION', 'TEST_BATCH', 'APPROVED_VARIANT', 'LICENSED_VARIANT', 'MARKET_LAUNCH')),
        note TEXT NOT NULL DEFAULT '',
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        UNIQUE(child_recipe_version_id, parent_recipe_version_id, relation)
      );
      CREATE INDEX IF NOT EXISTS idx_recipe_lineage_product ON recipe_lineage_edges(product_id, created_at, id);
      CREATE INDEX IF NOT EXISTS idx_recipe_lineage_child ON recipe_lineage_edges(child_recipe_version_id);

      -- Reputation Without Disclosure: signed aggregate trust claims, no deal details.
      CREATE TABLE IF NOT EXISTS trust_attestations (
        id TEXT PRIMARY KEY,
        subject_type TEXT NOT NULL CHECK(subject_type IN ('CREATOR', 'ORGANIZATION')),
        subject_id TEXT NOT NULL,
        claims_json TEXT NOT NULL,
        claims_sha256 TEXT NOT NULL,
        signature TEXT NOT NULL,
        key_id TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trust_attestations_subject ON trust_attestations(subject_type, subject_id, issued_at DESC, id DESC);
    `
  },
  {
    version: 9,
    sql: `
      -- Recipe Canary Fingerprint: per-recipient, non-material marker to trace a leak to its source.
      CREATE TABLE IF NOT EXISTS recipe_canaries (
        id TEXT PRIMARY KEY,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
        purpose TEXT NOT NULL,
        canary_code TEXT NOT NULL UNIQUE,
        marker_sha256 TEXT NOT NULL,
        nonce TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'REVOKED')),
        issued_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        issued_at TEXT NOT NULL,
        UNIQUE(recipe_version_id, organization_id, nonce)
      );
      CREATE INDEX IF NOT EXISTS idx_recipe_canaries_scope ON recipe_canaries(recipe_version_id, organization_id, id);

      -- Operational Twin: predicted-vs-actual samples used to recalibrate launch forecasts.
      CREATE TABLE IF NOT EXISTS operational_twin_samples (
        id TEXT PRIMARY KEY,
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        collaboration_id TEXT REFERENCES collaborations(id) ON DELETE SET NULL,
        predicted_units INTEGER NOT NULL CHECK(predicted_units >= 0),
        actual_units INTEGER NOT NULL CHECK(actual_units >= 0),
        predicted_prep_minutes INTEGER NOT NULL CHECK(predicted_prep_minutes >= 0),
        actual_prep_minutes INTEGER NOT NULL CHECK(actual_prep_minutes >= 0),
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_twin_samples_org ON operational_twin_samples(organization_id, created_at DESC, id DESC);
    `
  },
  {
    version: 10,
    sql: `
      -- Threshold Recipe Escrow: recipe encrypted with a data key split k-of-n via Shamir.
      -- The whole key is never stored; only per-holder share commitments (hashes) are kept.
      CREATE TABLE IF NOT EXISTS threshold_escrows (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        aad TEXT NOT NULL,
        threshold INTEGER NOT NULL CHECK(threshold >= 2),
        holder_count INTEGER NOT NULL CHECK(holder_count >= threshold),
        status TEXT NOT NULL CHECK(status IN ('SEALED', 'REVEALED', 'REVOKED')),
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_threshold_escrows_product ON threshold_escrows(product_id, status, id);

      CREATE TABLE IF NOT EXISTS threshold_escrow_shares (
        escrow_id TEXT NOT NULL REFERENCES threshold_escrows(id) ON DELETE CASCADE,
        share_index INTEGER NOT NULL CHECK(share_index BETWEEN 1 AND 255),
        holder_ref TEXT NOT NULL,
        share_commitment_sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(escrow_id, share_index)
      );
    `
  },
  {
    version: 11,
    sql: `
      -- Proof-of-Reserves: Merkle commitment that total creator liabilities are covered.
      CREATE TABLE IF NOT EXISTS reserve_attestations (
        id TEXT PRIMARY KEY,
        merkle_root TEXT NOT NULL,
        total_liabilities_fils INTEGER NOT NULL CHECK(total_liabilities_fils >= 0),
        reserve_fils INTEGER NOT NULL,
        solvent INTEGER NOT NULL CHECK(solvent IN (0, 1)),
        leaf_count INTEGER NOT NULL CHECK(leaf_count >= 0),
        ledger_head_hash TEXT NOT NULL,
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reserve_attestations_time ON reserve_attestations(created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS reserve_attestation_leaves (
        attestation_id TEXT NOT NULL REFERENCES reserve_attestations(id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK(position >= 0),
        creator_id TEXT NOT NULL,
        amount_fils INTEGER NOT NULL CHECK(amount_fils >= 0),
        salt TEXT NOT NULL,
        leaf_hash TEXT NOT NULL,
        PRIMARY KEY(attestation_id, position)
      );
      CREATE INDEX IF NOT EXISTS idx_reserve_leaves_creator ON reserve_attestation_leaves(attestation_id, creator_id);

      -- Tamper-Evident Time: periodic anchors binding the ledger head to a timestamp source.
      CREATE TABLE IF NOT EXISTS ledger_time_anchors (
        id TEXT PRIMARY KEY,
        ledger_seq INTEGER NOT NULL,
        head_hash TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('RFC3161_TSA', 'LOCAL_UNVERIFIED')),
        token TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_anchors_seq ON ledger_time_anchors(ledger_seq DESC, id DESC);

      -- Sealed Compute Reveal: recipe sealed once; hosts get aggregate outputs, never the formula.
      CREATE TABLE IF NOT EXISTS sealed_compute_profiles (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        recipe_version_id TEXT NOT NULL REFERENCES recipe_versions(id) ON DELETE RESTRICT,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        aad TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'REVOKED')),
        created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sealed_compute_product ON sealed_compute_profiles(product_id, status, id);
    `
  },
  {
    version: 12,
    sql: `
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        email TEXT PRIMARY KEY COLLATE NOCASE,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `
  },
  {
    // Links each accrual to the settlement batch that locked it, so paying a batch settles
    // ONLY that batch's accruals (previously the payout marked every LOCKED accrual for the
    // creator PAID, which double-paid once two batches could coexist).
    version: 13,
    sql: `
      ALTER TABLE accruals ADD COLUMN settlement_batch_id TEXT
        REFERENCES settlement_batches(id) ON DELETE RESTRICT;

      CREATE INDEX IF NOT EXISTS idx_accruals_batch_status
        ON accruals(settlement_batch_id, status);
    `
  },
  {
    // Product profile fields surfaced in the domain snapshot (internal name, story, media,
    // ingredients/allergens/dietary tags, serving/shelf/prep, equipment, exclusivity intent).
    // All nullable so existing rows migrate cleanly; JSON columns hold serialized arrays.
    version: 14,
    sql: `
      ALTER TABLE products ADD COLUMN internal_name TEXT;
      ALTER TABLE products ADD COLUMN story TEXT;
      ALTER TABLE products ADD COLUMN media_json TEXT;
      ALTER TABLE products ADD COLUMN general_ingredients_json TEXT;
      ALTER TABLE products ADD COLUMN allergens_json TEXT;
      ALTER TABLE products ADD COLUMN dietary_tags_json TEXT;
      ALTER TABLE products ADD COLUMN serving_size TEXT;
      ALTER TABLE products ADD COLUMN shelf_life TEXT;
      ALTER TABLE products ADD COLUMN prep_time_minutes INTEGER;
      ALTER TABLE products ADD COLUMN expected_equipment_json TEXT;
      ALTER TABLE products ADD COLUMN accepts_exclusivity INTEGER NOT NULL DEFAULT 0 CHECK(accepts_exclusivity IN (0, 1));
      ALTER TABLE products ADD COLUMN desired_partnership_type TEXT;
    `
  }
] as const;


export interface OpenDatabaseOptions {
  filename?: string;
  readonly?: boolean;
  databaseUrl?: string;
  forceSqlite?: boolean;
}

export function resolveDatabasePath(explicitFilename?: string) {
  if (explicitFilename === ':memory:') return explicitFilename;
  const filename = explicitFilename || process.env.MAJAL_DATABASE_PATH;
  if (filename) return path.resolve(filename);
  const dataDirectory = path.resolve(process.env.MAJAL_DATA_DIR || path.join(process.cwd(), 'var'));
  return path.join(dataDirectory, 'majal.sqlite');
}

function postgresMigrationSql(sql: string) {
  const immutableTrigger = /CREATE TRIGGER IF NOT EXISTS prevent_recipe_version_update[\s\S]*?END;/m;
  return sql
    .replace(/\s+COLLATE NOCASE/g, '')
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'BIGSERIAL PRIMARY KEY')
    .replace(immutableTrigger, '');
}

async function installPostgresRecipeImmutability(db: MajalDatabase) {
  if (db.dialect !== 'postgres') return;
  await db.exec(`
    CREATE OR REPLACE FUNCTION majal_prevent_recipe_version_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'recipe_versions are immutable';
    END;
    $$;
    DROP TRIGGER IF EXISTS prevent_recipe_version_update ON recipe_versions;
    CREATE TRIGGER prevent_recipe_version_update
      BEFORE UPDATE OR DELETE ON recipe_versions
      FOR EACH ROW EXECUTE FUNCTION majal_prevent_recipe_version_mutation();
  `);
}

export async function openMajalDatabase(options: OpenDatabaseOptions = {}): Promise<MajalDatabase> {
  const isMemory = options.filename === ':memory:';
  const databaseUrl = options.databaseUrl || (isMemory ? undefined : process.env.DATABASE_URL);
  const production = process.env.NODE_ENV === 'production';
  if (production && !options.forceSqlite && !databaseUrl && !isMemory) {
    throw new Error('DATABASE_URL is required in production. SQLite is development/test only.');
  }

  if (databaseUrl && !options.forceSqlite && !isMemory) {
    const pgModule = await import('pg');
    const Pool = (pgModule as unknown as { Pool: new (config: Record<string, unknown>) => PgPoolLike }).Pool;
    const sslMode = (process.env.PGSSLMODE || '').toLowerCase();
    const ssl = sslMode === 'disable' ? false : sslMode ? { rejectUnauthorized: sslMode !== 'no-verify' } : undefined;
    const max = Math.min(40, Math.max(2, Number(process.env.PG_POOL_MAX || 10) || 10));
    const pool = new Pool({
      connectionString: databaseUrl,
      max,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: Math.min(60_000, Math.max(1_000, Number(process.env.PG_STATEMENT_TIMEOUT_MS || 15_000) || 15_000)),
      ...(ssl === undefined ? {} : { ssl })
    });
    const db = new PostgresMajalDatabase(pool, pool);
    // Hold a session-level advisory lock on a dedicated connection for the whole
    // migration so concurrent replicas serialize instead of racing the DDL.
    const migrationConnection = await pool.connect();
    try {
      await migrationConnection.query(`SELECT pg_advisory_lock(${MIGRATION_ADVISORY_LOCK_ID})`);
      const migrator = new PostgresMajalDatabase(migrationConnection);
      await migrateDatabase(migrator);
      await installPostgresRecipeImmutability(migrator);
    } finally {
      try { await migrationConnection.query(`SELECT pg_advisory_unlock(${MIGRATION_ADVISORY_LOCK_ID})`); }
      finally { migrationConnection.release(); }
    }
    return db;
  }

  const filename = resolveDatabasePath(options.filename);
  if (filename !== ':memory:' && !options.readonly) {
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  }
  const raw = new DatabaseSync(filename, {
    readOnly: options.readonly ?? false,
    enableForeignKeyConstraints: true
  });
  raw.exec('PRAGMA busy_timeout = 5000;');
  if (!options.readonly) raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;');
  const db = new SqliteMajalDatabase(raw);
  if (!options.readonly) await migrateDatabase(db);
  return db;
}

// Deterministic 63-bit advisory-lock id (fits Postgres bigint), so every replica
// competes for the SAME lock while migrating. Only one instance runs DDL at a time;
// the rest block on the session-level advisory lock, then observe the already-applied
// versions and skip. Closes the "two replicas migrate at once" race with no external
// coordinator. Session-level (not xact) so it survives the per-migration transactions.
export const MIGRATION_ADVISORY_LOCK_ID = (0x4d414a414c4d4752n & 0x7fffffffffffffffn).toString(); // "MAJALMGR"

export async function migrateDatabase(db: MajalDatabase) {
  await runMigrations(db);
}

async function runMigrations(db: MajalDatabase) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const hasVersion = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1');

  for (const migration of migrations) {
    if (await hasVersion.get(migration.version)) continue;
    await db.transaction(async tx => {
      const sql = db.dialect === 'postgres' ? postgresMigrationSql(migration.sql) : migration.sql;
      await tx.exec(sql);
      await tx.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(?, ?)').run(migration.version, new Date().toISOString());
    });
  }
}

export async function withTransaction<T>(db: MajalDatabase, operation: (tx: MajalDatabase) => Promise<T>): Promise<T> {
  return db.transaction(operation);
}

export async function databaseHealth(db: MajalDatabase) {
  const row = await db.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get<{ version: number | string; applied_at: string }>();
  return { ready: Boolean(row), schemaVersion: row ? Number(row.version) : 0, dialect: db.dialect };
}

export const DATABASE_ROLE_VALUES = ROLE_VALUES;
