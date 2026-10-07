// DiaryFLIX — WatchLogs routes
// GET    /logs              list all entries for current user (JOIN movies)
// GET    /logs/:id          single entry
// POST   /logs              create — upserts movie first, then inserts watchlog
// PUT    /logs/:id          update watch fields + movie metadata
// DELETE /logs/:id          delete watchlog; deletes movie if no more watches remain

const express = require('express');
const { randomUUID } = require('node:crypto');
const { upsertEpisode, requireSeries } = require('../lib/tv');
const { query, transaction } = require('../db');
const {
  authenticateJWT,
  asyncHandler,
  HttpError,
  assertString,
  clampInt,
  assertDate,
} = require('../middleware');

const router = express.Router();
router.use(authenticateJWT);

// ── JSON array fields ────────────────────────────────────────────────────────

const JSON_FIELDS = ['actors', 'actresses', 'favouriteSongs', 'favouriteQuotes', 'genres'];

function parseJsonArray(v) {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function rowToApi(row) {
  if (!row) return null;
  const out = { ...row };
  for (const f of JSON_FIELDS) out[f] = parseJsonArray(row[f]);
  out.entryType = out.episodeId ? 'episode' : out.type === 'tv_series' ? 'series' : 'film';
  out.rewatchCount = Math.max(0, (Number(out.watchCount) || 1) - 1);
  return out;
}

// ── Input sanitisation ───────────────────────────────────────────────────────

function sanitiseMovieFields(body) {
  return {
    title:        assertString(body.title, 'title', { min: 1, max: 500 }),
    type:         body.type === 'tv_series' ? 'tv_series' : 'movie',
    movieId:      body.movieId || null,
    year:         body.year != null ? String(body.year).slice(0, 16)   : null,
    tmdbId:       clampInt(body.tmdbId, { fallback: null }),
    posterPath:   body.posterPath   ? String(body.posterPath).slice(0, 255)   : null,
    backdropPath: body.backdropPath ? String(body.backdropPath).slice(0, 255) : null,
    overview:     body.overview != null ? String(body.overview) : null,
    director:     body.director     ? String(body.director).slice(0, 255)  : null,
    runtime:      clampInt(body.runtime,  { min: 0, max: 10000, fallback: 0 }),
    industry:     body.industry     ? String(body.industry).slice(0, 64)   : null,
    actors:       Array.isArray(body.actors)    ? body.actors.filter(Boolean).map(String)    : [],
    actresses:    Array.isArray(body.actresses) ? body.actresses.filter(Boolean).map(String) : [],
    genres:       Array.isArray(body.genres)    ? body.genres.filter(Boolean).map(String)    : [],
  };
}

function sanitiseWatchFields(body) {
  return {
    dateWatched:     assertDate(body.dateWatched, 'dateWatched'),
    category:        body.category != null ? String(body.category).slice(0, 255) : null,
    rating:          clampInt(body.rating, { min: 0, max: 10, fallback: 0 }),
    moodBefore:      body.moodBefore   ? String(body.moodBefore).slice(0, 64)   : null,
    moodAfter:       body.moodAfter    ? String(body.moodAfter).slice(0, 64)    : null,
    notes:           body.notes != null ? String(body.notes) : '',
    platform:        body.platform     ? String(body.platform).slice(0, 128)    : null,
    watchedWith:     body.watchedWith  ? String(body.watchedWith).slice(0, 128) : null,
    occasion:        body.occasion     ? String(body.occasion).slice(0, 255)    : null,
    favouriteSongs:  Array.isArray(body.favouriteSongs)  ? body.favouriteSongs  : [],
    favouriteQuotes: Array.isArray(body.favouriteQuotes) ? body.favouriteQuotes.filter(Boolean).map(String) : [],
  };
}

// ── Movie upsert ─────────────────────────────────────────────────────────────

async function upsertMovie(userId, movie) {
  // Serialize writes for this owner; transaction-scoped lock also protects manual rewatches.
  await query('SELECT id FROM users WHERE id = @userId FOR UPDATE', { userId });
  const {
    tmdbId, title, type, year, posterPath, backdropPath, overview,
    director, actors, actresses, genres, runtime, industry,
  } = movie;

  const actorsJson    = JSON.stringify(actors    || []);
  const actressesJson = JSON.stringify(actresses || []);
  const genresJson    = JSON.stringify(genres    || []);

  let existing = null;

  if (movie.movieId) {
    const found = await query('SELECT id,type FROM movies WHERE id = @id AND user_id = @userId', { id: movie.movieId, userId });
    if (!found.rows.length) throw new HttpError(404, 'Movie not found');
    existing = found.rows[0];
    if(existing.type !== type) throw new HttpError(400, 'The content type of a saved title cannot be changed');
  }
  if (!existing && tmdbId) {
    const r = await query(
      'SELECT id FROM movies WHERE user_id = @userId AND tmdb_id = @tmdbId AND type = @type',
      { userId, tmdbId, type }
    );
    if (r.rows.length > 0) existing = r.rows[0];
  }

  if (existing) {
    await query(`
      UPDATE movies SET
        title = @title, type = @type, year = @year,
        poster_path = @posterPath, backdrop_path = @backdropPath, overview = @overview,
        director = @director, actors = @actors, actresses = @actresses,
        genres = @genres, runtime = @runtime, industry = @industry,
        updated_at = NOW()
      WHERE id = @id
    `, {
      title, type, year, posterPath, backdropPath, overview, director,
      actors: actorsJson, actresses: actressesJson, genres: genresJson,
      runtime: runtime || 0, industry, id: existing.id,
    });
    return existing.id;
  }

  const movieId = `mov_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await query(`
    INSERT INTO movies
      (id, user_id, tmdb_id, title, type, year, poster_path, backdrop_path,
       overview, director, actors, actresses, genres, runtime, industry)
    VALUES
      (@id, @userId, @tmdbId, @title, @type, @year, @posterPath, @backdropPath,
       @overview, @director, @actors, @actresses, @genres, @runtime, @industry)
  `, {
    id: movieId, userId, tmdbId: tmdbId || null, title, type, year,
    posterPath, backdropPath, overview, director,
    actors: actorsJson, actresses: actressesJson, genres: genresJson,
    runtime: runtime || 0, industry,
  });

  return movieId;
}

// ── Shared SELECT ─────────────────────────────────────────────────────────────

const LOG_SELECT = `
  SELECT
    wl.id,
    wl.episode_id AS "episodeId", wl.watched_minutes AS "watchedMinutes",
    e.number AS "episodeNumber", s.number AS "seasonNumber", e.title AS "episodeTitle",
    e.runtime AS "episodeRuntime", to_char(e.air_date,'YYYY-MM-DD') AS "episodeAirDate",
    wl.user_id          AS "userId",
    wl.movie_id         AS "movieId",
    wl.date_watched     AS "dateWatched",
    wl.rating,
    wl.category,
    wl.mood_before      AS "moodBefore",
    wl.mood_after       AS "moodAfter",
    wl.platform,
    wl.watched_with     AS "watchedWith",
    wl.occasion,
    wl.favourite_songs  AS "favouriteSongs",
    wl.favourite_quotes AS "favouriteQuotes",
    wl.notes,
    wl.created_at       AS "createdAt",
    wl.updated_at       AS "updatedAt",
    m.tmdb_id           AS "tmdbId",
    m.title, m.type, m.year,
    m.poster_path       AS "posterPath",
    m.backdrop_path     AS "backdropPath",
    m.overview,
    m.director, m.actors, m.actresses, m.genres, m.runtime, m.industry,
    (SELECT COUNT(*)::INTEGER FROM watchlogs counts WHERE counts.movie_id = wl.movie_id AND counts.user_id = wl.user_id AND counts.episode_id IS NOT DISTINCT FROM wl.episode_id) AS "watchCount"
  FROM watchlogs wl
  LEFT JOIN movies m ON m.id = wl.movie_id
  LEFT JOIN tv_episodes e ON e.id=wl.episode_id
  LEFT JOIN tv_seasons s ON s.id=e.season_id
`;

// ── GET /logs ────────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const result = await query(`
    ${LOG_SELECT}
    WHERE wl.user_id = @userId
    ORDER BY
      CASE WHEN wl.date_watched IS NULL THEN 1 ELSE 0 END,
      wl.date_watched DESC,
      wl.created_at   DESC, wl.id DESC
    LIMIT @limit OFFSET @offset
  `, { userId: req.user.id, limit: clampInt(req.query.limit ?? 200, { min: 1, max: 500 }), offset: clampInt(req.query.offset ?? 0, { min: 0 }) });

  res.json(result.rows.map(rowToApi));
}));

// ── GET /logs/:id ────────────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await query(
    `${LOG_SELECT} WHERE wl.id = @id AND wl.user_id = @userId`,
    { id: req.params.id, userId: req.user.id }
  );
  if (result.rows.length === 0) throw new HttpError(404, 'Log not found');
  res.json(rowToApi(result.rows[0]));
}));

// ── POST /logs ───────────────────────────────────────────────────────────────

router.post('/', asyncHandler(async (req, res) => {
  const saved = await transaction(async () => {
  const movie = sanitiseMovieFields(req.body);
  const watch = sanitiseWatchFields(req.body);

  if (req.body.episode) {
    const requestKey=assertString(req.body.requestId,'requestId',{min:16,max:100});
    await query('SELECT id FROM users WHERE id=@userId FOR UPDATE',{userId:req.user.id});
    const old=(await query(`${LOG_SELECT} WHERE wl.user_id=@userId AND wl.client_request_id=@requestKey`,{userId:req.user.id,requestKey})).rows[0];
    if(old) {
      if(old.type!==movie.type || old.title!==movie.title || (movie.movieId && old.movieId!==movie.movieId) || old.seasonNumber!==req.body.episode.seasonNumber || old.episodeNumber!==req.body.episode.episodeNumber) throw new HttpError(409,'This request ID was already used for another watch');
      return rowToApi(old);
    }
  }
  const movieId = await upsertMovie(req.user.id, movie);
  const logId = randomUUID();
  let episodeId = null;
  let watchedMinutes = movie.type === 'movie' ? (movie.runtime || null) : null;
  let requestKey = null;
  if (req.body.episode) {
    if(movie.type !== 'tv_series') throw new HttpError(400, 'Films cannot contain episode watches');
    await requireSeries(movieId,req.user.id);
    requestKey=assertString(req.body.requestId,'requestId',{min:16,max:100});
    const episode=await upsertEpisode(movieId,req.user.id,req.body.episode);
    episodeId=episode.id; watchedMinutes=episode.runtime;
    const priorWatch=(await query('SELECT id FROM watchlogs WHERE user_id=@userId AND episode_id=@episodeId LIMIT 1',{userId:req.user.id,episodeId})).rows[0];
    if(priorWatch && req.body.allowRewatch !== true) throw new HttpError(409,'This episode is already watched. Choose Log another watch to record a rewatch.','EPISODE_ALREADY_WATCHED');
  }

  await query(`
    INSERT INTO watchlogs
      (id, user_id, movie_id, episode_id, watched_minutes, client_request_id, date_watched, rating, category,
       mood_before, mood_after, platform, watched_with, occasion,
       favourite_songs, favourite_quotes, notes)
    VALUES
      (@id, @userId, @movieId, @episodeId, @watchedMinutes, @requestKey, @dateWatched, @rating, @category,
       @moodBefore, @moodAfter, @platform, @watchedWith, @occasion,
       @favouriteSongs, @favouriteQuotes, @notes)
  `, {
    id: logId, userId: req.user.id, movieId, episodeId, watchedMinutes, requestKey,
    dateWatched:     watch.dateWatched,
    rating:          watch.rating,
    category:        watch.category,
    moodBefore:      watch.moodBefore,
    moodAfter:       watch.moodAfter,
    platform:        watch.platform,
    watchedWith:     watch.watchedWith,
    occasion:        watch.occasion,
    favouriteSongs:  JSON.stringify(watch.favouriteSongs),
    favouriteQuotes: JSON.stringify(watch.favouriteQuotes),
    notes:           watch.notes,
  });

  const result = await query(
    `${LOG_SELECT} WHERE wl.id = @id AND wl.user_id = @userId`,
    { id: logId, userId: req.user.id }
  );
  return rowToApi(result.rows[0]);
  });
  res.status(201).json(saved);
}));

// ── PUT /logs/:id ────────────────────────────────────────────────────────────

router.put('/:id', asyncHandler(async (req, res) => {
  const saved = await transaction(async () => {
  const existing = await query(
    'SELECT w.id,w.movie_id,w.episode_id,m.type FROM watchlogs w JOIN movies m ON m.id=w.movie_id WHERE w.id=@id AND w.user_id=@userId FOR UPDATE OF w,m',
    { id: req.params.id, userId: req.user.id }
  );
  if (existing.rows.length === 0) throw new HttpError(404, 'Log not found');

  const { movie_id: movieId } = existing.rows[0];
  const movie = sanitiseMovieFields(req.body);
  const watch = sanitiseWatchFields(req.body);
  if(movie.type!==existing.rows[0].type) throw new HttpError(400,'The content type of a saved entry cannot be changed');
  if(req.body.episodeId && req.body.episodeId!==existing.rows[0].episode_id) throw new HttpError(400,'Episode identity cannot be changed');

  if (movieId) {
    await query(`
      UPDATE movies SET
        title = @title, type = @type, year = @year,
        poster_path = @posterPath, backdrop_path = @backdropPath, overview = @overview,
        director = @director, actors = @actors, actresses = @actresses,
        genres = @genres, runtime = @runtime, industry = @industry,
        updated_at = NOW()
      WHERE id = @id
    `, {
      title: movie.title, type: movie.type, year: movie.year,
      posterPath: movie.posterPath, backdropPath: movie.backdropPath, overview: movie.overview,
      director: movie.director,
      actors:    JSON.stringify(movie.actors),
      actresses: JSON.stringify(movie.actresses),
      genres:    JSON.stringify(movie.genres),
      runtime: movie.runtime, industry: movie.industry, id: movieId,
    });
  }

  await query(`
    UPDATE watchlogs SET
      date_watched = @dateWatched, rating = @rating, category = @category,
      mood_before = @moodBefore, mood_after = @moodAfter,
      platform = @platform, watched_with = @watchedWith, occasion = @occasion,
      favourite_songs = @favouriteSongs, favourite_quotes = @favouriteQuotes,
      notes = @notes, updated_at = NOW()
    WHERE id = @id AND user_id = @userId
  `, {
    dateWatched:     watch.dateWatched,
    rating:          watch.rating,
    category:        watch.category,
    moodBefore:      watch.moodBefore,
    moodAfter:       watch.moodAfter,
    platform:        watch.platform,
    watchedWith:     watch.watchedWith,
    occasion:        watch.occasion,
    favouriteSongs:  JSON.stringify(watch.favouriteSongs),
    favouriteQuotes: JSON.stringify(watch.favouriteQuotes),
    notes:           watch.notes,
    id:              req.params.id,
    userId:          req.user.id,
  });

  const result = await query(
    `${LOG_SELECT} WHERE wl.id = @id AND wl.user_id = @userId`,
    { id: req.params.id, userId: req.user.id }
  );
  return rowToApi(result.rows[0]);
  });
  res.json(saved);
}));

// ── DELETE /logs/:id ─────────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM watchlogs WHERE id = @id AND user_id = @userId', { id: req.params.id, userId: req.user.id });
  if (!result.rowCount) throw new HttpError(404, 'Log not found');
  res.json({ success: true });
}));

module.exports = router;
