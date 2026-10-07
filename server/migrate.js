// Explicit schema deployment. Never invoked by the HTTP or MCP server.
const { getPool, closePool, ensureSchema, maybeSeedAdmin, transaction, query } = require('./db');

async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query('SELECT pg_advisory_lock(734921)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map(r => r.version));
    if (!applied.has(1)) {
      await ensureSchema();
      await client.query('INSERT INTO schema_migrations(version) VALUES (1)');
    }
    if (!applied.has(2)) await transaction(async () => {
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0');
      await query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ');
      // Existing users prove ownership through recovery. Do not trust historic links.
      await query('ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT \'reset\'');
      await query('INSERT INTO schema_migrations(version) VALUES (2)');
    });
    if (!applied.has(3)) await transaction(async () => {
      const invalid = await query(`SELECT id FROM movies WHERE tmdb_id IS NOT NULL AND (type IS NULL OR type NOT IN ('movie', 'tv_series')) LIMIT 1`);
      const duplicates = await query(`SELECT user_id, type, tmdb_id FROM movies WHERE tmdb_id IS NOT NULL GROUP BY user_id, type, tmdb_id HAVING COUNT(*) > 1 LIMIT 1`);
      const dangling = await query(`SELECT w.id FROM watchlogs w LEFT JOIN movies m ON m.id=w.movie_id AND m.user_id=w.user_id WHERE m.id IS NULL LIMIT 1`);
      if (invalid.rows.length || duplicates.rows.length || dangling.rows.length) throw new Error('Movie data needs repair. Run npm run db:audit and review before retrying; no data was deleted.');
      await query('CREATE UNIQUE INDEX IF NOT EXISTS ux_movies_external ON movies(user_id, type, tmdb_id) WHERE tmdb_id IS NOT NULL');
      await query('ALTER TABLE movies ADD CONSTRAINT movies_owner_unique UNIQUE (id, user_id)');
      await query('ALTER TABLE watchlogs ALTER COLUMN movie_id SET NOT NULL');
      await query('ALTER TABLE watchlogs ADD CONSTRAINT watchlogs_movie_owner_fk FOREIGN KEY (movie_id, user_id) REFERENCES movies(id, user_id)');
      await query("ALTER TABLE movies ADD CONSTRAINT movies_external_type CHECK (tmdb_id IS NULL OR (type IS NOT NULL AND type IN ('movie', 'tv_series')))");
      await query('INSERT INTO schema_migrations(version) VALUES (3)');
    });
    if (!applied.has(4)) await transaction(async () => {
      await query('CREATE TABLE IF NOT EXISTS graph_snapshots (id INTEGER PRIMARY KEY CHECK(id=1), data JSONB NOT NULL, built_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
      await query('CREATE TABLE IF NOT EXISTS rate_limit_buckets (namespace TEXT NOT NULL, key TEXT NOT NULL, hits INTEGER NOT NULL, expires_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(namespace,key))');
      await query('INSERT INTO schema_migrations(version) VALUES (4)');
    });
    if (!applied.has(5)) await transaction(async () => {
      // Invalidate old recovery links rather than guessing the timezone of legacy values.
      await query('DELETE FROM password_reset_tokens');
      await query("ALTER TABLE password_reset_tokens ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at AT TIME ZONE 'UTC', ALTER COLUMN used_at TYPE TIMESTAMPTZ USING used_at AT TIME ZONE 'UTC', ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC'");
      await query('INSERT INTO schema_migrations(version) VALUES (5)');
    });
    if (!applied.has(6)) await transaction(async () => {
      await require('./lib/tvMigration')(query);
      await query('INSERT INTO schema_migrations(version) VALUES (6)');
    });
    if (!applied.has(7)) await transaction(async () => {
      await query('ALTER TABLE movies ADD COLUMN is_favourite BOOLEAN NOT NULL DEFAULT FALSE');
      await query('INSERT INTO schema_migrations(version) VALUES (7)');
    });
    await maybeSeedAdmin();
  } finally {
    await client.query('SELECT pg_advisory_unlock(734921)');
    client.release();
  }
}
if (require.main === module) migrate().then(() => console.error('Migrations complete')).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(closePool);
module.exports = { migrate };
