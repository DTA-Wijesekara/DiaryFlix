// DiaryFLIX — Admin routes
// All routes require an authenticated admin.

const express = require('express');
const { query } = require('../db');
const { changeUser } = require('../lib/userAdministration');
const {
  authenticateJWT,
  requireAdmin,
  asyncHandler,
  HttpError,
} = require('../middleware');

const router = express.Router();
router.use(authenticateJWT, requireAdmin);

// ---- GET /users ----

router.get('/users', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      u.id, u.email, u.display_name AS "displayName", u.role, u.avatar,
      u.is_active AS "isActive", u.email_verified_at IS NOT NULL AS "isVerified", u.created_at AS "createdAt", u.last_login AS "lastLogin",
      (SELECT COUNT(*) FROM watchlogs w WHERE w.user_id = u.id)::INTEGER AS "logsCount"
    FROM users u
    ORDER BY u.created_at DESC
  `);
  res.json(result.rows);
}));

// ---- GET /users/:id/stats ----

router.get('/users/:id/stats', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      COUNT(wl.id)::INTEGER                                    AS total_watched,
      COALESCE(AVG(NULLIF(wl.rating, 0)::FLOAT), 0)           AS avg_rating,
      MAX(wl.created_at)                                       AS last_activity,
      COALESCE(SUM(wl.watched_minutes), 0)::INTEGER                     AS total_minutes,
      GREATEST(0, COUNT(wl.id) FILTER (WHERE m.type='movie') - COUNT(DISTINCT wl.movie_id) FILTER (WHERE m.type='movie'))::INTEGER AS total_rewatches
    FROM watchlogs wl
    LEFT JOIN movies m ON m.id = wl.movie_id
    WHERE wl.user_id = @userId
  `, { userId: req.params.id });

  const row = result.rows[0] || {};
  res.json({
    totalWatched:   row.total_watched   || 0,
    avgRating:      row.avg_rating ? Number(row.avg_rating).toFixed(1) : '0.0',
    lastActivity:   row.last_activity   || null,
    totalHours:     row.total_minutes ? Math.round(row.total_minutes / 60) : 0,
    totalRewatches: row.total_rewatches || 0,
  });
}));

router.put('/users/:id/role', asyncHandler(async (req, res) => {
  if (!['user','admin'].includes(req.body.role)) throw new HttpError(400, 'Invalid role');
  await changeUser(req.params.id, { role: req.body.role }, req.user);
  res.json({ success: true, role: req.body.role });
}));
router.put('/users/:id/active', asyncHandler(async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') throw new HttpError(400, 'isActive must be a boolean');
  await changeUser(req.params.id, { isActive: req.body.isActive }, req.user);
  res.json({ success: true, isActive: req.body.isActive });
}));
router.delete('/users/:id', asyncHandler(async (req, res) => {
  res.json(await changeUser(req.params.id, { remove: true }, req.user));
}));
module.exports = router;
