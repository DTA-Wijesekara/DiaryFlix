// CineLog — Admin routes
// All routes below require an authenticated admin.

const express = require('express');
const { getPool, sql } = require('../db');
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
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT u.id, u.email, u.displayName, u.role, u.avatar, u.isActive,
           u.createdAt, u.lastLogin,
           (SELECT COUNT(*) FROM WatchLogs w WHERE w.userId = u.id) AS logsCount
    FROM Users u
    ORDER BY u.createdAt DESC
  `);

  res.json(result.recordset.map(row => ({
    ...row,
    isActive: !!row.isActive,
  })));
}));

// ---- GET /users/:id/stats ----

router.get('/users/:id/stats', asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('userId', sql.VarChar, req.params.id)
    .query(`
      SELECT
        COUNT(*) AS totalWatched,
        ISNULL(AVG(CAST(NULLIF(rating, 0) AS FLOAT)), 0) AS avgRating,
        MAX(createdAt) AS lastActivity,
        SUM(ISNULL(runtime, 0)) AS totalMinutes,
        SUM(rewatchCount) AS totalRewatches
      FROM WatchLogs WHERE userId = @userId
    `);

  const row = result.recordset[0] || {};
  res.json({
    totalWatched: row.totalWatched || 0,
    avgRating: row.avgRating ? Number(row.avgRating).toFixed(1) : '0.0',
    lastActivity: row.lastActivity || null,
    totalHours: row.totalMinutes ? Math.round(row.totalMinutes / 60) : 0,
    totalRewatches: row.totalRewatches || 0,
  });
}));

// ---- PUT /users/:id/role ----

router.put('/users/:id/role', asyncHandler(async (req, res) => {
  const role = req.body.role;
  if (role !== 'user' && role !== 'admin') {
    throw new HttpError(400, "role must be 'user' or 'admin'");
  }

  // Prevent removing the last admin
  if (role === 'user') {
    const pool = await getPool();
    const check = await pool.request().query(`
      SELECT COUNT(*) AS cnt FROM Users WHERE role = 'admin' AND isActive = 1
    `);
    const adminCount = check.recordset[0]?.cnt || 0;
    const isTargetAdmin = await pool.request()
      .input('id', sql.VarChar, req.params.id)
      .query("SELECT role FROM Users WHERE id = @id");
    if (isTargetAdmin.recordset[0]?.role === 'admin' && adminCount <= 1) {
      throw new HttpError(400, 'Cannot demote the last active admin');
    }
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .input('role', sql.VarChar, role)
    .query('UPDATE Users SET role = @role WHERE id = @id');

  if (result.rowsAffected[0] === 0) throw new HttpError(404, 'User not found');
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

  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .input('isActive', sql.Bit, req.body.isActive ? 1 : 0)
    .query('UPDATE Users SET isActive = @isActive WHERE id = @id');

  if (result.rowsAffected[0] === 0) throw new HttpError(404, 'User not found');
  res.json({ success: true, isActive: req.body.isActive });
}));

// ---- DELETE /users/:id ----

router.delete('/users/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    throw new HttpError(400, 'You cannot delete your own account from the admin panel');
  }

  const pool = await getPool();

  // If deleting the last admin, block it.
  const target = await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .query('SELECT role FROM Users WHERE id = @id');
  if (target.recordset.length === 0) throw new HttpError(404, 'User not found');

  if (target.recordset[0].role === 'admin') {
    const adminCount = await pool.request().query(
      "SELECT COUNT(*) AS cnt FROM Users WHERE role = 'admin'"
    );
    if ((adminCount.recordset[0]?.cnt || 0) <= 1) {
      throw new HttpError(400, 'Cannot delete the last admin');
    }
  }

  // WatchLogs have ON DELETE CASCADE, but older installs may not. Delete explicitly for safety.
  await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .query('DELETE FROM WatchLogs WHERE userId = @id');

  await pool.request()
    .input('id', sql.VarChar, req.params.id)
    .query('DELETE FROM Users WHERE id = @id');

  res.json({ success: true });
}));

module.exports = router;
