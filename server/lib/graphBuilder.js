// DiaryFLIX — Graph Builder
// Turns the per-user watchlog/movie data in PostgreSQL into a single shared
// RecommendationGraph. Because the `movies` table is per-user (the same film
// appears as a separate row for each user), movies are deduplicated into one
// node by TMDB id (falling back to a normalized title).

const { RecommendationGraph } = require('./recommendationGraph');

const SIMILARITY_THRESHOLD = 0.3;

// Weights for the similarity formula — must sum to 1.
const W_COWATCH  = 0.4;
const W_GENRES   = 0.3;
const W_INDUSTRY = 0.2;
const W_RATING   = 0.1;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Collapse per-user duplicates into a single stable key.
function normalizeKey(movie) {
  if (movie.tmdb_id != null && movie.tmdb_id !== '') return `tmdb:${movie.type || 'movie'}:${movie.tmdb_id}`;
  const title = String(movie.title || '').toLowerCase().trim();
  return `title:${movie.type || 'movie'}:${movie.year || ''}:${title}`;
}

function parseGenres(raw) {
  if (Array.isArray(raw)) return raw.map(g => String(g).toLowerCase());
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(g => String(g).toLowerCase()) : [];
  } catch {
    return [];
  }
}

// Jaccard similarity of two string arrays: |A ∩ B| / |A ∪ B|.
function jaccard(a, b) {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Diminishing-returns score for co-watch count: 1 → 0.5, 2 → 0.67, 3 → 0.75 ...
function coWatchScore(count) {
  return count > 0 ? 1 - 1 / (1 + count) : 0;
}

function pairKey(a, b) {
  return JSON.stringify(a < b ? [a, b] : [b, a]);
}

// Compute the weighted similarity between two movie nodes.
function computeSimilarity(metaA, metaB, coWatchCount) {
  const genreSim    = jaccard(metaA.genres, metaB.genres);
  const industrySim = metaA.industry && metaA.industry === metaB.industry ? 1 : 0;
  const ratingSim   = 1 - Math.abs((metaA.avgRating || 0) - (metaB.avgRating || 0)) / 10;

  return (
    W_COWATCH  * coWatchScore(coWatchCount) +
    W_GENRES   * genreSim +
    W_INDUSTRY * industrySim +
    W_RATING   * ratingSim
  );
}

// ── Build ────────────────────────────────────────────────────────────────────

async function buildGraphFromDB(query) {
  const { rows } = await query(`
    SELECT
      wl.user_id   AS user_id,
      wl.rating    AS rating,
      m.tmdb_id    AS tmdb_id,
      m.title      AS title,
      m.type       AS type,
      m.year       AS year,
      m.poster_path AS poster_path,
      m.genres     AS genres,
      m.industry   AS industry
    FROM watchlogs wl
    JOIN movies m ON m.id = wl.movie_id
    LIMIT 100001
  `);

  if (rows.length > 100000) throw new Error('Graph input exceeds 100000 watches; partition the rebuild before publishing');
  return buildGraphFromRows(rows);
}

// Pure function — takes raw rows and returns a RecommendationGraph.
// Separated from buildGraphFromDB so it can be unit-tested without a database.
function buildGraphFromRows(rows) {
  const nodeMeta   = new Map(); // key -> metadata
  const userMovies = new Map(); // user_id -> Set(key)
  const viewerRatings = new Map();
  const ratingsAcc = new Map(); // key -> { sum, count }

  for (const row of rows) {
    const key = normalizeKey(row);

    if (!nodeMeta.has(key)) {
      nodeMeta.set(key, {
        title:      row.title,
        type:       row.type,
        year:       row.year,
        posterPath: row.poster_path,
        industry:   row.industry ? String(row.industry).toLowerCase() : null,
        genres:     parseGenres(row.genres),
        avgRating:  0,
      });
    }

    if (!userMovies.has(row.user_id)) userMovies.set(row.user_id, new Set());
    userMovies.get(row.user_id).add(key);

    const r = Number(row.rating) || 0;
    if (r > 0) {
      const viewerKey=JSON.stringify([row.user_id,key]);
      const acc = viewerRatings.get(viewerKey) || { sum: 0, count: 0, key };
      acc.sum += r;
      acc.count += 1;
      viewerRatings.set(viewerKey, acc);
    }
  }

  for(const {key,sum,count} of viewerRatings.values()) {
    const acc=ratingsAcc.get(key)||{sum:0,count:0}; acc.sum+=sum/count; acc.count++; ratingsAcc.set(key,acc);
  }

  // Finalize average ratings.
  for (const [key, acc] of ratingsAcc) {
    nodeMeta.get(key).avgRating = acc.count > 0 ? acc.sum / acc.count : 0;
  }

  // Co-occurrence counts: for each user, count every pair of movies they watched.
  const coWatch = new Map();
  for (const keys of userMovies.values()) {
    const arr = [...keys];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (coWatch.size >= 100000) throw new Error('Graph candidate budget exceeded');
        const pk = pairKey(arr[i], arr[j]);
        coWatch.set(pk, (coWatch.get(pk) || 0) + 1);
      }
    }
  }

  // Candidate pairs: co-watch pairs PLUS pairs sharing an industry or genre
  // (so movies still connect even when no single user watched both).
  const candidates = new Set(coWatch.keys());
  addAttributeGroupPairs(nodeMeta, candidates);

  // Build the graph.
  const graph = new RecommendationGraph();
  for (const [key, meta] of nodeMeta) graph.addNode(key, meta);

  for (const pk of candidates) {
    const [a, b] = JSON.parse(pk);
    const metaA = nodeMeta.get(a);
    const metaB = nodeMeta.get(b);
    if (!metaA || !metaB) continue;

    const weight = computeSimilarity(metaA, metaB, coWatch.get(pk) || 0);
    if (weight >= SIMILARITY_THRESHOLD) {
      graph.addEdge(a, b, Number(weight.toFixed(4)));
    }
  }

  return graph;
}

// Group movies by industry and by genre, then add intra-group pairs as
// candidates. Keeps pair generation bounded by group sizes rather than M².
function addAttributeGroupPairs(nodeMeta, candidates) {
  const byIndustry = new Map();
  const byGenre = new Map();

  for (const [key, meta] of nodeMeta) {
    if (meta.industry) {
      if (!byIndustry.has(meta.industry)) byIndustry.set(meta.industry, []);
      byIndustry.get(meta.industry).push(key);
    }
    for (const genre of meta.genres) {
      if (!byGenre.has(genre)) byGenre.set(genre, []);
      byGenre.get(genre).push(key);
    }
  }

  const addGroupPairs = (groups) => {
    for (const members of groups.values()) {
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          if (candidates.size >= 100000) throw new Error('Graph candidate budget exceeded');
          candidates.add(pairKey(members[i], members[j]));
        }
      }
    }
  };

  addGroupPairs(byIndustry);
  addGroupPairs(byGenre);
}

module.exports = {
  buildGraphFromDB,
  buildGraphFromRows,
  normalizeKey,
  parseGenres,
  jaccard,
  computeSimilarity,
  coWatchScore,
  SIMILARITY_THRESHOLD,
};
