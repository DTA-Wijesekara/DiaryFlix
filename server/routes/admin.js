// DiaryFLIX — Admin routes
// All routes require an authenticated admin.

const express = require('express');
const { query } = require('../db');
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
      u.is_active AS "isActive", u.created_at AS "createdAt", u.last_login AS "lastLogin",
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
      COALESCE(SUM(m.runtime), 0)::INTEGER                     AS total_minutes,
      GREATEST(0, COUNT(wl.id) - COUNT(DISTINCT wl.movie_id))::INTEGER AS total_rewatches
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

// ---- PUT /users/:id/role ----

router.put('/users/:id/role', asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (role !== 'user' && role !== 'admin') {
    throw new HttpError(400, "role must be 'user' or 'admin'");
  }

  if (role === 'user') {
    const countRes  = await query("SELECT COUNT(*)::INTEGER AS cnt FROM users WHERE role = 'admin' AND is_active = TRUE");
    const targetRes = await query('SELECT role FROM users WHERE id = @id', { id: req.params.id });
    if (targetRes.rows[0]?.role === 'admin' && countRes.rows[0].cnt <= 1) {
      throw new HttpError(400, 'Cannot demote the last active admin');
    }
  }

  const result = await query('UPDATE users SET role = @role WHERE id = @id', { role, id: req.params.id });
  if (result.rowCount === 0) throw new HttpError(404, 'User not found');
  res.json({ success: true, role });
}));

// ---- PUT /users/:id/active ----

router.put('/users/:id/active', asyncHandler(async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') {
    throw new HttpError(400, 'isActive must be a boolean');
  }
  if (req.params.id === req.user.id && req.body.isActive === false) {
    throw new HttpError(400, 'You cannot deactivate your own account');
  }

  const result = await query(
    'UPDATE users SET is_active = @isActive WHERE id = @id',
    { isActive: req.body.isActive, id: req.params.id }
  );
  if (result.rowCount === 0) throw new HttpError(404, 'User not found');
  res.json({ success: true, isActive: req.body.isActive });
}));

// ---- DELETE /users/:id ----

router.delete('/users/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw new HttpError(400, 'You cannot delete your own account from the admin panel');
  }

  const target = await query('SELECT role FROM users WHERE id = @id', { id: req.params.id });
  if (target.rows.length === 0) throw new HttpError(404, 'User not found');

  if (target.rows[0].role === 'admin') {
    const countRes = await query("SELECT COUNT(*)::INTEGER AS cnt FROM users WHERE role = 'admin'");
    if (countRes.rows[0].cnt <= 1) {
      throw new HttpError(400, 'Cannot delete the last admin');
    }
  }

  await query('DELETE FROM watchlogs WHERE user_id = @id', { id: req.params.id });
  await query('DELETE FROM users    WHERE id = @id',       { id: req.params.id });

  res.json({ success: true });
}));

module.exports = router;
