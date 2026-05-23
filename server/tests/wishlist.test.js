jest.mock('../db', () => ({
  initDB:    jest.fn(() => Promise.resolve()),
  closePool: jest.fn(() => Promise.resolve()),
  getPool:   jest.fn(),
  query:     jest.fn(),
}));

const request = require('supertest');
const { query } = require('../db');
const { makeToken } = require('./helpers');
const app = require('../server');

beforeEach(() => jest.clearAllMocks());

describe('GET /api/wishlist', () => {
  test('10. returns the wishlist for the authenticated user', async () => {
    query.mockResolvedValueOnce({
      rows: [
        { id: 'wsh_1', title: 'Oppenheimer', userId: 'user_test', industry: 'hollywood' },
      ],
    });

    const res = await request(app)
      .get('/api/wishlist')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Oppenheimer');
  });
});

describe('POST /api/wishlist', () => {
  test('11. creates a new wishlist item and returns 201', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({             // SELECT new row
        rows: [{
          id: 'wsh_new',
          title: 'Pathaan',
          userId: 'user_test',
          industry: 'bollywood',
        }],
      });

    const res = await request(app)
      .post('/api/wishlist')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Pathaan', industry: 'bollywood', year: '2023' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Pathaan');
  });
});

describe('DELETE /api/wishlist/:id', () => {
  test('12. returns 404 when the wishlist item does not exist', async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app)
      .delete('/api/wishlist/wsh_missing')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
