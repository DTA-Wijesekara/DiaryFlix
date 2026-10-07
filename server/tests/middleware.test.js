jest.mock('../db', () => ({
  initDB:    jest.fn(() => Promise.resolve()),
  closePool: jest.fn(() => Promise.resolve()),
  getPool:   jest.fn(),
  query:     jest.fn(),
  transaction: (fn) => fn(),
  findAuthUser: async (id) => ({ id, email: 'test@example.com', role: id === 'admin_test' ? 'admin' : 'user', is_active: true, auth_version: 0, email_verified_at: new Date() }),
}));

const { authenticateJWT, requireAdmin } = require('../middleware');
const { makeToken, makeAdminToken, makeExpiredToken } = require('./helpers');

function mockReqRes(headers = {}, user = null) {
  const req = { headers, user };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticateJWT middleware', () => {
  test('16. rejects requests missing the Authorization header (401)', async () => {
    const { req, res, next } = mockReqRes({});
    await authenticateJWT(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/authorization/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('17. rejects an expired token with code TOKEN_EXPIRED', async () => {
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${makeExpiredToken()}` });
    await authenticateJWT(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
    expect(next).not.toHaveBeenCalled();
  });

  test('18. passes through and sets req.user for a valid token', async () => {
    const { req, res, next } = mockReqRes({ authorization: `Bearer ${makeToken()}` });
    await authenticateJWT(req, res, next);

    expect(req.user).toMatchObject({ id: 'user_test', role: 'user' });
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireAdmin middleware', () => {
  test('19. returns 403 when the user is not an admin', () => {
    const { req, res, next } = mockReqRes({}, { id: 'u', role: 'user' });
    requireAdmin(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
