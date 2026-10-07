// DiaryFLIX — Auth routes
// /register  /login  /me  /change-password  /update-profile

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');

const config = require('../config');
const { query, transaction } = require('../db');
const { send, buildPasswordResetEmail, buildOAuthOnlyEmail } = require('../email');

const googleClient = config.google.clientId ? new OAuth2Client(config.google.clientId) : null;
const {
  authenticateJWT,
  asyncHandler,
  HttpError,
  assertString,
  assertEmail,
  assertPassword,
  assertCurrentPassword,
} = require('../middleware');

const { PostgresRateStore } = require('../lib/postgresRateStore');
const router = express.Router();

const authLimiter = rateLimit({
  ...(config.isProd ? { store: new PostgresRateStore('auth') } : {}),
  windowMs: config.rateLimits.auth.windowMs,
  max: config.rateLimits.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' },
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, version: user.auth_version },
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

  await sendRecovery({ id, email, display_name: displayName });
  res.status(201).json({ verificationRequired: true, message: 'Check your email to verify ownership and choose your password. Request another link from Forgot password if needed.' });
}));

// ---- POST /login ----

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email    = assertEmail(req.body.email);
  const password = assertCurrentPassword(req.body.password);

  const result = await query('SELECT * FROM users WHERE email = @email', { email });
  const row    = result.rows[0];
  // Always compare against a hash to prevent timing-based user enumeration.
  const hash   = row?.password_hash || '$2a$10$CwTycUXWue0Thq9StjUM0uJ8Czvl1qJ5H8eOP6bXrn8R4gY.kQYXq';
  const valid  = await bcrypt.compare(password, hash);

  if (!row || !valid) throw new HttpError(401, 'Invalid email or password');
  if (!row.is_active)  throw new HttpError(403, 'Account is deactivated');

  if (!row.email_verified_at) throw new HttpError(403, 'Verify your email using Forgot password before signing in', 'EMAIL_UNVERIFIED');
  await query('UPDATE users SET last_login = NOW() WHERE id = @id', { id: row.id });

  res.json({ token: signToken(row), user: toPublicUser(row) });
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
  const currentPassword = assertCurrentPassword(req.body.currentPassword);
  const newPassword     = assertPassword(req.body.newPassword);

  if (currentPassword === newPassword) {
    throw new HttpError(400, 'New password must be different from current password');
  }

  await transaction(async () => {
    const row = (await query('SELECT * FROM users WHERE id = @id FOR UPDATE', { id: req.user.id })).rows[0];
    if (!row || !row.is_active || row.auth_version !== req.user.version) throw new HttpError(401, 'Please sign in again', 'SESSION_REVOKED');
    if (!row.password_hash || !await bcrypt.compare(currentPassword, row.password_hash)) throw new HttpError(401, 'Current password is incorrect');
    const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await query('UPDATE users SET password_hash = @hash, salt = NULL, auth_version = auth_version + 1 WHERE id = @id', { id: row.id, hash });
    await query('DELETE FROM password_reset_tokens WHERE user_id = @id', { id: row.id });
  });
  res.json({ success: true, signInRequired: true });
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
      throw new HttpError(409, 'An account already uses this email. Recover it with Forgot password, then link Google from Settings.', 'LINK_REQUIRED');
    }
  }

  // 3) No match at all → create a brand new account
  if (!row) {
    const id = newId('user');
    await query(`
      INSERT INTO users (id, email, display_name, google_id, avatar, is_active, role, created_at, last_login, email_verified_at)
      VALUES (@id, @email, @displayName, @googleId, @avatar, TRUE, 'user', NOW(), NOW(), NOW())
    `, { id, email, displayName: name, googleId, avatar: initial });
    row = (await query('SELECT * FROM users WHERE id = @id', { id })).rows[0];
  } else {
    if (row.password_hash && !row.email_verified_at) throw new HttpError(403, 'Recover this account using Forgot password before signing in', 'EMAIL_UNVERIFIED');
    if (!row.password_hash && !row.email_verified_at) {
      await query('UPDATE users SET email_verified_at = NOW() WHERE id = @id', { id: row.id });
      row.email_verified_at = new Date();
    }
    if (!row.is_active) throw new HttpError(403, 'Account is deactivated');
    await query('UPDATE users SET last_login = NOW() WHERE id = @id', { id: row.id });
  }

  res.json({ token: signToken(row), user: toPublicUser(row) });
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

  await sendRecovery(row);
  res.json(genericResponse);
}));

