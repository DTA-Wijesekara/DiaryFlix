// CineLog — WatchLogs routes
// GET    /logs              list for current user
// POST   /logs              create
// PUT    /logs/:id          update
// DELETE /logs/:id          delete
// PUT    /logs/:id/rewatch  increment rewatch counter

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

// ---- Row <-> API shape ----

const JSON_FIELDS = ['actors', 'actresses', 'favouriteSongs', 'favouriteQuotes', 'genres'];

function parseJsonArray(v) {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToApi(row) {
  if (!row) return null;
  const out = { ...row };
  for (const f of JSON_FIELDS) out[f] = parseJsonArray(row[f]);
  out.isActive = row.isActive !== undefined ? !!row.isActive : undefined;
  return out;
}

// Sanitise / clamp inbound payload.
function sanitiseLog(body) {
  const clean = {};

  clean.title         = assertString(body.title, 'title', { min: 1, max: 500 });
  clean.dateWatched   = body.dateWatched ? assertString(body.dateWatched, 'dateWatched', { max: 32 }) : null;
  clean.category      = body.category != null ? String(body.category).slice(0, 255) : null;
  clean.industry      = body.industry ? String(body.industry).slice(0, 64) : null;
  clean.moodBefore    = body.moodBefore ? String(body.moodBefore).slice(0, 64) : null;
  clean.moodAfter     = body.moodAfter ? String(body.moodAfter).slice(0, 64) : null;
  clean.notes         = body.notes != null ? String(body.notes) : '';
  clean.director      = body.director ? String(body.director).slice(0, 255) : null;
  clean.platform      = body.platform ? String(body.platform).slice(0, 128) : null;
  clean.watchedWith   = body.watchedWith ? String(body.watchedWith).slice(0, 128) : null;
  clean.occasion      = body.occasion ? String(body.occasion).slice(0, 255) : null;
  clean.year          = body.year != null ? String(body.year).slice(0, 16) : null;
  clean.type          = body.type ? String(body.type).slice(0, 32) : null;
  clean.posterPath    = body.posterPath ? String(body.posterPath).slice(0, 255) : null;
  clean.backdropPath  = body.backdropPath ? String(body.backdropPath).slice(0, 255) : null;
  clean.overview      = body.overview != null ? String(body.overview) : null;

  clean.rating        = clampInt(body.rating, { min: 0, max: 10, fallback: 0 });
  clean.runtime       = clampInt(body.runtime, { min: 0, max: 10000, fallback: 0 });
  clean.tmdbId        = clampInt(body.tmdbId, { fallback: null });
  clean.rewatchCount  = clampInt(body.rewatchCount, { min: 0, max: 10000, fallback: 0 });

  // JSON arrays
  clean.actors          = Array.isArray(body.actors) ? body.actors.filter(Boolean).map(String) : [];
  clean.actresses       = Array.isArray(body.actresses) ? body.actresses.filter(Boolean).map(String) : [];
  clean.favouriteSongs  = Array.isArray(body.favouriteSongs) ? body.favouriteSongs : [];
  clean.favouriteQuotes = Array.isArray(body.favouriteQuotes) ? body.favouriteQuotes.filter(Boolean).map(String) : [];
  clean.genres          = Array.isArray(body.genres) ? body.genres.filter(Boolean).map(String) : [];

  return clean;
}

function bindLog(request, log) {
  request
    .input('title', sql.NVarChar, log.title)
    .input('dateWatched', sql.VarChar, log.dateWatched)
    .input('actors', sql.NVarChar, JSON.stringify(log.actors))
    .input('actresses', sql.NVarChar, JSON.stringify(log.actresses))
    .input('category', sql.NVarChar, log.category)
    .input('rating', sql.Int, log.rating)
    .input('industry', sql.VarChar, log.industry)
    .input('moodBefore', sql.VarChar, log.moodBefore)
    .input('moodAfter', sql.VarChar, log.moodAfter)
    .input('favouriteSongs', sql.NVarChar, JSON.stringify(log.favouriteSongs))
    .input('favouriteQuotes', sql.NVarChar, JSON.stringify(log.favouriteQuotes))
    .input('notes', sql.NVarChar, log.notes)
    .input('director', sql.NVarChar, log.director)
    .input('runtime', sql.Int, log.runtime)
    .input('platform', sql.NVarChar, log.platform)
    .input('watchedWith', sql.NVarChar, log.watchedWith)
    .input('occasion', sql.NVarChar, log.occasion)
    .input('year', sql.VarChar, log.year)
    .input('type', sql.VarChar, log.type)
    .input('tmdbId', sql.Int, log.tmdbId)
    .input('posterPath', sql.NVarChar, log.posterPath)
    .input('backdropPath', sql.NVarChar, log.backdropPath)
    .input('overview', sql.NVarChar, log.overview)
    .input('genres', sql.NVarChar, JSON.stringify(log.genres));
  return request;
}

// ---- GET /logs ----

router.get('/', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar, req.user.id)
    .query(`
      SELECT * FROM WatchLogs
      WHERE userId = @userId
      ORDER BY
        CASE WHEN dateWatched IS NULL THEN 1 ELSE 0 END,
        dateWatched DESC,
        createdAt DESC
    `);

  res.json(result.recordset.map(rowToApi));
}));

