const { RecommendationGraph, MinHeap } = require('../lib/recommendationGraph');

// Build a small known graph for deterministic assertions:
//
//   A ──0.9── B ──0.5── C
//   │
//  0.4
//   │
//   D                       E ──0.8── F   (E,F is a separate cluster)
//
function buildSampleGraph() {
  const g = new RecommendationGraph();
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(id => g.addNode(id, { title: id }));
  g.addEdge('A', 'B', 0.9);
  g.addEdge('B', 'C', 0.5);
  g.addEdge('A', 'D', 0.4);
  g.addEdge('E', 'F', 0.8);
  return g;
}

describe('MinHeap', () => {
  test('pops items in ascending priority order', () => {
    const h = new MinHeap();
    h.push('c', 3);
    h.push('a', 1);
    h.push('b', 2);
    expect(h.pop().value).toBe('a');
    expect(h.pop().value).toBe('b');
    expect(h.pop().value).toBe('c');
    expect(h.pop()).toBeNull();
  });
});

describe('RecommendationGraph — construction', () => {
  test('addNode / addEdge build a correct undirected adjacency list', () => {
    const g = buildSampleGraph();
    expect(g.nodeCount).toBe(6);
    expect(g.edgeCount).toBe(4);

    const aNeighbors = g.neighbors('A').map(e => e.to).sort();
    expect(aNeighbors).toEqual(['B', 'D']);
    // edge is bidirectional
    expect(g.neighbors('B').some(e => e.to === 'A' && e.weight === 0.9)).toBe(true);
  });

  test('re-adding an edge keeps the larger weight', () => {
    const g = new RecommendationGraph();
    g.addEdge('X', 'Y', 0.3);
    g.addEdge('X', 'Y', 0.7);
    expect(g.neighbors('X')[0].weight).toBe(0.7);
    expect(g.edgeCount).toBe(1);
  });
});

describe('RecommendationGraph — BFS', () => {
  test('returns nodes in correct hop order', () => {
    const g = buildSampleGraph();
    const result = g.bfs('A', 2);
    const ids = result.map(r => r.id);

    // hop 1: B, D  | hop 2: C
    expect(ids).toContain('B');
    expect(ids).toContain('D');
    expect(ids).toContain('C');
    expect(result.find(r => r.id === 'B').depth).toBe(1);
    expect(result.find(r => r.id === 'C').depth).toBe(2);
  });

  test('respects the maxHops limit', () => {
    const g = buildSampleGraph();
    const ids = g.bfs('A', 1).map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining(['B', 'D']));
    expect(ids).not.toContain('C'); // C is 2 hops away
  });

  test('returns empty array for an unknown start node', () => {
    const g = buildSampleGraph();
    expect(g.bfs('ZZZ')).toEqual([]);
  });
});

describe('RecommendationGraph — Dijkstra & shortestPath', () => {
  test('computes shortest weighted distances (distance = 1 - weight)', () => {
    const g = buildSampleGraph();
    const { distances } = g.dijkstra('A');

    // A->B cost = 1-0.9 = 0.1
    expect(distances.get('B')).toBeCloseTo(0.1);
    // A->B->C cost = 0.1 + (1-0.5) = 0.6
    expect(distances.get('C')).toBeCloseTo(0.6);
    // E,F unreachable from A
    expect(distances.get('E')).toBe(Infinity);
  });

  test('shortestPath returns the correct chain', () => {
    const g = buildSampleGraph();
    expect(g.shortestPath('A', 'C')).toEqual(['A', 'B', 'C']);
  });

  test('shortestPath returns [] when unreachable', () => {
    const g = buildSampleGraph();
    expect(g.shortestPath('A', 'E')).toEqual([]);
  });
});

describe('RecommendationGraph — connectedComponents', () => {
  test('separates disconnected clusters', () => {
    const g = buildSampleGraph();
    const components = g.connectedComponents().map(c => c.sort());

    // One cluster {A,B,C,D}, another {E,F}
    const sizes = components.map(c => c.length).sort();
    expect(sizes).toEqual([2, 4]);
    expect(components).toContainEqual(['E', 'F']);
  });
});

describe('RecommendationGraph — recommend', () => {
  test('excludes already-watched movies', () => {
    const g = buildSampleGraph();
    const recs = g.recommend(['A'], 10);
    const ids = recs.map(r => r.id);
    expect(ids).not.toContain('A');
    expect(ids).toEqual(expect.arrayContaining(['B', 'C', 'D']));
  });

  test('ranks by accumulated similarity and tags a reason', () => {
    const g = buildSampleGraph();
    const recs = g.recommend(['A'], 10);

    // B (weight 0.9, depth 1) should outrank D (weight 0.4, depth 1)
    const b = recs.find(r => r.id === 'B');
    const d = recs.find(r => r.id === 'D');
    expect(b.score).toBeGreaterThan(d.score);
    expect(b.because).toBe('A'); // recommended because user watched A
    expect(b.title).toBe('B');   // metadata is merged in
  });
});
