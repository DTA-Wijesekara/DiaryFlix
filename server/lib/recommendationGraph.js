// DiaryFLIX — Recommendation Graph
// A generic in-memory weighted, undirected graph with the traversal algorithms
// used to power movie recommendations. This module has NO database knowledge —
// it operates purely on nodes (movies) and weighted edges (similarity scores).
//
// Edge weight is a similarity score in (0, 1]. For shortest-path purposes a high
// similarity means a SHORT distance, so distance = 1 - weight.

// ── Min-heap (priority queue) ──────────────────────────────────────────────
// Hand-written binary min-heap keyed by `priority`. Used by Dijkstra so we can
// always pop the closest unvisited node in O(log n).

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(value, priority) {
    this.items.push({ value, priority });
    this._bubbleUp(this.items.length - 1);
  }

  pop() {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._bubbleDown(0);
    }
    return top;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[i].priority >= this.items[parent].priority) break;
      [this.items[i], this.items[parent]] = [this.items[parent], this.items[i]];
      i = parent;
    }
  }

  _bubbleDown(i) {
    const n = this.items.length;
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;
      if (left < n && this.items[left].priority < this.items[smallest].priority) smallest = left;
      if (right < n && this.items[right].priority < this.items[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.items[i], this.items[smallest]] = [this.items[smallest], this.items[i]];
      i = smallest;
    }
  }
}

// ── Recommendation graph ───────────────────────────────────────────────────

class RecommendationGraph {
  constructor() {
    this.adjacency = new Map(); // id -> Array<{ to, weight }>
    this.nodes = new Map();     // id -> metadata (title, genres, industry, ...)
  }

  addNode(id, metadata = {}) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, metadata);
      this.adjacency.set(id, []);
    } else {
      // Merge metadata if the node is re-added with more info.
      this.nodes.set(id, { ...this.nodes.get(id), ...metadata });
    }
  }

  // Undirected weighted edge. If the edge already exists, keep the larger weight.
  addEdge(a, b, weight) {
    if (a === b) return;
    if (!this.nodes.has(a)) this.addNode(a);
    if (!this.nodes.has(b)) this.addNode(b);

    this._upsertEdge(a, b, weight);
    this._upsertEdge(b, a, weight);
  }

  _upsertEdge(from, to, weight) {
    const list = this.adjacency.get(from);
    const existing = list.find(e => e.to === to);
    if (existing) {
      existing.weight = Math.max(existing.weight, weight);
    } else {
      list.push({ to, weight });
    }
  }

  neighbors(id) {
    return this.adjacency.get(id) || [];
  }

  get nodeCount() {
    return this.nodes.size;
  }

  get edgeCount() {
    let total = 0;
    for (const list of this.adjacency.values()) total += list.length;
    return total / 2; // undirected — each edge counted twice
  }

  // ── BFS ──────────────────────────────────────────────────────────────────
  // Breadth-first traversal from a single start node. Returns reachable nodes
  // (excluding the start) with the hop depth and the edge weight that reached
  // them, ordered closest-first.
  bfs(startId, maxHops = 2) {
    if (!this.nodes.has(startId)) return [];

    const visited = new Set([startId]);
    const queue = [{ id: startId, depth: 0, weight: 0 }];
    const results = [];

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth >= maxHops) continue;

      for (const { to, weight } of this.neighbors(id)) {
        if (!visited.has(to)) {
          visited.add(to);
          results.push({ id: to, depth: depth + 1, weight });
          queue.push({ id: to, depth: depth + 1, weight });
        }
      }
    }

    return results;
  }

  // ── Dijkstra ───────────────────────────────────────────────────────────────
  // Shortest weighted paths from a start node. distance = sum of (1 - weight)
  // along the path, so highly-similar chains are "shorter". Returns a Map of
  // id -> { distance, prev } for path reconstruction.
  dijkstra(startId) {
    const distances = new Map();
    const prev = new Map();
    if (!this.nodes.has(startId)) return { distances, prev };

    for (const id of this.nodes.keys()) distances.set(id, Infinity);
    distances.set(startId, 0);

    const heap = new MinHeap();
    heap.push(startId, 0);

    while (heap.size > 0) {
      const { value: id, priority: dist } = heap.pop();
      if (dist > distances.get(id)) continue; // stale entry

      for (const { to, weight } of this.neighbors(id)) {
        const cost = 1 - weight; // similarity -> distance
        const next = dist + cost;
        if (next < distances.get(to)) {
          distances.set(to, next);
          prev.set(to, id);
          heap.push(to, next);
        }
      }
    }

    return { distances, prev };
  }

  // Reconstruct the chain of node ids from `fromId` to `toId` (inclusive).
  // Returns [] if unreachable.
  shortestPath(fromId, toId) {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) return [];
    const { distances, prev } = this.dijkstra(fromId);
    if (distances.get(toId) === Infinity) return [];

    const path = [];
    let current = toId;
    while (current !== undefined) {
      path.unshift(current);
      if (current === fromId) break;
      current = prev.get(current);
    }
    return path[0] === fromId ? path : [];
  }

  // ── Connected components (DFS) ──────────────────────────────────────────────
  // Groups nodes into clusters where every node is reachable from the others.
  connectedComponents() {
    const visited = new Set();
    const components = [];

    for (const start of this.nodes.keys()) {
      if (visited.has(start)) continue;

      const component = [];
      const stack = [start];
      visited.add(start);

      while (stack.length > 0) {
        const id = stack.pop();
        component.push(id);
        for (const { to } of this.neighbors(id)) {
          if (!visited.has(to)) {
            visited.add(to);
            stack.push(to);
          }
        }
      }

      components.push(component);
    }

    return components;
  }

  // ── Recommendation (personalized) ───────────────────────────────────────────
  // Given the movies a user has already watched, traverse outward from each,
  // accumulate similarity scores, exclude already-watched, and return the
  // top-ranked candidates with a "because you watched X" reason.
  recommend(watchedIds, maxResults = 10, maxHops = 2) {
    const watched = new Set(watchedIds);
    const scores = new Map();  // candidateId -> accumulated score
    const reasons = new Map(); // candidateId -> { source, weight } best contributor

    for (const start of watchedIds) {
      if (!this.nodes.has(start)) continue;

      for (const { id, depth, weight } of this.bfs(start, maxHops)) {
        if (watched.has(id)) continue;

        // Closer hops contribute more; weight scaled down by depth.
        const contribution = weight / depth;
        scores.set(id, (scores.get(id) || 0) + contribution);

        const best = reasons.get(id);
        if (!best || weight > best.weight) {
          reasons.set(id, { source: start, weight });
        }
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({
        id,
        score: Number(score.toFixed(4)),
        because: reasons.get(id)?.source ?? null,
        ...this.nodes.get(id),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
}

module.exports = { RecommendationGraph, MinHeap };
