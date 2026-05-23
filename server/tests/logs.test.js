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

beforeEach(() => {
  // resetAllMocks also clears queued mockResolvedValueOnce values
  jest.resetAllMocks();
});

describe('GET /api/logs', () => {
  test('6. returns 401 when no auth token is provided', async () => {
    const res = await request(app).get('/api/logs');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authorization/i);
  });

  test('7. returns the user\'s watch logs when authenticated', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'log_1', userId: 'user_test', movieId: 'mov_1',
          title: 'Inception', rating: 9, watchCount: 1,
          actors: '[]', actresses: '[]', genres: '[]',
          favouriteSongs: '[]', favouriteQuotes: '[]',
        },
      ],
    });

    const res = await request(app)
      .get('/api/logs')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].title).toBe('Inception');
    expect(res.body[0].rewatchCount).toBe(0); // watchCount=1 → 0 rewatches
  });
});

describe('POST /api/logs', () => {
  test('8. creates a new watch log and returns 201', async () => {
    // No tmdbId in body → the tmdbId-lookup branch in upsertMovie is skipped.
    query
      .mockResolvedValueOnce({ rows: [] })  // upsertMovie: title-based lookup → none found
      .mockResolvedValueOnce({ rows: [] })  // upsertMovie: INSERT new movie
      .mockResolvedValueOnce({ rows: [] })  // INSERT watchlog
      .mockResolvedValueOnce({              // SELECT the newly-created row
        rows: [{
          id: 'log_new', title: 'Dune', rating: 8, watchCount: 1,
          actors: '[]', actresses: '[]', genres: '[]',
          favouriteSongs: '[]', favouriteQuotes: '[]',
        }],
      });

    const res = await request(app)
      .post('/api/logs')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ title: 'Dune', rating: 8, dateWatched: '2024-01-15' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Dune');
    expect(res.body.rating).toBe(8);
  });
});

describe('DELETE /api/logs/:id', () => {
  test('9. returns 404 when the log does not exist or belongs to another user', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // existing lookup returns nothing

    const res = await request(app)
      .delete('/api/logs/log_does_not_exist')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
