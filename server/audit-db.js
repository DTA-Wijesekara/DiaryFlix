const { query, closePool } = require('./db');
(async () => {
  const duplicates = await query('SELECT user_id, type, tmdb_id, array_agg(id) AS ids FROM movies WHERE tmdb_id IS NOT NULL GROUP BY user_id, type, tmdb_id HAVING COUNT(*) > 1');
  const orphaned = await query('SELECT w.id, w.movie_id FROM watchlogs w LEFT JOIN movies m ON m.id=w.movie_id AND m.user_id=w.user_id WHERE m.id IS NULL');
  const invalidTypes = await query("SELECT id, type FROM movies WHERE tmdb_id IS NOT NULL AND (type IS NULL OR type NOT IN ('movie', 'tv_series'))");
  console.log(JSON.stringify({ duplicates: duplicates.rows, orphaned: orphaned.rows, invalidTypes: invalidTypes.rows }, null, 2));
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(closePool);
