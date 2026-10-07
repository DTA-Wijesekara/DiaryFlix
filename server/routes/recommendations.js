// DiaryFLIX — Recommendation routes
// GET /recommendations          personalized list for the current user
// GET /recommendations/similar  movies similar to a given movie (tmdbId or title)

const express = require('express');
const { query } = require('../db');
const { authenticateJWT, asyncHandler } = require('../middleware');
const { getGraph, getLastBuiltAt } = require('../lib/graphStore');
const { normalizeKey } = require('../lib/graphBuilder');

const { loadSnapshot } = require('../lib/graphSnapshot');
const router = express.Router();
router.use(authenticateJWT);
router.use(asyncHandler(async (_req, _res, next) => { await loadSnapshot(); next(); }));

// Resolve the set of graph node keys a user has already watched.
async function getUserWatchedKeys(userId) {
  const { rows } = await query(`
    SELECT m.tmdb_id AS tmdb_id, m.title AS title, m.type AS type, m.year AS year
    FROM watchlogs wl
    JOIN movies m ON m.id = wl.movie_id
    WHERE wl.user_id = @userId
  `, { userId });
  return [...new Set(rows.map(normalizeKey))];
}

// When a user has no history, surface the most-connected ("popular") movies.
function popularFallback(graph, limit) {
  return [...graph.nodes.entries()]
    .map(([id, meta]) => ({
      id,
      score: graph.neighbors(id).length,
      because: null,
      becauseTitle: null,
      ...meta,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── GET /recommendations ─────────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const graph = getGraph();

  if (!graph || graph.nodeCount === 0) {
    return res.json({ recommendations: [], fallback: false, stats: { nodeCount: 0, edgeCount: 0 } });
  }

  const watched = await getUserWatchedKeys(req.user.id);

  let recommendations;
  let fallback = false;

  if (watched.length === 0) {
    recommendations = popularFallback(graph, 10);
    fallback = true;
  } else {
    recommendations = graph.recommend(watched, 12).map(r => ({
      ...r,
      becauseTitle: r.because ? (graph.nodes.get(r.because)?.title ?? null) : null,
    }));
  }

  res.json({
    recommendations,
    fallback,
    stats: {
      nodeCount: graph.nodeCount,
      edgeCount: graph.edgeCount,
      builtAt: getLastBuiltAt(),
    },
  });
}));

// ── GET /recommendations/similar?tmdbId=…  |  ?title=… ───────────────────────
router.get('/similar', asyncHandler(async (req, res) => {
  const graph = getGraph();
  const { tmdbId, title, type, year } = req.query;

  const key = normalizeKey({ tmdb_id: tmdbId, title, type, year });

  if (!graph || !graph.nodes.has(key)) {
    return res.json({ similar: [] });
  }

  const similar = graph.bfs(key, 2)
    .map(r => ({ id: r.id, weight: r.weight, depth: r.depth, ...graph.nodes.get(r.id) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);

  res.json({ similar });
}));

module.exports = router;
