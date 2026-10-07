// CineLog — Shared middleware: auth, error handling, validation.

const jwt = require('jsonwebtoken');
const config = require('./config');
const { findAuthUser } = require('./db');

// ---- Auth ----

async function authenticateJWT(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  let payload;
  try {
    payload = jwt.verify(match[1], config.jwtSecret, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
  try {
    const user = await findAuthUser(payload.id);
    if (!user || !user.is_active || !user.email_verified_at || !Number.isInteger(payload.version) || payload.version !== user.auth_version) {
      return res.status(401).json({ error: 'Please sign in again', code: 'SESSION_REVOKED' });
    }
    req.user = { id: user.id, email: user.email, role: user.role, version: user.auth_version };
    next();
  } catch (error) { next(error); }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ---- Error handling ----

// Wrap an async route handler so thrown errors are forwarded to the error middleware.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Public-friendly errors can throw new HttpError(400, 'Message')
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;

  const isHttp = err instanceof HttpError;
  const status = isHttp ? err.status : err.code === '23505' ? 409 : err.type === 'entity.too.large' ? 413 : err.type === 'entity.parse.failed' ? 400 : 500;

  if (!isHttp) {
    // Unexpected — log the full stack for debugging.
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.error(err);
  }

  const body = {
    error: isHttp ? err.message : status === 409 ? 'This record already exists' : status === 413 ? 'Request body is too large' : status === 400 ? 'Invalid JSON body' : 'Internal server error',
  };
  if (isHttp && err.code) body.code = err.code;

  res.status(status).json(body);
}

function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// ---- Validation ----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertString(value, field, { min = 0, max = 1000 } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be a string`);
  const v = value.trim();
  if (v.length < min) throw new HttpError(400, `${field} must be at least ${min} characters`);
  if (v.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return v;
}

function assertEmail(value) {
  const v = assertString(value, 'email', { min: 3, max: 255 }).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new HttpError(400, 'Invalid email address');
  return v;
}

function assertPassword(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'password must be a string');
  if (value.length < config.password.minLength) {
    throw new HttpError(400, `Password must be at least ${config.password.minLength} characters`);
  }
  if (value.length > config.password.maxLength || Buffer.byteLength(value, 'utf8') > 72) {
    throw new HttpError(400, `Password is too long`);
  }
  return value;
}

function assertCurrentPassword(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    throw new HttpError(400, 'Password is required and must be at most 512 characters');
  }
  return value;
}

function assertDate(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, field + ' must use YYYY-MM-DD');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) throw new HttpError(400, field + ' must be a valid date');
  return value;
}

function clampInt(value, { min = -2147483648, max = 2147483647, fallback = null } = {}) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

module.exports = {
  authenticateJWT,
  requireAdmin,
  asyncHandler,
  HttpError,
  errorHandler,
  notFound,
  assertString,
  assertEmail,
  assertPassword,
  assertCurrentPassword,
  clampInt,
  assertDate,
};
