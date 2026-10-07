// DiaryFLIX — Database layer (PostgreSQL / Neon)
// Uses the 'pg' Pool. Connection string comes from DATABASE_URL env var.
// Named-parameter helper: write SQL with @name placeholders, pass { name: value } objects.

const bcrypt = require('bcryptjs');
const config = require('./config');
const { Pool } = require('pg');
const { createDatabaseStream } = require('./lib/databaseSocket');
const { AsyncLocalStorage } = require('async_hooks');
const transactionContext = new AsyncLocalStorage();

let pool = null;

function getPool() {
  if (!pool) {
    const url = new URL(config.db.url);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    pool = new Pool({
      connectionString: url.toString(),
      ...(process.env.DB_IP_FAMILY ? { stream: createDatabaseStream(Number(process.env.DB_IP_FAMILY)) } : {}),
      connectionTimeoutMillis: 15000,
      keepAlive: true,
      ssl: config.db.ssl ? { rejectUnauthorized: true, ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) } : false,
    });
    pool.on('error', err => console.error('[db] pool error:', err.message));
  }
  return pool;
}

async function closePool() {
  if (pool) {
    try { await pool.end(); } catch { }
    pool = null;
  }
}

// Named-parameter query helper.
// Write SQL with @name placeholders; pass params as { name: value }.
// Each @name occurrence is replaced with $N in order (duplicates get separate $N with same value — pg handles this fine).
async function query(sql, params = {}) {
  const p = transactionContext.getStore() || getPool();
  const values = [];
  const text = sql.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|@(\w+)/g, (match, name) => {
    if (!name) return match;
    if (!Object.prototype.hasOwnProperty.call(params, name)) throw new Error('Missing SQL parameter: ' + name);
    values.push(params[name]);
    return `$${values.length}`;
  });
  return p.query(text, values);
}

// All queries inside the callback use the same connection, including nested services.
async function transaction(fn) {
  if (transactionContext.getStore()) return fn();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await transactionContext.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function ensureSchema() {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            VARCHAR(100) PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      display_name  VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NULL,
      salt          VARCHAR(255) NULL,
      role          VARCHAR(20)  NOT NULL DEFAULT 'user',
      avatar        VARCHAR(64),
      is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
      google_id     VARCHAR(64)  NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
      last_login    TIMESTAMP    NULL
    )
  `);

  // Migrations for pre-existing databases (idempotent — safe to run repeatedly)
  await p.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(64) NULL`);
  await p.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
  await p.query(`ALTER TABLE users ALTER COLUMN salt DROP NOT NULL`);

  await p.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id            VARCHAR(100) PRIMARY KEY,
      user_id       VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tmdb_id       INTEGER      NULL,
      title         VARCHAR(500) NOT NULL,
      type          VARCHAR(32)  NULL,
      year          VARCHAR(16)  NULL,
      poster_path   VARCHAR(255) NULL,
      backdrop_path VARCHAR(255) NULL,
      overview      TEXT         NULL,
      director      VARCHAR(255) NULL,
      actors        TEXT         NULL,
      actresses     TEXT         NULL,
      genres        TEXT         NULL,
      runtime       INTEGER      NULL,
      industry      VARCHAR(64)  NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS watchlogs (
      id               VARCHAR(100) PRIMARY KEY,
      user_id          VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      movie_id         VARCHAR(100) NULL,
      date_watched     VARCHAR(32)  NULL,
      category         VARCHAR(255) NULL,
      rating           INTEGER      NULL,
      mood_before      VARCHAR(64)  NULL,
      mood_after       VARCHAR(64)  NULL,
      favourite_songs  TEXT         NULL,
      favourite_quotes TEXT         NULL,
      notes            TEXT         NULL,
      platform         VARCHAR(128) NULL,
      watched_with     VARCHAR(128) NULL,
      occasion         VARCHAR(255) NULL,
      created_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMP    NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id            VARCHAR(100) PRIMARY KEY,
      user_id       VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tmdb_id       INTEGER      NULL,
      title         VARCHAR(500) NOT NULL,
      type          VARCHAR(32)  NULL,
      year          VARCHAR(16)  NULL,
      poster_path   VARCHAR(255) NULL,
      backdrop_path VARCHAR(255) NULL,
      overview      TEXT         NULL,
      industry      VARCHAR(64)  NULL,
      planned_date  VARCHAR(32)  NULL,
      note          TEXT         NULL,
      source        VARCHAR(255) NULL,
      created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash  VARCHAR(128) PRIMARY KEY,
      user_id     VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TIMESTAMP    NOT NULL,
      used_at     TIMESTAMP    NULL,
      created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
    )
  `);

  await p.query(`CREATE INDEX IF NOT EXISTS ix_password_reset_user ON password_reset_tokens (user_id)`);
  await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id) WHERE google_id IS NOT NULL`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_movies_user_tmdb    ON movies    (user_id, tmdb_id) WHERE tmdb_id IS NOT NULL`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_watchlogs_movie      ON watchlogs (movie_id)`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_watchlogs_user_date  ON watchlogs (user_id, date_watched DESC)`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_watchlogs_user_creat ON watchlogs (user_id, created_at  DESC)`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_wishlist_user_date   ON wishlist  (user_id, planned_date)`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_wishlist_user_creat  ON wishlist  (user_id, created_at DESC)`);
}

async function maybeSeedAdmin() {
  if (!config.adminSeed.enabled) return;
  if (!config.adminSeed.email || !config.adminSeed.password) {
    console.warn('[db] SEED_ADMIN=true but SEED_ADMIN_EMAIL/PASSWORD not set. Skipping.');
    return;
  }

  const created = await transaction(async () => {
  await query('SELECT pg_advisory_xact_lock(734922)');
  const existing = await query('SELECT id FROM users WHERE email = @email', { email: config.adminSeed.email });
  if (existing.rows.length > 0) return;

  const count = (await query("SELECT COUNT(*)::int AS cnt FROM users WHERE role='admin'")).rows[0].cnt;
  if (count >= 3) throw new Error('Only 3 admin accounts are allowed; admin seeding stopped');

  const salt = await bcrypt.genSalt(config.bcryptRounds);
  const hash = await bcrypt.hash(config.adminSeed.password, salt);
  const adminId = 'admin_' + Date.now().toString(36);

  await query(`
    INSERT INTO users (id, email, display_name, password_hash, salt, role, avatar, is_active)
    VALUES (@id, @email, @displayName, @passwordHash, @salt, 'admin', 'A', TRUE)
  `, {
    id: adminId,
    email: config.adminSeed.email,
    displayName: config.adminSeed.displayName,
    passwordHash: hash,
    salt,
  });

  return true;
  });
  if (!created) return;

  console.log(`[db] Seeded admin account <${config.adminSeed.email}>.`);
}

async function findAuthUser(id) {
  return (await query('SELECT id, email, role, is_active, auth_version, email_verified_at FROM users WHERE id = @id', { id })).rows[0];
}

async function initDB() {
  const { rows } = await query('SELECT MAX(version) AS version FROM schema_migrations');
  if (rows[0]?.version !== 7) throw new Error('Run npm run db:migrate before starting the application');
}

module.exports = { initDB, getPool, closePool, query, transaction, ensureSchema, maybeSeedAdmin, findAuthUser };
