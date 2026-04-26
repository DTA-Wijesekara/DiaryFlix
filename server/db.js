// DiaryFLIX — Database layer
// - Auto-detects driver: msnodesqlv8 (Windows/local) → mssql/tedious (Linux/Docker)
// - Validates identifier names before interpolation (no SQL injection surface)
// - Maintains a single connection pool rather than reconnecting per request
// - Seeds an admin only when explicitly enabled via env

const bcrypt = require('bcryptjs');
const config = require('./config');

// Try Windows ODBC driver first (local dev on Windows).
// Falls back to the pure-JS tedious driver for Linux / Docker.
let sql;
let useOdbc = false;
try {
  sql = require('mssql/msnodesqlv8');
  useOdbc = true;
  console.log('[db] Using msnodesqlv8 (Windows ODBC) driver');
} catch {
  sql = require('mssql');
  console.log('[db] Using mssql/tedious driver');
}

// Build the right config object for whichever driver was loaded.
function poolConfig(database) {
  if (useOdbc) {
    const parts = [
      `Driver={${config.db.driver}}`,
      `Server=${config.db.server}`,
      `Database=${database}`,
    ];
    if (config.db.trustedConnection) {
      parts.push('Trusted_Connection=yes');
    } else if (config.db.user && config.db.password) {
      parts.push(`Uid=${config.db.user}`);
      parts.push(`Pwd=${config.db.password}`);
    }
    parts.push('TrustServerCertificate=yes');
    return { connectionString: parts.join(';') + ';' };
  }

  // Standard mssql (tedious) — used in Docker / Linux
  return {
    server: config.db.server,
    database,
    user: config.db.user,
    password: config.db.password,
    options: {
      trustServerCertificate: true,
      enableArithAbort: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
  };
}

let pool = null;

async function getPool() {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(poolConfig(config.db.name)).connect();
  pool.on('error', err => {
    console.error('[db] pool error:', err.message);
  });
  return pool;
}

async function closePool() {
  if (pool) {
    try { await pool.close(); } catch { /* noop */ }
    pool = null;
  }
}

async function ensureDatabaseExists() {
  const master = await new sql.ConnectionPool(poolConfig('master')).connect();

  try {
    const check = await master.request()
      .input('name', sql.VarChar, config.db.name)
      .query('SELECT database_id FROM sys.databases WHERE name = @name');

    if (check.recordset.length === 0) {
      console.log(`[db] Creating database [${config.db.name}]`);
      // config.db.name is validated at boot to /^[A-Za-z_][A-Za-z0-9_]*$/
      await master.request().query(`CREATE DATABASE [${config.db.name}]`);
    }
  } finally {
    await master.close();
  }
}

async function ensureSchema() {
  const p = await getPool();

  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'Users' AND xtype = 'U')
    CREATE TABLE Users (
      id           VARCHAR(100) PRIMARY KEY,
      email        VARCHAR(255) UNIQUE NOT NULL,
      displayName  NVARCHAR(255) NOT NULL,
      passwordHash VARCHAR(255) NOT NULL,
      salt         VARCHAR(255) NOT NULL,
      role         VARCHAR(20)  NOT NULL DEFAULT 'user',
      avatar       NVARCHAR(64),
      isActive     BIT          NOT NULL DEFAULT 1,
      createdAt    DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
      lastLogin    DATETIME2    NULL
    );
  `);

  // Movies: one row per unique film per user.
  // All TMDB/manual metadata lives here; WatchLogs reference this via movieId.
  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'Movies' AND xtype = 'U')
    CREATE TABLE Movies (
      id           VARCHAR(100) PRIMARY KEY,
      userId       VARCHAR(100) NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      tmdbId       INT          NULL,
      title        NVARCHAR(500) NOT NULL,
      type         VARCHAR(32)  NULL,
      year         VARCHAR(16)  NULL,
      posterPath   NVARCHAR(255) NULL,
      backdropPath NVARCHAR(255) NULL,
      overview     NVARCHAR(MAX) NULL,
      director     NVARCHAR(255) NULL,
      actors       NVARCHAR(MAX) NULL,
      actresses    NVARCHAR(MAX) NULL,
      genres       NVARCHAR(MAX) NULL,
      runtime      INT          NULL,
      industry     VARCHAR(64)  NULL,
      createdAt    DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
      updatedAt    DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  // WatchLogs: one row per watch event (first watch + every rewatch).
  // watchCount is derived by COUNT(*) per movieId — no stored counter.
  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'WatchLogs' AND xtype = 'U')
    CREATE TABLE WatchLogs (
      id              VARCHAR(100) PRIMARY KEY,
      userId          VARCHAR(100) NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      movieId         VARCHAR(100) NULL,
      dateWatched     VARCHAR(32)  NULL,
      category        NVARCHAR(255) NULL,
      rating          INT          NULL,
      moodBefore      VARCHAR(64)  NULL,
      moodAfter       VARCHAR(64)  NULL,
      favouriteSongs  NVARCHAR(MAX) NULL,
      favouriteQuotes NVARCHAR(MAX) NULL,
      notes           NVARCHAR(MAX) NULL,
      platform        NVARCHAR(128) NULL,
      watchedWith     NVARCHAR(128) NULL,
      occasion        NVARCHAR(255) NULL,
      createdAt       DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME(),
      updatedAt       DATETIME2    NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  // Additive migrations for pre-existing installs (safe to re-run).
  // These add columns that existed in the old single-table schema.
  const addColumnIfMissing = async (table, column, type) => {
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE Name = N'${column}' AND Object_ID = Object_ID(N'${table}')
      )
      ALTER TABLE ${table} ADD ${column} ${type} NULL;
    `);
  };

  // Ensure movieId exists on pre-existing WatchLogs tables.
  await addColumnIfMissing('WatchLogs', 'movieId', 'VARCHAR(100)');

  // The old schema had title NOT NULL on WatchLogs; new inserts no longer supply it.
  // Make it nullable so existing tables don't reject new rows.
  await p.request().query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns
      WHERE Name = N'title'
        AND Object_ID = Object_ID(N'WatchLogs')
        AND is_nullable = 0
    )
    ALTER TABLE WatchLogs ALTER COLUMN title NVARCHAR(500) NULL;
  `);

  // Legacy columns may still exist on old WatchLogs tables — leave them in place.
  // New inserts no longer write to them; the JOIN with Movies is the source of truth.

  // Indexes
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Movies_userId_tmdbId')
    CREATE INDEX IX_Movies_userId_tmdbId ON Movies (userId, tmdbId)
    WHERE tmdbId IS NOT NULL;
  `);
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WatchLogs_movieId')
    CREATE INDEX IX_WatchLogs_movieId ON WatchLogs (movieId);
  `);
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WatchLogs_userId_dateWatched')
    CREATE INDEX IX_WatchLogs_userId_dateWatched ON WatchLogs (userId, dateWatched DESC);
  `);
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WatchLogs_userId_createdAt')
    CREATE INDEX IX_WatchLogs_userId_createdAt ON WatchLogs (userId, createdAt DESC);
  `);
}

// One-time migration: for every WatchLog that pre-dates the Movies table,
// create a Movies row from the embedded metadata and link it via movieId.
async function migrateMoviesTable(p) {
  const check = await p.request().query(
    'SELECT COUNT(*) AS cnt FROM WatchLogs WHERE movieId IS NULL'
  );
  if (check.recordset[0].cnt === 0) return;

  console.log('[db] Migrating existing WatchLogs to Movies table…');

  const rows = await p.request().query(
    'SELECT * FROM WatchLogs WHERE movieId IS NULL ORDER BY createdAt ASC'
  );

  // Track already-created Movies rows within this migration run.
  const processed = new Map(); // compositeKey → movieId

  for (const row of rows.recordset) {
    const titleNorm = (row.title || '').toLowerCase().trim();
    const key = `${row.userId}:${row.tmdbId ? `id:${row.tmdbId}` : `title:${titleNorm}`}`;

    let movieId;

    if (processed.has(key)) {
      movieId = processed.get(key);
    } else {
      // Check if a Movies row was already created (e.g. partial migration).
      let existing = null;
      if (row.tmdbId) {
        const r = await p.request()
          .input('userId', sql.VarChar, row.userId)
          .input('tmdbId', sql.Int, row.tmdbId)
          .query('SELECT id FROM Movies WHERE userId = @userId AND tmdbId = @tmdbId');
        if (r.recordset.length > 0) existing = r.recordset[0];
      }
      if (!existing) {
        const r = await p.request()
          .input('userId', sql.VarChar, row.userId)
          .input('title', sql.NVarChar, titleNorm)
          .query('SELECT id FROM Movies WHERE userId = @userId AND LOWER(title) = @title');
        if (r.recordset.length > 0) existing = r.recordset[0];
      }

      if (existing) {
        movieId = existing.id;
      } else {
        movieId = `mov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
        await p.request()
          .input('id',          sql.VarChar,  movieId)
          .input('userId',      sql.VarChar,  row.userId)
          .input('tmdbId',      sql.Int,      row.tmdbId || null)
          .input('title',       sql.NVarChar, row.title || 'Untitled')
          .input('type',        sql.VarChar,  row.type || null)
          .input('year',        sql.VarChar,  row.year || null)
          .input('posterPath',  sql.NVarChar, row.posterPath || null)
          .input('backdropPath',sql.NVarChar, row.backdropPath || null)
          .input('overview',    sql.NVarChar, row.overview || null)
          .input('director',    sql.NVarChar, row.director || null)
          .input('actors',      sql.NVarChar, row.actors   || '[]')
          .input('actresses',   sql.NVarChar, row.actresses || '[]')
          .input('genres',      sql.NVarChar, row.genres   || '[]')
          .input('runtime',     sql.Int,      row.runtime  || 0)
          .input('industry',    sql.VarChar,  row.industry || null)
          .query(`
            INSERT INTO Movies
              (id, userId, tmdbId, title, type, year, posterPath, backdropPath,
               overview, director, actors, actresses, genres, runtime, industry)
            VALUES
              (@id, @userId, @tmdbId, @title, @type, @year, @posterPath, @backdropPath,
               @overview, @director, @actors, @actresses, @genres, @runtime, @industry)
          `);
      }

      processed.set(key, movieId);
    }

    await p.request()
      .input('id',      sql.VarChar, row.id)
      .input('movieId', sql.VarChar, movieId)
      .query('UPDATE WatchLogs SET movieId = @movieId WHERE id = @id');
  }

  console.log(`[db] Migrated ${rows.recordset.length} WatchLog(s).`);
}

