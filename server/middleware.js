// CineLog — Shared middleware: auth, error handling, validation.

const jwt = require('jsonwebtoken');
const config = require('./config');

// ---- Auth ----

function authenticateJWT(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(match[1], config.jwtSecret);
    req.user = { id: payload.id, email: payload.email, role: payload.role };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
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
  const status = isHttp ? err.status : 500;

  if (!isHttp) {
    // Unexpected — log the full stack for debugging.
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.error(err);
  }

  const body = {
    error: isHttp ? err.message : 'Internal server error',
  };
  if (err.code) body.code = err.code;

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
  if (value.length > config.password.maxLength) {
    throw new HttpError(400, `Password is too long`);
  }
  return value;
}

function clampInt(value, { min = -2147483648, max = 2147483647, fallback = null } = {}) {
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
  clampInt,
};
