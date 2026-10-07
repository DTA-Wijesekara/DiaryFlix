jest.mock('../lib/graphSnapshot', () => ({ loadSnapshot: async () => {} }));
jest.mock('../db', () => ({
  initDB:    jest.fn(() => Promise.resolve()),
  closePool: jest.fn(() => Promise.resolve()),
  getPool:   jest.fn(),
  query:     jest.fn(),
  transaction: (fn) => fn(),
  findAuthUser: async (id) => ({ id, email: 'test@example.com', role: id === 'admin_test' ? 'admin' : 'user', is_active: true, auth_version: 0, email_verified_at: new Date() }),
}));

const request = require('supertest');
const { query } = require('../db');
const { makeToken } = require('./helpers');
const { setGraph } = require('../lib/graphStore');
const { buildGraphFromRows } = require('../lib/graphBuilder');
const app = require('../server');

// A small graph: A & B & C are all action/hollywood, co-watched in pairs.
function sampleGraph() {
  return buildGraphFromRows([
    { user_id: 'u1', rating: 9, tmdb_id: 1, title: 'A', genres: '["action"]', industry: 'hollywood' },
    { user_id: 'u1', rating: 9, tmdb_id: 2, title: 'B', genres: '["action"]', industry: 'hollywood' },
    { user_id: 'u2', rating: 8, tmdb_id: 2, title: 'B', genres: '["action"]', industry: 'hollywood' },
    { user_id: 'u2', rating: 8, tmdb_id: 3, title: 'C', genres: '["action"]', industry: 'hollywood' },
  ]);
}

beforeEach(() => {
  query.mockReset();
  setGraph(sampleGraph());
});

describe('GET /api/recommendations', () => {
  test('requires authentication (401)', async () => {
    const res = await request(app).get('/api/recommendations');
    expect(res.status).toBe(401);
  });

  test('returns personalized recommendations excluding watched movies', async () => {
    // This user has watched movie A (tmdb:movie:1).
    query.mockResolvedValueOnce({ rows: [{ tmdb_id: 1, title: 'A' }] });

    const res = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(false);

    const ids = res.body.recommendations.map(r => r.id);
    expect(ids).toContain('tmdb:movie:2');     // B is similar to A
    expect(ids).not.toContain('tmdb:movie:1'); // A already watched
    // recommendations carry a human-readable reason
    expect(res.body.recommendations[0]).toHaveProperty('becauseTitle');
  });

  test('falls back to popular movies when the user has no history', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // no watched movies

    const res = await request(app)
      .get('/api/recommendations')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.fallback).toBe(true);
    expect(res.body.recommendations.length).toBeGreaterThan(0);
  });
});

describe('GET /api/recommendations/similar', () => {
  test('returns movies similar to a given tmdbId', async () => {
    const res = await request(app)
      .get('/api/recommendations/similar?tmdbId=1')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    const ids = res.body.similar.map(s => s.id);
    expect(ids).toContain('tmdb:movie:2');
    expect(ids).not.toContain('tmdb:movie:1');
  });

  test('returns an empty list for an unknown movie', async () => {
    const res = await request(app)
      .get('/api/recommendations/similar?tmdbId=99999')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.similar).toEqual([]);
  });
});