async function maybeSeedAdmin() {
  if (!config.adminSeed.enabled) return;
  if (!config.adminSeed.email || !config.adminSeed.password) {
    console.warn('[db] SEED_ADMIN=true but SEED_ADMIN_EMAIL/PASSWORD not set. Skipping.');
    return;
  }

  const p = await getPool();

  const existing = await p.request()
    .input('email', sql.VarChar, config.adminSeed.email)
    .query('SELECT id FROM Users WHERE email = @email');

  if (existing.recordset.length > 0) return;

  const salt = await bcrypt.genSalt(config.bcryptRounds);
  const hash = await bcrypt.hash(config.adminSeed.password, salt);
  const adminId = 'admin_' + Date.now().toString(36);

  await p.request()
    .input('id', sql.VarChar, adminId)
    .input('email', sql.VarChar, config.adminSeed.email)
    .input('displayName', sql.NVarChar, config.adminSeed.displayName)
    .input('passwordHash', sql.VarChar, hash)
    .input('salt', sql.VarChar, salt)
    .input('role', sql.VarChar, 'admin')
    .input('avatar', sql.NVarChar, 'A')
    .query(`
      INSERT INTO Users (id, email, displayName, passwordHash, salt, role, avatar, isActive)
      VALUES (@id, @email, @displayName, @passwordHash, @salt, @role, @avatar, 1)
    `);

  console.log(`[db] Seeded admin account <${config.adminSeed.email}>.`);
}

async function initDB() {
  console.log(`[db] Connecting to ${config.db.server}...`);
  await ensureDatabaseExists();
  await ensureSchema();
  const p = await getPool();
  await migrateMoviesTable(p);
  await maybeSeedAdmin();
  console.log('[db] Ready.');
}

module.exports = { initDB, getPool, closePool, sql };
