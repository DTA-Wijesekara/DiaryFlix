// CineLog — Auth routes
// /register  /login  /me  /change-password  /update-profile

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { getPool, sql } = require('../db');
const {
  authenticateJWT,
  asyncHandler,
  HttpError,
  assertString,
  assertEmail,
  assertPassword,
} = require('../middleware');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: config.rateLimits.auth.windowMs,
  max: config.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' },
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    avatar: row.avatar,
    isActive: !!row.isActive,
  };
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---- POST /register ----

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const email = assertEmail(req.body.email);
  const password = assertPassword(req.body.password);
  const displayName = assertString(req.body.displayName, 'displayName', { min: 1, max: 80 });

  const pool = await getPool();

  const existing = await pool.request()
    .input('email', sql.VarChar, email)
    .query('SELECT id FROM Users WHERE email = @email');

  if (existing.recordset.length > 0) {
    throw new HttpError(409, 'An account with that email already exists');
  }

  const salt = await bcrypt.genSalt(config.bcryptRounds);
  const hash = await bcrypt.hash(password, salt);
  const id = newId('user');
  const initial = (displayName.trim()[0] || 'C').toUpperCase();

  await pool.request()
    .input('id', sql.VarChar, id)
    .input('email', sql.VarChar, email)
    .input('displayName', sql.NVarChar, displayName)
    .input('passwordHash', sql.VarChar, hash)
    .input('salt', sql.VarChar, salt)
    .input('avatar', sql.NVarChar, initial)
    .query(`
      INSERT INTO Users (id, email, displayName, passwordHash, salt, avatar, isActive, role, createdAt, lastLogin)
      VALUES (@id, @email, @displayName, @passwordHash, @salt, @avatar, 1, 'user', SYSUTCDATETIME(), SYSUTCDATETIME())
    `);

  const user = { id, email, displayName, role: 'user', avatar: initial, isActive: true };
  res.status(201).json({ token: signToken(user), user });
}));

// ---- POST /login ----

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email = assertEmail(req.body.email);
  const password = assertString(req.body.password, 'password', { min: 1, max: 512 });

  const pool = await getPool();
  const result = await pool.request()
    .input('email', sql.VarChar, email)
    .query('SELECT * FROM Users WHERE email = @email');

  // Constant-ish response time: always compare against a bcrypt hash so timing doesn't reveal user existence.
  const row = result.recordset[0];
  const hash = row?.passwordHash || '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Czvl1qJ5H8eOP6bXrn8R4gY.kQYXq';
  const valid = await bcrypt.compare(password, hash);

  if (!row || !valid) {
    throw new HttpError(401, 'Invalid email or password');
  }
  if (!row.isActive) {
    throw new HttpError(403, 'Account is deactivated');
  }

  await pool.request()
    .input('id', sql.VarChar, row.id)
    .query('UPDATE Users SET lastLogin = SYSUTCDATETIME() WHERE id = @id');

  const user = toPublicUser(row);
  res.json({ token: signToken(user), user });
}));

// ---- GET /me ----

router.get('/me', authenticateJWT, asyncHandler(async (req, res) => {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar, req.user.id)
    .query('SELECT id, email, displayName, role, avatar, isActive FROM Users WHERE id = @id');

  if (result.recordset.length === 0) throw new HttpError(404, 'User not found');
  res.json({ user: toPublicUser(result.recordset[0]) });
}));

// ---- PUT /me (update profile) ----

router.put('/me', authenticateJWT, asyncHandler(async (req, res) => {
  const updates = {};

  if (req.body.displayName !== undefined) {
    updates.displayName = assertString(req.body.displayName, 'displayName', { min: 1, max: 80 });
  }
  if (req.body.avatar !== undefined) {
    updates.avatar = assertString(req.body.avatar, 'avatar', { min: 0, max: 32 });
  }

  if (Object.keys(updates).length === 0) {
    throw new HttpError(400, 'Nothing to update');
  }

  const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  const pool = await getPool();
  const r = pool.request().input('id', sql.VarChar, req.user.id);
  if (updates.displayName !== undefined) r.input('displayName', sql.NVarChar, updates.displayName);
  if (updates.avatar !== undefined) r.input('avatar', sql.NVarChar, updates.avatar);

  await r.query(`UPDATE Users SET ${setClauses} WHERE id = @id`);

  const result = await pool.request()
    .input('id', sql.VarChar, req.user.id)
    .query('SELECT id, email, displayName, role, avatar, isActive FROM Users WHERE id = @id');

  res.json({ user: toPublicUser(result.recordset[0]) });
}));

// ---- POST /change-password ----

router.post('/change-password', authenticateJWT, asyncHandler(async (req, res) => {
  const currentPassword = assertString(req.body.currentPassword, 'currentPassword', { min: 1, max: 512 });
  const newPassword = assertPassword(req.body.newPassword);

  if (currentPassword === newPassword) {
    throw new HttpError(400, 'New password must be different from current password');
  }

  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.VarChar, req.user.id)
    .query('SELECT passwordHash FROM Users WHERE id = @id');

  if (result.recordset.length === 0) throw new HttpError(404, 'User not found');

  const valid = await bcrypt.compare(currentPassword, result.recordset[0].passwordHash);
  if (!valid) throw new HttpError(401, 'Current password is incorrect');

  const salt = await bcrypt.genSalt(config.bcryptRounds);
  const hash = await bcrypt.hash(newPassword, salt);

  await pool.request()
    .input('id', sql.VarChar, req.user.id)
    .input('passwordHash', sql.VarChar, hash)
    .input('salt', sql.VarChar, salt)
    .query('UPDATE Users SET passwordHash = @passwordHash, salt = @salt WHERE id = @id');

  res.json({ success: true });
}));

module.exports = router;
