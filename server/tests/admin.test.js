jest.mock('../db', () => ({
  initDB:    jest.fn(() => Promise.resolve()),
  closePool: jest.fn(() => Promise.resolve()),
  getPool:   jest.fn(),
  query:     jest.fn(),
}));

const request = require('supertest');
const { query } = require('../db');
const { makeToken, makeAdminToken } = require('./helpers');
const app = require('../server');

beforeEach(() => jest.clearAllMocks());

describe('GET /api/admin/users', () => {
  test('13. returns 403 when a non-admin user calls an admin route', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${makeToken()}`); // role: 'user'

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  test('14. returns the list of users when called by an admin', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'user_1', email: 'a@x.com', displayName: 'A', role: 'user', isActive: true, logsCount: 5 },
        { id: 'user_2', email: 'b@x.com', displayName: 'B', role: 'user', isActive: true, logsCount: 2 },
      ],
    });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${makeAdminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].email).toBe('a@x.com');
  });
});

describe('PUT /api/admin/users/:id/role', () => {
  test('15. blocks demoting the last active admin', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ cnt: 1 }] })           // only 1 active admin
      .mockResolvedValueOnce({ rows: [{ role: 'admin' }] });   // target is admin

    const res = await request(app)
      .put('/api/admin/users/admin_lonely/role')
      .set('Authorization', `Bearer ${makeAdminToken()}`)
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/last active admin/i);
  });
});
