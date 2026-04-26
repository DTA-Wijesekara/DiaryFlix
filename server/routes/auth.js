// DiaryFLIX — Auth routes
// /register  /login  /me  /change-password  /update-profile

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { query } = require('../db');
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
    displayName: row.display_name,
    role: row.role,
    avatar: row.avatar,
    isActive: row.is_active,
  };
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// ---- POST /register ----

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const email       = assertEmail(req.body.email);
  const password    = assertPassword(req.body.password);
  const displayName = assertString(req.body.displayName, 'displayName', { min: 1, max: 80 });

  const existing = await query('SELECT id FROM users WHERE email = @email', { email });
  if (existing.rows.length > 0) {
    throw new HttpError(409, 'An account with that email already exists');
  }

  const salt    = await bcrypt.genSalt(config.bcryptRounds);
  const hash    = await bcrypt.hash(password, salt);
  const id      = newId('user');
  const initial = (displayName.trim()[0] || 'C').toUpperCase();

  await query(`
    INSERT INTO users (id, email, display_name, password_hash, salt, avatar, is_active, role, created_at, last_login)
    VALUES (@id, @email, @displayName, @hash, @salt, @avatar, TRUE, 'user', NOW(), NOW())
  `, { id, email, displayName, hash, salt, avatar: initial });

  const user = { id, email, displayName, role: 'user', avatar: initial, isActive: true };
  res.status(201).json({ token: signToken(user), user });
}));

// ---- POST /login ----

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email    = assertEmail(req.body.email);
  const password = assertString(req.body.password, 'password', { min: 1, max: 512 });

  const result = await query('SELECT * FROM users WHERE email = @email', { email });
  const row    = result.rows[0];
  // Always compare against a hash to prevent timing-based user enumeration.
  const hash   = row?.password_hash || '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Czvl1qJ5H8eOP6bXrn8R4gY.kQYXq';
  const valid  = await bcrypt.compare(password, hash);

  if (!row || !valid) throw new HttpError(401, 'Invalid email or password');
  if (!row.is_active)  throw new HttpError(403, 'Account is deactivated');

  await query('UPDATE users SET last_login = NOW() WHERE id = @id', { id: row.id });

  res.json({ token: signToken(toPublicUser(row)), user: toPublicUser(row) });
}));

// ---- GET /me ----

router.get('/me', authenticateJWT, asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, email, display_name, role, avatar, is_active FROM users WHERE id = @id',
    { id: req.user.id }
  );
  if (result.rows.length === 0) throw new HttpError(404, 'User not found');
  res.json({ user: toPublicUser(result.rows[0]) });
}));

// ---- PUT /me (update profile) ----

router.put('/me', authenticateJWT, asyncHandler(async (req, res) => {
  const updates = {};
  if (req.body.displayName !== undefined) {
    updates.display_name = assertString(req.body.displayName, 'displayName', { min: 1, max: 80 });
  }
  if (req.body.avatar !== undefined) {
    updates.avatar = assertString(req.body.avatar, 'avatar', { min: 0, max: 32 });
  }
  if (Object.keys(updates).length === 0) throw new HttpError(400, 'Nothing to update');

  const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  await query(`UPDATE users SET ${setClauses} WHERE id = @id`, { id: req.user.id, ...updates });

  const result = await query(
    'SELECT id, email, display_name, role, avatar, is_active FROM users WHERE id = @id',
    { id: req.user.id }
  );
  res.json({ user: toPublicUser(result.rows[0]) });
}));

// ---- POST /change-password ----

router.post('/change-password', authenticateJWT, asyncHandler(async (req, res) => {
  const currentPassword = assertString(req.body.currentPassword, 'currentPassword', { min: 1, max: 512 });
  const newPassword     = assertPassword(req.body.newPassword);

  if (currentPassword === newPassword) {
    throw new HttpError(400, 'New password must be different from current password');
  }

  const result = await query('SELECT password_hash FROM users WHERE id = @id', { id: req.user.id });
  if (result.rows.length === 0) throw new HttpError(404, 'User not found');

  const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
  if (!valid) throw new HttpError(401, 'Current password is incorrect');

  const salt = await bcrypt.genSalt(config.bcryptRounds);
  const hash = await bcrypt.hash(newPassword, salt);

  await query(
    'UPDATE users SET password_hash = @hash, salt = @salt WHERE id = @id',
    { id: req.user.id, hash, salt }
  );

  res.json({ success: true });
}));

module.exports = router;
