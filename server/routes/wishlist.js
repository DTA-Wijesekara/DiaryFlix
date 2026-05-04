// DiaryFLIX — Wishlist routes
// GET    /wishlist          list all wishlist items for current user
// GET    /wishlist/:id      single item
// POST   /wishlist          create
// PUT    /wishlist/:id      update (reschedule, edit note, etc.)
// DELETE /wishlist/:id      delete

const express = require('express');
const { query } = require('../db');
const {
  authenticateJWT,
  asyncHandler,
  HttpError,
  assertString,
  clampInt,
} = require('../middleware');

const router = express.Router();
router.use(authenticateJWT);

const SELECT = `
  SELECT
    id,
    user_id        AS "userId",
    tmdb_id        AS "tmdbId",
    title,
    type,
    year,
    poster_path    AS "posterPath",
    backdrop_path  AS "backdropPath",
    overview,
    industry,
    planned_date   AS "plannedDate",
    note,
    source,
    created_at     AS "createdAt",
    updated_at     AS "updatedAt"
  FROM wishlist
`;

function sanitise(body) {
  return {
    title:        assertString(body.title, 'title', { min: 1, max: 500 }),
    type:         body.type         ? String(body.type).slice(0, 32)         : null,
    year:         body.year != null ? String(body.year).slice(0, 16)         : null,
    tmdbId:       clampInt(body.tmdbId, { fallback: null }),
    posterPath:   body.posterPath   ? String(body.posterPath).slice(0, 255)  : null,
    backdropPath: body.backdropPath ? String(body.backdropPath).slice(0, 255): null,
    overview:     body.overview != null ? String(body.overview)              : null,
    industry:     body.industry     ? String(body.industry).slice(0, 64)     : null,
    plannedDate:  body.plannedDate  ? String(body.plannedDate).slice(0, 32)  : null,
    note:         body.note != null ? String(body.note)                      : null,
    source:       body.source       ? String(body.source).slice(0, 255)      : null,
  };
}

// GET /wishlist
router.get('/', asyncHandler(async (req, res) => {
  const result = await query(`
    ${SELECT}
    WHERE user_id = @userId
    ORDER BY
      CASE WHEN planned_date IS NULL THEN 1 ELSE 0 END,
      planned_date ASC,
      created_at  DESC
  `, { userId: req.user.id });
  res.json(result.rows);
}));

// GET /wishlist/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const result = await query(
    `${SELECT} WHERE id = @id AND user_id = @userId`,
    { id: req.params.id, userId: req.user.id }
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Wishlist item not found');
  res.json(result.rows[0]);
}));

// POST /wishlist
router.post('/', asyncHandler(async (req, res) => {
  const data = sanitise(req.body);
  const id = `wsh_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  await query(`
    INSERT INTO wishlist
      (id, user_id, tmdb_id, title, type, year, poster_path, backdrop_path,
       overview, industry, planned_date, note, source)
    VALUES
      (@id, @userId, @tmdbId, @title, @type, @year, @posterPath, @backdropPath,
       @overview, @industry, @plannedDate, @note, @source)
  `, { id, userId: req.user.id, ...data });

  const result = await query(
    `${SELECT} WHERE id = @id AND user_id = @userId`,
    { id, userId: req.user.id }
  );
  res.status(201).json(result.rows[0]);
}));

// PUT /wishlist/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const existing = await query(
    'SELECT id FROM wishlist WHERE id = @id AND user_id = @userId',
    { id: req.params.id, userId: req.user.id }
  );
  if (existing.rows.length === 0) throw new HttpError(404, 'Wishlist item not found');

  const data = sanitise(req.body);

  await query(`
    UPDATE wishlist SET
      tmdb_id = @tmdbId, title = @title, type = @type, year = @year,
      poster_path = @posterPath, backdrop_path = @backdropPath, overview = @overview,
      industry = @industry, planned_date = @plannedDate, note = @note, source = @source,
      updated_at = NOW()
    WHERE id = @id AND user_id = @userId
  `, { id: req.params.id, userId: req.user.id, ...data });

  const result = await query(
    `${SELECT} WHERE id = @id AND user_id = @userId`,
    { id: req.params.id, userId: req.user.id }
  );
  res.json(result.rows[0]);
}));

// DELETE /wishlist/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query(
    'DELETE FROM wishlist WHERE id = @id AND user_id = @userId',
    { id: req.params.id, userId: req.user.id }
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Wishlist item not found');
  res.json({ success: true });
}));

module.exports = router;
