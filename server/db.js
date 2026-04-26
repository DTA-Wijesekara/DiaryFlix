// DiaryFLIX — Database layer (PostgreSQL / Neon)
// Uses the 'pg' Pool. Connection string comes from DATABASE_URL env var.
// Named-parameter helper: write SQL with @name placeholders, pass { name: value } objects.

const bcrypt = require('bcryptjs');
const config = require('./config');
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.db.url,
      ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
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
  const p = getPool();
  const values = [];
  const text = sql.replace(/@(\w+)/g, (_, name) => {
    values.push(name in params ? params[name] : null);
    return `$${values.length}`;
  });
  return p.query(text, values);
}

async function ensureSchema() {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            VARCHAR(100) PRIMARY KEY,
      email         VARCHAR(255) UNIQUE NOT NULL,
      display_name  VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      salt          VARCHAR(255) NOT NULL,
      role          VARCHAR(20)  NOT NULL DEFAULT 'user',
      avatar        VARCHAR(64),
      is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
      last_login    TIMESTAMP    NULL
    )
  `);

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

  await p.query(`CREATE INDEX IF NOT EXISTS ix_movies_user_tmdb    ON movies    (user_id, tmdb_id) WHERE tmdb_id IS NOT NULL`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_watchlogs_movie      ON watchlogs (movie_id)`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_watchlogs_user_date  ON watchlogs (user_id, date_watched DESC)`);
  await p.query(`CREATE INDEX IF NOT EXISTS ix_watchlogs_user_creat ON watchlogs (user_id, created_at  DESC)`);
}

async function maybeSeedAdmin() {
  if (!config.adminSeed.enabled) return;
  if (!config.adminSeed.email || !config.adminSeed.password) {
    console.warn('[db] SEED_ADMIN=true but SEED_ADMIN_EMAIL/PASSWORD not set. Skipping.');
    return;
  }

  const existing = await query('SELECT id FROM users WHERE email = @email', { email: config.adminSeed.email });
  if (existing.rows.length > 0) return;

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

  console.log(`[db] Seeded admin account <${config.adminSeed.email}>.`);
}

async function initDB() {
  console.log('[db] Connecting...');
  await ensureSchema();
  await maybeSeedAdmin();
  console.log('[db] Ready.');
}

module.exports = { initDB, getPool, closePool, query };
