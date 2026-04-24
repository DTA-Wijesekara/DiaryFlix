// CineLog — Database layer
// - Validates identifier names before interpolation (no SQL injection surface)
// - Maintains a single connection pool rather than reconnecting per request
// - Seeds an admin only when explicitly enabled via env

const sql = require('mssql/msnodesqlv8');
const bcrypt = require('bcryptjs');
const config = require('./config');

function connectionString(database) {
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
  return parts.join(';') + ';';
}

let pool = null;

async function getPool() {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool({
    connectionString: connectionString(config.db.name),
  }).connect();
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
  const master = await new sql.ConnectionPool({
    connectionString: connectionString('master'),
  }).connect();

  try {
    // Parameterised check
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

  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name = 'WatchLogs' AND xtype = 'U')
    CREATE TABLE WatchLogs (
      id              VARCHAR(100) PRIMARY KEY,
      userId          VARCHAR(100) NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
      title           NVARCHAR(500) NOT NULL,
      dateWatched     VARCHAR(32)  NULL,
      actors          NVARCHAR(MAX) NULL,
      actresses       NVARCHAR(MAX) NULL,
      category        NVARCHAR(255) NULL,
      rating          INT NULL,
      industry        VARCHAR(64) NULL,
      moodBefore      VARCHAR(64) NULL,
      moodAfter       VARCHAR(64) NULL,
      favouriteSongs  NVARCHAR(MAX) NULL,
      favouriteQuotes NVARCHAR(MAX) NULL,
      notes           NVARCHAR(MAX) NULL,
      director        NVARCHAR(255) NULL,
      runtime         INT NULL,
      platform        NVARCHAR(128) NULL,
      watchedWith     NVARCHAR(128) NULL,
      occasion        NVARCHAR(255) NULL,
      year            VARCHAR(16) NULL,
      type            VARCHAR(32) NULL,
      tmdbId          INT NULL,
      posterPath      NVARCHAR(255) NULL,
      backdropPath    NVARCHAR(255) NULL,
      overview        NVARCHAR(MAX) NULL,
      genres          NVARCHAR(MAX) NULL,
      rewatchCount    INT NOT NULL DEFAULT 0,
      lastRewatched   VARCHAR(32) NULL,
      createdAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      updatedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  // Additive migrations for pre-existing installs (safe to re-run)
  const addColumnIfMissing = async (table, column, type) => {
    await p.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM sys.columns
        WHERE Name = N'${column}' AND Object_ID = Object_ID(N'${table}')
      )
      ALTER TABLE ${table} ADD ${column} ${type} NULL;
    `);
  };

  for (const [col, type] of [
    ['moodAfter', 'VARCHAR(64)'],
    ['director', 'NVARCHAR(255)'],
    ['runtime', 'INT'],
    ['platform', 'NVARCHAR(128)'],
    ['watchedWith', 'NVARCHAR(128)'],
    ['occasion', 'NVARCHAR(255)'],
    ['year', 'VARCHAR(16)'],
    ['type', 'VARCHAR(32)'],
    ['tmdbId', 'INT'],
    ['posterPath', 'NVARCHAR(255)'],
    ['backdropPath', 'NVARCHAR(255)'],
    ['overview', 'NVARCHAR(MAX)'],
    ['genres', 'NVARCHAR(MAX)'],
  ]) {
    await addColumnIfMissing('WatchLogs', col, type);
  }

  // Helpful indexes
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WatchLogs_userId_dateWatched')
    CREATE INDEX IX_WatchLogs_userId_dateWatched ON WatchLogs (userId, dateWatched DESC);
  `);
  await p.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_WatchLogs_userId_createdAt')
    CREATE INDEX IX_WatchLogs_userId_createdAt ON WatchLogs (userId, createdAt DESC);
  `);
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
  await maybeSeedAdmin();
  console.log('[db] Ready.');
}

module.exports = { initDB, getPool, closePool, sql };
