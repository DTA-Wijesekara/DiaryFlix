// CineLog — Server Configuration
// All environment-driven settings live here so the rest of the code can stay simple.

const path = require('path');
const crypto = require('crypto');

// Load .env from the server/ directory (falls back silently if missing)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const isProd = process.env.NODE_ENV === 'production';

function resolveJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) {
    if (isProd && fromEnv.length < 32) {
      console.error('JWT_SECRET must be at least 32 characters in production.');
      process.exit(1);
    }
    return fromEnv;
  }
  if (isProd) {
    console.error('JWT_SECRET is required in production. Set it in the environment.');
    process.exit(1);
  }
  const generated = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET not set — using an ephemeral dev secret. Tokens will not survive server restart.');
  return generated;
}

function resolveDbName() {
  const name = process.env.DB_NAME || 'cinemadiary';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    console.error(`Invalid DB_NAME: ${name}. Must match /^[A-Za-z_][A-Za-z0-9_]*$/`);
    process.exit(1);
  }
  return name;
}

function resolveCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || (isProd ? '' : '*');
  if (raw === '*') return '*';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd,

  port: Number(process.env.PORT) || 5000,
  host: process.env.HOST || '0.0.0.0',

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,

  db: {
    server: process.env.DB_SERVER || 'localhost',
    name: resolveDbName(),
    driver: process.env.DB_DRIVER || 'ODBC Driver 17 for SQL Server',
    trustedConnection: process.env.DB_TRUSTED !== 'false',
    user: process.env.DB_USER || null,
    password: process.env.DB_PASSWORD || null,
  },

  cors: {
    origins: resolveCorsOrigins(),
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  rateLimits: {
    auth: {
      windowMs: 15 * 60 * 1000,
      max: Number(process.env.RATE_AUTH_MAX) || 10,
    },
    api: {
      windowMs: 60 * 1000,
      max: Number(process.env.RATE_API_MAX) || 120,
    },
  },

  password: {
    minLength: Number(process.env.PASSWORD_MIN) || 6,
    maxLength: 256,
  },

  bodyLimit: process.env.BODY_LIMIT || '256kb',

  adminSeed: {
    enabled: process.env.SEED_ADMIN === 'true',
    email: process.env.SEED_ADMIN_EMAIL || null,
    password: process.env.SEED_ADMIN_PASSWORD || null,
    displayName: process.env.SEED_ADMIN_NAME || 'Admin',
  },
};

module.exports = config;