// ---- GET /logs/:id ----

router.get('/:id', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query('SELECT * FROM WatchLogs WHERE id = @id AND userId = @userId');

  if (result.recordset.length === 0) throw new HttpError(404, 'Log not found');
  res.json(rowToApi(result.recordset[0]));
}));

// ---- POST /logs ----

router.post('/', asyncHandler(async (req, res) => {
  const clean = sanitiseLog(req.body);
  const id = `log_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const pool = await getPool();
  const request = pool.request()
    .input('id', sql.VarChar, id)
    .input('userId', sql.VarChar, req.user.id);
  bindLog(request, clean);

  await request.query(`
    INSERT INTO WatchLogs (
      id, userId, title, dateWatched, actors, actresses, category, rating,
      industry, moodBefore, moodAfter, favouriteSongs, favouriteQuotes, notes,
      director, runtime, platform, watchedWith, occasion, year, type,
      tmdbId, posterPath, backdropPath, overview, genres,
      rewatchCount, createdAt, updatedAt
    ) VALUES (
      @id, @userId, @title, @dateWatched, @actors, @actresses, @category, @rating,
      @industry, @moodBefore, @moodAfter, @favouriteSongs, @favouriteQuotes, @notes,
      @director, @runtime, @platform, @watchedWith, @occasion, @year, @type,
      @tmdbId, @posterPath, @backdropPath, @overview, @genres,
      0, SYSUTCDATETIME(), SYSUTCDATETIME()
    )
  `);

  const result = await pool.request()
    .input('id', sql.VarChar, id)
    .query('SELECT * FROM WatchLogs WHERE id = @id');

  res.status(201).json(rowToApi(result.recordset[0]));
}));

// ---- PUT /logs/:id ----

router.put('/:id', asyncHandler(async (req, res) => {
  const pool = await getPool();

  const existing = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query('SELECT id FROM WatchLogs WHERE id = @id AND userId = @userId');
  if (existing.recordset.length === 0) throw new HttpError(404, 'Log not found');

  const clean = sanitiseLog(req.body);

  const request = pool.request()
    .input('id', sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id);
  bindLog(request, clean);

  await request.query(`
    UPDATE WatchLogs SET
      title = @title, dateWatched = @dateWatched, actors = @actors, actresses = @actresses,
      category = @category, rating = @rating, industry = @industry,
      moodBefore = @moodBefore, moodAfter = @moodAfter,
      favouriteSongs = @favouriteSongs, favouriteQuotes = @favouriteQuotes, notes = @notes,
      director = @director, runtime = @runtime, platform = @platform,
      watchedWith = @watchedWith, occasion = @occasion, year = @year, type = @type,
      tmdbId = @tmdbId, posterPath = @posterPath, backdropPath = @backdropPath,
      overview = @overview, genres = @genres,
      updatedAt = SYSUTCDATETIME()
    WHERE id = @id AND userId = @userId
  `);

  const result = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .query('SELECT * FROM WatchLogs WHERE id = @id');

  res.json(rowToApi(result.recordset[0]));
}));

// ---- DELETE /logs/:id ----

router.delete('/:id', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query('DELETE FROM WatchLogs WHERE id = @id AND userId = @userId');

  if (result.rowsAffected[0] === 0) throw new HttpError(404, 'Log not found');
  res.json({ success: true });
}));

// ---- PUT /logs/:id/rewatch ----

router.put('/:id/rewatch', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .input('userId', sql.VarChar, req.user.id)
    .query(`
      UPDATE WatchLogs
      SET rewatchCount = rewatchCount + 1,
          lastRewatched = CONVERT(VARCHAR(32), SYSUTCDATETIME(), 126),
          updatedAt = SYSUTCDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @id AND userId = @userId
    `);

  if (result.recordset.length === 0) throw new HttpError(404, 'Log not found');
  res.json(rowToApi(result.recordset[0]));
}));

module.exports = router;
