const jwt = require('jsonwebtoken');

function makeToken(overrides = {}) {
  const payload = {
    id: 'user_test',
    email: 'test@example.com',
    role: 'user',
    ...overrides,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function makeAdminToken() {
  return makeToken({ id: 'admin_test', email: 'admin@example.com', role: 'admin' });
}

function makeExpiredToken() {
  return jwt.sign(
    { id: 'user_test', email: 'test@example.com', role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '-1s' }
  );
}

module.exports = { makeToken, makeAdminToken, makeExpiredToken };
