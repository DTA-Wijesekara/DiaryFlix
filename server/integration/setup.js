const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required; integration tests never use DATABASE_URL');
const parsed = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Use a localhost database with a name ending in _test');
Object.assign(process.env, { NODE_ENV: 'test', VERCEL: '1', DATABASE_URL: url, DB_SSL: 'false', SEED_ADMIN: 'false', SMTP_USER: '', SMTP_PASS: '', JWT_SECRET: 'isolated-integration-secret-with-at-least-32-characters', GOOGLE_CLIENT_ID: 'integration-client', RATE_AUTH_MAX: '10000', RATE_API_MAX: '10000', BCRYPT_ROUNDS: '4', PASSWORD_MIN: '6' });
