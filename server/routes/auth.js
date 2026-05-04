// DiaryFLIX — Auth routes
// /register  /login  /me  /change-password  /update-profile

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');

const config = require('../config');
const { query } = require('../db');
const { send, buildPasswordResetEmail, buildOAuthOnlyEmail } = require('../email');

const googleClient = config.google.clientId ? new OAuth2Client(config.google.clientId) : null;
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

// ---- POST /google ----
// Frontend (Google Identity Services) returns an ID token (JWT).
// We verify it server-side, then find-or-create-or-link the user and issue our own JWT.

router.post('/google', authLimiter, asyncHandler(async (req, res) => {
  if (!googleClient) {
    throw new HttpError(503, 'Google sign-in is not configured on this server');
  }

  const credential = assertString(req.body.credential, 'credential', { min: 10, max: 4096 });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.google.clientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Could not verify Google credential');
  }

  if (!payload?.email_verified) {
    throw new HttpError(401, 'Google account email is not verified');
  }

  const email     = String(payload.email).toLowerCase();
  const googleId  = String(payload.sub);
  const name      = (payload.name || payload.given_name || email.split('@')[0] || 'Cinephile').slice(0, 80);
  const initial   = (name.trim()[0] || 'C').toUpperCase();

  // 1) Existing user with this google_id → log them in
  let row = (await query('SELECT * FROM users WHERE google_id = @googleId', { googleId })).rows[0];

  // 2) No google_id match → look up by email and link
  if (!row) {
    row = (await query('SELECT * FROM users WHERE email = @email', { email })).rows[0];
    if (row) {
      await query('UPDATE users SET google_id = @googleId WHERE id = @id', { googleId, id: row.id });
      row.google_id = googleId;
    }
  }

  // 3) No match at all → create a brand new account
  if (!row) {
    const id = newId('user');
    await query(`
      INSERT INTO users (id, email, display_name, google_id, avatar, is_active, role, created_at, last_login)
      VALUES (@id, @email, @displayName, @googleId, @avatar, TRUE, 'user', NOW(), NOW())
    `, { id, email, displayName: name, googleId, avatar: initial });
    row = (await query('SELECT * FROM users WHERE id = @id', { id })).rows[0];
  } else {
    if (!row.is_active) throw new HttpError(403, 'Account is deactivated');
    await query('UPDATE users SET last_login = NOW() WHERE id = @id', { id: row.id });
  }

  res.json({ token: signToken(toPublicUser(row)), user: toPublicUser(row) });
}));

// ---- POST /forgot-password ----
// Always returns the same generic success response to avoid leaking which
// emails have accounts. The actual email is sent (or skipped) based on the
// state of the matching user.

router.post('/forgot-password', authLimiter, asyncHandler(async (req, res) => {
  const email = assertEmail(req.body.email);
  const genericResponse = { success: true, message: 'If an account exists for that email, a reset link is on its way.' };

  const result = await query('SELECT * FROM users WHERE email = @email', { email });
  const row = result.rows[0];
  if (!row || !row.is_active) return res.json(genericResponse);

  // OAuth-only user (no password set) → send a friendly "use Google" email.
  if (!row.password_hash && row.google_id) {
    const tpl = buildOAuthOnlyEmail({ displayName: row.display_name });
    try { await send({ to: email, ...tpl }); } catch (e) { console.error('[email] send failed:', e.message); }
    return res.json(genericResponse);
  }

  // Standard reset flow: generate token, store hash, email the link.
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const ttlMin    = config.passwordReset.tokenTtlMinutes;
  const expiresAt = new Date(Date.now() + ttlMin * 60 * 1000);

  await query(`
    INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
    VALUES (@tokenHash, @userId, @expiresAt)
  `, { tokenHash, userId: row.id, expiresAt });

  const resetUrl = `${config.appUrl.replace(/\/$/, '')}/reset-password?token=${rawToken}`;
  const tpl = buildPasswordResetEmail({
    displayName: row.display_name,
    resetUrl,
    ttlMinutes: ttlMin,
  });

  try {
    await send({ to: email, ...tpl });
  } catch (e) {
    console.error('[email] send failed:', e.message);
    // Still return the generic success so we don't leak SMTP issues to clients.
  }

  res.json(genericResponse);
}));

// ---- POST /reset-password ----

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const token       = assertString(req.body.token, 'token', { min: 16, max: 256 });
  const newPassword = assertPassword(req.body.newPassword);

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const tokenRow = (await query(
    'SELECT * FROM password_reset_tokens WHERE token_hash = @tokenHash',
    { tokenHash }
  )).rows[0];

  if (!tokenRow) throw new HttpError(400, 'This reset link is invalid or has already been used. Request a new one.');
  if (tokenRow.used_at) throw new HttpError(400, 'This reset link has already been used. Request a new one.');
  if (new Date(tokenRow.expires_at) < new Date()) {
    throw new HttpError(400, 'This reset link has expired. Request a new one.');
  }

  const userRow = (await query('SELECT * FROM users WHERE id = @id', { id: tokenRow.user_id })).rows[0];
  if (!userRow || !userRow.is_active) throw new HttpError(400, 'Account is no longer available');

  const salt = await bcrypt.genSalt(config.bcryptRounds);
  const hash = await bcrypt.hash(newPassword, salt);

  await query(
    'UPDATE users SET password_hash = @hash, salt = @salt WHERE id = @id',
    { hash, salt, id: userRow.id }
  );

  // Mark this token used and invalidate any other outstanding tokens for the user.
  await query(
    'UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = @tokenHash',
    { tokenHash }
  );
  await query(
    'DELETE FROM password_reset_tokens WHERE user_id = @userId AND used_at IS NULL',
    { userId: userRow.id }
  );

  res.json({ success: true });
}));

module.exports = router;