async function sendRecovery(row) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + config.passwordReset.tokenTtlMinutes * 60000);
  await query('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (@tokenHash, @userId, @expiresAt)', { tokenHash, userId: row.id, expiresAt });
  const resetUrl = config.appUrl.replace(/\/$/, '') + '/reset-password?token=' + rawToken;
  const tpl = buildPasswordResetEmail({ displayName: row.display_name, resetUrl, ttlMinutes: config.passwordReset.tokenTtlMinutes });
  try { await send({ to: row.email, ...tpl }); }
  catch (error) { console.error('[email] Recovery delivery failed'); }
}

// ---- POST /reset-password ----

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const token       = assertString(req.body.token, 'token', { min: 16, max: 256 });
  const newPassword = assertPassword(req.body.newPassword);

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Lock the user first so different outstanding tokens serialize without deadlocks.
  await transaction(async () => {
    const candidate = (await query('SELECT user_id FROM password_reset_tokens WHERE token_hash = @tokenHash', { tokenHash })).rows[0];
    if (!candidate) throw new HttpError(400, 'Invalid or expired reset link');
    const user = (await query('SELECT * FROM users WHERE id = @id FOR UPDATE', { id: candidate.user_id })).rows[0];
    if (!user || !user.is_active) throw new HttpError(400, 'Account is no longer available');
    const consumed = await query('DELETE FROM password_reset_tokens WHERE token_hash = @tokenHash AND used_at IS NULL AND expires_at > NOW() RETURNING user_id', { tokenHash });
    if (!consumed.rows.length) throw new HttpError(400, 'Invalid or expired reset link');
    const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
    await query(
      'UPDATE users SET password_hash = @hash, salt = NULL, auth_version = auth_version + 1, google_id = CASE WHEN email_verified_at IS NULL THEN NULL ELSE google_id END, email_verified_at = NOW() WHERE id = @id',
      { hash, id: user.id }
    );
    await query('DELETE FROM password_reset_tokens WHERE user_id = @id', { id: user.id });
  });
  res.json({ success: true });
}));

router.post('/link-google', authLimiter, authenticateJWT, asyncHandler(async (req, res) => {
  if (!googleClient) throw new HttpError(503, 'Google sign-in is not configured');
  const password = assertCurrentPassword(req.body.currentPassword);
  const credential = assertString(req.body.credential, 'credential', { min: 10, max: 4096 });
  let payload;
  try { payload = (await googleClient.verifyIdToken({ idToken: credential, audience: config.google.clientId })).getPayload(); }
  catch { throw new HttpError(401, 'Could not verify Google credential'); }
  if (!payload?.email_verified || String(payload.email).toLowerCase() !== req.user.email) throw new HttpError(400, 'Use the Google account with your account email');
  await transaction(async () => {
    const user = (await query('SELECT * FROM users WHERE id = @id FOR UPDATE', { id: req.user.id })).rows[0];
    if (!user || !user.is_active || user.auth_version !== req.user.version) throw new HttpError(401, 'Please sign in again', 'SESSION_REVOKED');
    if (!user.password_hash || !await bcrypt.compare(password, user.password_hash)) throw new HttpError(401, 'Current password is incorrect');
    await query('UPDATE users SET google_id = @googleId WHERE id = @id', { googleId: payload.sub, id: user.id });
  });
  res.json({ success: true });
}));

module.exports = router;
