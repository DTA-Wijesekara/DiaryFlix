// DiaryFLIX — WatchLogs routes
// GET    /logs              list all entries for current user (JOIN Movies)
// GET    /logs/:id          single entry
// POST   /logs              create — upserts Movie first, then inserts WatchLog
// PUT    /logs/:id          update watch fields + movie metadata
// DELETE /logs/:id          delete WatchLog; deletes Movie if no more watches remain

const express = require('express');
const { getPool, sql } = require('../db');
const {
  authenticateJWT,
  asyncHandler,
  HttpError,
  assertString,
  clampInt,
} = require('../middleware');

const router = express.Router();
router.use(authenticateJWT);

// ── JSON array fields (parsed from DB strings) ──────────────────────────────

const JSON_FIELDS = ['actors', 'actresses', 'favouriteSongs', 'favouriteQuotes', 'genres'];

function parseJsonArray(v) {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

// Convert a JOIN row to the API shape.
// watchCount (from COUNT OVER window) is converted to the legacy rewatchCount field.
function rowToApi(row) {
  if (!row) return null;
  const out = { ...row };
  for (const f of JSON_FIELDS) out[f] = parseJsonArray(row[f]);
  out.rewatchCount = Math.max(0, (out.watchCount || 1) - 1);
  return out;
}

// ── Input sanitisation ───────────────────────────────────────────────────────

function sanitiseMovieFields(body) {
  return {
    title:        assertString(body.title, 'title', { min: 1, max: 500 }),
    type:         body.type         ? String(body.type).slice(0, 32)   : null,
    year:         body.year != null ? String(body.year).slice(0, 16)   : null,
    tmdbId:       clampInt(body.tmdbId, { fallback: null }),
    posterPath:   body.posterPath   ? String(body.posterPath).slice(0, 255)   : null,
    backdropPath: body.backdropPath ? String(body.backdropPath).slice(0, 255) : null,
    overview:     body.overview != null ? String(body.overview) : null,
    director:     body.director     ? String(body.director).slice(0, 255)  : null,
    runtime:      clampInt(body.runtime,  { min: 0, max: 10000, fallback: 0 }),
    industry:     body.industry     ? String(body.industry).slice(0, 64)   : null,
    actors:       Array.isArray(body.actors)    ? body.actors.filter(Boolean).map(String)    : [],
    actresses:    Array.isArray(body.actresses) ? body.actresses.filter(Boolean).map(String) : [],
    genres:       Array.isArray(body.genres)    ? body.genres.filter(Boolean).map(String)    : [],
  };
}

function sanitiseWatchFields(body) {
  return {
    dateWatched:     body.dateWatched ? assertString(body.dateWatched, 'dateWatched', { max: 32 }) : null,
    category:        body.category != null ? String(body.category).slice(0, 255) : null,
    rating:          clampInt(body.rating, { min: 0, max: 10, fallback: 0 }),
    moodBefore:      body.moodBefore   ? String(body.moodBefore).slice(0, 64)   : null,
    moodAfter:       body.moodAfter    ? String(body.moodAfter).slice(0, 64)    : null,
    notes:           body.notes != null ? String(body.notes) : '',
    platform:        body.platform     ? String(body.platform).slice(0, 128)    : null,
    watchedWith:     body.watchedWith  ? String(body.watchedWith).slice(0, 128) : null,
    occasion:        body.occasion     ? String(body.occasion).slice(0, 255)    : null,
    favouriteSongs:  Array.isArray(body.favouriteSongs)  ? body.favouriteSongs  : [],
    favouriteQuotes: Array.isArray(body.favouriteQuotes) ? body.favouriteQuotes.filter(Boolean).map(String) : [],
  };
}

// ── Movie upsert ─────────────────────────────────────────────────────────────
// Finds an existing Movies row for this user (by tmdbId, then by title),
// updates its metadata if found, or creates a new row.  Returns the movieId.

async function upsertMovie(pool, userId, movie) {
  const {
    tmdbId, title, type, year, posterPath, backdropPath, overview,
    director, actors, actresses, genres, runtime, industry,
  } = movie;

  const actorsJson    = JSON.stringify(actors    || []);
  const actressesJson = JSON.stringify(actresses || []);
  const genresJson    = JSON.stringify(genres    || []);

  // Try tmdbId match first
  let existing = null;
  if (tmdbId) {
    const r = await pool.request()
      .input('userId', sql.VarChar, userId)
      .input('tmdbId', sql.Int,     tmdbId)
      .query('SELECT id FROM Movies WHERE userId = @userId AND tmdbId = @tmdbId');
    if (r.recordset.length > 0) existing = r.recordset[0];
  }

  // Fall back to title match (for manually entered films)
  if (!existing) {
    const r = await pool.request()
      .input('userId', sql.VarChar,  userId)
      .input('title',  sql.NVarChar, (title || '').toLowerCase().trim())
      .query('SELECT id FROM Movies WHERE userId = @userId AND LOWER(title) = @title AND tmdbId IS NULL');
    if (r.recordset.length > 0 && !tmdbId) existing = r.recordset[0];
  }

  if (existing) {
    await pool.request()
      .input('id',          sql.VarChar,  existing.id)
      .input('title',       sql.NVarChar, title)
      .input('type',        sql.VarChar,  type)
      .input('year',        sql.VarChar,  year)
      .input('posterPath',  sql.NVarChar, posterPath)
      .input('backdropPath',sql.NVarChar, backdropPath)
      .input('overview',    sql.NVarChar, overview)
      .input('director',    sql.NVarChar, director)
      .input('actors',      sql.NVarChar, actorsJson)
      .input('actresses',   sql.NVarChar, actressesJson)
      .input('genres',      sql.NVarChar, genresJson)
      .input('runtime',     sql.Int,      runtime || 0)
      .input('industry',    sql.VarChar,  industry)
      .query(`
        UPDATE Movies SET
          title = @title, type = @type, year = @year,
          posterPath = @posterPath, backdropPath = @backdropPath, overview = @overview,
          director = @director, actors = @actors, actresses = @actresses,
          genres = @genres, runtime = @runtime, industry = @industry,
          updatedAt = SYSUTCDATETIME()
        WHERE id = @id
      `);
    return existing.id;
  }

  const movieId = `mov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await pool.request()
    .input('id',          sql.VarChar,  movieId)
    .input('userId',      sql.VarChar,  userId)
    .input('tmdbId',      sql.Int,      tmdbId || null)
    .input('title',       sql.NVarChar, title)
    .input('type',        sql.VarChar,  type)
    .input('year',        sql.VarChar,  year)
    .input('posterPath',  sql.NVarChar, posterPath)
    .input('backdropPath',sql.NVarChar, backdropPath)
    .input('overview',    sql.NVarChar, overview)
    .input('director',    sql.NVarChar, director)
    .input('actors',      sql.NVarChar, actorsJson)
    .input('actresses',   sql.NVarChar, actressesJson)
    .input('genres',      sql.NVarChar, genresJson)
    .input('runtime',     sql.Int,      runtime || 0)
    .input('industry',    sql.VarChar,  industry)
    .query(`
      INSERT INTO Movies
        (id, userId, tmdbId, title, type, year, posterPath, backdropPath,
         overview, director, actors, actresses, genres, runtime, industry)
      VALUES
        (@id, @userId, @tmdbId, @title, @type, @year, @posterPath, @backdropPath,
         @overview, @director, @actors, @actresses, @genres, @runtime, @industry)
    `);

  return movieId;
}

// ── Shared SELECT (JOIN + derived watchCount) ────────────────────────────────

const LOG_SELECT = `
  SELECT
    wl.id, wl.userId, wl.movieId,
    wl.dateWatched, wl.rating, wl.category,
    wl.moodBefore, wl.moodAfter, wl.platform, wl.watchedWith, wl.occasion,
    wl.favouriteSongs, wl.favouriteQuotes, wl.notes,
    wl.createdAt, wl.updatedAt,
    m.tmdbId, m.title, m.type, m.year,
    m.posterPath, m.backdropPath, m.overview,
    m.director, m.actors, m.actresses, m.genres, m.runtime, m.industry,
    COUNT(wl.id) OVER (PARTITION BY wl.movieId) AS watchCount
  FROM WatchLogs wl
  LEFT JOIN Movies m ON m.id = wl.movieId
`;

// ── GET /logs ────────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar, req.user.id)
    .query(`
      ${LOG_SELECT}
      WHERE wl.userId = @userId
      ORDER BY
        CASE WHEN wl.dateWatched IS NULL THEN 1 ELSE 0 END,
        wl.dateWatched DESC,
        wl.createdAt DESC
    `);

  res.json(result.recordset.map(rowToApi));
}));

// ── GET /logs/:id ────────────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('id',     sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query(`${LOG_SELECT} WHERE wl.id = @id AND wl.userId = @userId`);

  if (result.recordset.length === 0) throw new HttpError(404, 'Log not found');
  res.json(rowToApi(result.recordset[0]));
}));

// ── POST /logs ───────────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const movie = sanitiseMovieFields(req.body);
  const watch = sanitiseWatchFields(req.body);
  const pool  = await getPool();

  const movieId = await upsertMovie(pool, req.user.id, movie);
  const logId   = `log_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  await pool.request()
    .input('id',             sql.VarChar,  logId)
    .input('userId',         sql.VarChar,  req.user.id)
    .input('movieId',        sql.VarChar,  movieId)
    .input('dateWatched',    sql.VarChar,  watch.dateWatched)
    .input('rating',         sql.Int,      watch.rating)
    .input('category',       sql.NVarChar, watch.category)
    .input('moodBefore',     sql.VarChar,  watch.moodBefore)
    .input('moodAfter',      sql.VarChar,  watch.moodAfter)
    .input('platform',       sql.NVarChar, watch.platform)
    .input('watchedWith',    sql.NVarChar, watch.watchedWith)
    .input('occasion',       sql.NVarChar, watch.occasion)
    .input('favouriteSongs', sql.NVarChar, JSON.stringify(watch.favouriteSongs))
    .input('favouriteQuotes',sql.NVarChar, JSON.stringify(watch.favouriteQuotes))
    .input('notes',          sql.NVarChar, watch.notes)
    .query(`
      INSERT INTO WatchLogs
        (id, userId, movieId, dateWatched, rating, category,
         moodBefore, moodAfter, platform, watchedWith, occasion,
         favouriteSongs, favouriteQuotes, notes, createdAt, updatedAt)
      VALUES
        (@id, @userId, @movieId, @dateWatched, @rating, @category,
         @moodBefore, @moodAfter, @platform, @watchedWith, @occasion,
         @favouriteSongs, @favouriteQuotes, @notes, SYSUTCDATETIME(), SYSUTCDATETIME())
    `);

  const result = await pool.request()
    .input('id',     sql.VarChar, logId)
    .input('userId', sql.VarChar, req.user.id)
    .query(`${LOG_SELECT} WHERE wl.id = @id AND wl.userId = @userId`);

  res.status(201).json(rowToApi(result.recordset[0]));
}));

