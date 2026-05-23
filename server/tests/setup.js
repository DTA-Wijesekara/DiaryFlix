// Test environment — sets env vars BEFORE any module is required.
process.env.NODE_ENV       = 'test';
process.env.VERCEL         = '1'; // prevents server.js from calling app.listen
process.env.JWT_SECRET     = 'test-secret-key-must-be-at-least-32-chars-long!!';
process.env.DATABASE_URL   = 'postgresql://test:test@localhost:5432/test';
process.env.RATE_AUTH_MAX  = '10000';
process.env.RATE_API_MAX   = '10000';
process.env.PASSWORD_MIN   = '6';
process.env.BCRYPT_ROUNDS  = '4';
process.env.CORS_ORIGIN    = '*';
