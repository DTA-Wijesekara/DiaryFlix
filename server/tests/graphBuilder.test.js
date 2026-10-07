const {
  buildGraphFromRows,
  normalizeKey,
  parseGenres,
  jaccard,
  computeSimilarity,
  coWatchScore,
} = require('../lib/graphBuilder');

describe('helpers', () => {
  test('normalizeKey prefers tmdb_id and falls back to title', () => {
    expect(normalizeKey({ tmdb_id: 27205, title: 'Inception' })).toBe('tmdb:movie:27205');
    expect(normalizeKey({ tmdb_id: null, title: '  Inception ' })).toBe('title:movie::inception');
  });

  test('parseGenres handles JSON strings, arrays, and junk', () => {
    expect(parseGenres('["Action","Drama"]')).toEqual(['action', 'drama']);
    expect(parseGenres(['Sci-Fi'])).toEqual(['sci-fi']);
    expect(parseGenres(null)).toEqual([]);
    expect(parseGenres('not json')).toEqual([]);
  });

  test('jaccard computes intersection over union', () => {
    expect(jaccard(['a', 'b'], ['a', 'c'])).toBeCloseTo(1 / 3);
    expect(jaccard(['a'], ['a'])).toBe(1);
    expect(jaccard([], [])).toBe(0);
  });

  test('coWatchScore gives diminishing returns', () => {
    expect(coWatchScore(0)).toBe(0);
    expect(coWatchScore(1)).toBeCloseTo(0.5);
    expect(coWatchScore(3)).toBeCloseTo(0.75);
  });

  test('computeSimilarity combines all weighted signals', () => {
    const a = { genres: ['action'], industry: 'hollywood', avgRating: 8 };
    const b = { genres: ['action'], industry: 'hollywood', avgRating: 8 };
    // coWatch=1 → 0.4*0.5; genres jaccard=1 → 0.3; industry=1 → 0.2; rating=1 → 0.1
    const score = computeSimilarity(a, b, 1);
    expect(score).toBeCloseTo(0.4 * 0.5 + 0.3 + 0.2 + 0.1);
  });
});

describe('buildGraphFromRows', () => {
  test('dedupes the same movie across users by tmdb_id', () => {
    const rows = [
      { user_id: 'u1', rating: 9, tmdb_id: 27205, title: 'Inception', genres: '[]', industry: 'hollywood' },
      { user_id: 'u2', rating: 8, tmdb_id: 27205, title: 'Inception', genres: '[]', industry: 'hollywood' },
    ];
    const g = buildGraphFromRows(rows);
    expect(g.nodeCount).toBe(1); // both rows collapse to one node
    expect(g.nodes.get('tmdb:movie:27205').avgRating).toBeCloseTo(8.5);
  });

  test('falls back to title when tmdb_id is missing', () => {
    const rows = [
      { user_id: 'u1', rating: 7, tmdb_id: null, title: 'Indie Film', genres: '[]', industry: null },
      { user_id: 'u2', rating: 7, tmdb_id: null, title: 'indie film', genres: '[]', industry: null },
    ];
    const g = buildGraphFromRows(rows);
    expect(g.nodeCount).toBe(1);
    expect(g.nodes.has('title:movie::indie film')).toBe(true);
  });

  test('creates an edge between two movies one user watched together', () => {
    const rows = [
      { user_id: 'u1', rating: 9, tmdb_id: 1, title: 'A', genres: '["action"]', industry: 'hollywood' },
      { user_id: 'u1', rating: 9, tmdb_id: 2, title: 'B', genres: '["action"]', industry: 'hollywood' },
    ];
    const g = buildGraphFromRows(rows);
    expect(g.nodeCount).toBe(2);
    expect(g.edgeCount).toBe(1);
    // High similarity: co-watched (0.4*0.5) + genres (0.3) + industry (0.2) + rating (0.1) = 0.8
    expect(g.neighbors('tmdb:movie:1')[0].weight).toBeCloseTo(0.8);
  });

  test('does not create an edge for dissimilar movies below threshold', () => {
    const rows = [
      // Different users (no co-watch), no shared genre, different industry, far ratings.
      { user_id: 'u1', rating: 2, tmdb_id: 1, title: 'A', genres: '["horror"]', industry: 'hollywood' },
      { user_id: 'u2', rating: 10, tmdb_id: 2, title: 'B', genres: '["romance"]', industry: 'bollywood' },
    ];
    const g = buildGraphFromRows(rows);
    expect(g.edgeCount).toBe(0);
  });

  test('produces working recommendations end to end', () => {
    const rows = [
      { user_id: 'u1', rating: 9, tmdb_id: 1, title: 'A', genres: '["action"]', industry: 'hollywood' },
      { user_id: 'u1', rating: 9, tmdb_id: 2, title: 'B', genres: '["action"]', industry: 'hollywood' },
      { user_id: 'u2', rating: 8, tmdb_id: 2, title: 'B', genres: '["action"]', industry: 'hollywood' },
      { user_id: 'u2', rating: 8, tmdb_id: 3, title: 'C', genres: '["action"]', industry: 'hollywood' },
    ];
    const g = buildGraphFromRows(rows);
    // A user who watched only A should be recommended B (and possibly C).
    const recs = g.recommend(['tmdb:movie:1'], 5).map(r => r.id);
    expect(recs).toContain('tmdb:movie:2');
    expect(recs).not.toContain('tmdb:movie:1');
  });
});

test('manual titles containing separators still produce edges', () => {
  const graph=buildGraphFromRows([
    {user_id:'u',title:'A | B',type:'movie',genres:'["drama"]',industry:'indie',rating:8},
    {user_id:'u',title:'C',type:'movie',genres:'["drama"]',industry:'indie',rating:8}
  ]);
  expect(graph.edgeCount).toBe(1);
});

test('episode-heavy viewers have one rating contribution per series',()=>{
  const graph=buildGraphFromRows([
    ...Array.from({length:20},()=>({user_id:'binger',tmdb_id:1,type:'tv_series',title:'Series',rating:10})),
    {user_id:'other',tmdb_id:1,type:'tv_series',title:'Series',rating:2}
  ]);
  expect(graph.nodes.get('tmdb:tv_series:1').avgRating).toBe(6);
});