// ── PUT /logs/:id ────────────────────────────────────────────────────────────
// Updates watch-specific fields on WatchLogs and movie metadata on Movies.
// Since one Movies row is shared by all rewatches of the same film,
// updating metadata (e.g. director typo) fixes it across all entries automatically.

router.put('/:id', asyncHandler(async (req, res) => {
  const pool = await getPool();

  const existing = await pool.request()
    .input('id',     sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query('SELECT id, movieId FROM WatchLogs WHERE id = @id AND userId = @userId');
  if (existing.recordset.length === 0) throw new HttpError(404, 'Log not found');

  const { movieId } = existing.recordset[0];
  const movie = sanitiseMovieFields(req.body);
  const watch = sanitiseWatchFields(req.body);

  if (movieId) {
    await pool.request()
      .input('id',          sql.VarChar,  movieId)
      .input('title',       sql.NVarChar, movie.title)
      .input('type',        sql.VarChar,  movie.type)
      .input('year',        sql.VarChar,  movie.year)
      .input('posterPath',  sql.NVarChar, movie.posterPath)
      .input('backdropPath',sql.NVarChar, movie.backdropPath)
      .input('overview',    sql.NVarChar, movie.overview)
      .input('director',    sql.NVarChar, movie.director)
      .input('actors',      sql.NVarChar, JSON.stringify(movie.actors))
      .input('actresses',   sql.NVarChar, JSON.stringify(movie.actresses))
      .input('genres',      sql.NVarChar, JSON.stringify(movie.genres))
      .input('runtime',     sql.Int,      movie.runtime)
      .input('industry',    sql.VarChar,  movie.industry)
      .query(`
        UPDATE Movies SET
          title = @title, type = @type, year = @year,
          posterPath = @posterPath, backdropPath = @backdropPath, overview = @overview,
          director = @director, actors = @actors, actresses = @actresses,
          genres = @genres, runtime = @runtime, industry = @industry,
          updatedAt = SYSUTCDATETIME()
        WHERE id = @id
      `);
  }

  await pool.request()
    .input('id',             sql.VarChar,  req.params.id)
    .input('userId',         sql.VarChar,  req.user.id)
    .input('dateWatched',    sql.VarChar,  watch.dateWatched)
    .input('rating',         sql.Int,      watch.rating)
    .input('category',       sql.NVarChar, watch.category)
    .input('moodBefore',     sql.VarChar,  watch.moodBefore)
    .input('moodAfter',      sql.VarChar,  watch.moodAfter)
    .input('platform',       sql.NVarChar, watch.platform)
    .input('watchedWith',    sql.NVarChar, watch.watchedWith)
    .input('occasion',       sql.NVarChar, watch.occasion)
    .input('favouriteSongs', sql.NVarChar, JSON.stringify(watch.favouriteSongs))
    .input('favouriteQuotes',sql.NVarChar, JSON.stringify(watch.favouriteQuotes))
    .input('notes',          sql.NVarChar, watch.notes)
    .query(`
      UPDATE WatchLogs SET
        dateWatched = @dateWatched, rating = @rating, category = @category,
        moodBefore = @moodBefore, moodAfter = @moodAfter,
        platform = @platform, watchedWith = @watchedWith, occasion = @occasion,
        favouriteSongs = @favouriteSongs, favouriteQuotes = @favouriteQuotes, notes = @notes,
        updatedAt = SYSUTCDATETIME()
      WHERE id = @id AND userId = @userId
    `);

  const result = await pool.request()
    .input('id',     sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query(`${LOG_SELECT} WHERE wl.id = @id AND wl.userId = @userId`);

  res.json(rowToApi(result.recordset[0]));
}));

// ── DELETE /logs/:id ─────────────────────────────────────────────────────────
// Deletes the WatchLog.  If this was the last watch for that Movie, the Movie
// row is also deleted (no orphan metadata left behind).

router.delete('/:id', asyncHandler(async (req, res) => {
  const pool = await getPool();

  const existing = await pool.request()
    .input('id',     sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query('SELECT id, movieId FROM WatchLogs WHERE id = @id AND userId = @userId');
  if (existing.recordset.length === 0) throw new HttpError(404, 'Log not found');

  const { movieId } = existing.recordset[0];

  await pool.request()
    .input('id',     sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query('DELETE FROM WatchLogs WHERE id = @id AND userId = @userId');

  if (movieId) {
    const remaining = await pool.request()
      .input('movieId', sql.VarChar, movieId)
      .input('userId',  sql.VarChar, req.user.id)
      .query('SELECT COUNT(*) AS cnt FROM WatchLogs WHERE movieId = @movieId AND userId = @userId');

    if (remaining.recordset[0].cnt === 0) {
      await pool.request()
        .input('id',     sql.VarChar, movieId)
        .input('userId', sql.VarChar, req.user.id)
        .query('DELETE FROM Movies WHERE id = @id AND userId = @userId');
    }
  }

  res.json({ success: true });
}));

module.exports = router;
