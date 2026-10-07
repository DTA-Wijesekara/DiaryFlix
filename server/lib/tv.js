const { randomUUID } = require('node:crypto');
const { query } = require('../db');
const { HttpError, assertDate } = require('../middleware');

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(400, `Invalid ${name}`);
  return value;
}
function episodeInput(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Episode details required');
  return {
    season: integer(input.seasonNumber, 'season number', 0, 1000),
    number: integer(input.episodeNumber, 'episode number', 1, 10000),
    title: String(input.title || '').slice(0,500),
    runtime: input.runtime == null || input.runtime === '' || input.runtime === 0 ? null : integer(input.runtime,'episode runtime',1,10000),
    airDate: assertDate(input.airDate, 'airDate'),
    tmdbId: input.tmdbId == null ? null : integer(input.tmdbId,'episode ID',1,Number.MAX_SAFE_INTEGER),
  };
}
async function requireSeries(movieId, userId) {
  const row = (await query('SELECT id,type FROM movies WHERE id=@movieId AND user_id=@userId FOR UPDATE', {movieId,userId})).rows[0];
  if (!row) throw new HttpError(404,'Series not found');
  if (row.type !== 'tv_series') throw new HttpError(400,'Episode tracking is only available for TV series');
}
async function upsertEpisode(movieId,userId,input) {
  const ep=episodeInput(input);
  const season=(await query(`INSERT INTO tv_seasons(id,movie_id,user_id,number) VALUES(@id,@movieId,@userId,@number)
    ON CONFLICT(movie_id,number) DO UPDATE SET number=EXCLUDED.number RETURNING id`, {id:randomUUID(),movieId,userId,number:ep.season})).rows[0];
  const row=(await query(`INSERT INTO tv_episodes(id,season_id,movie_id,user_id,number,title,runtime,air_date,tmdb_id)
    VALUES(@id,@seasonId,@movieId,@userId,@number,@title,@runtime,@airDate,@tmdbId)
    ON CONFLICT(season_id,number) DO UPDATE SET title=CASE WHEN EXCLUDED.title='' THEN tv_episodes.title ELSE EXCLUDED.title END,
      runtime=COALESCE(EXCLUDED.runtime,tv_episodes.runtime),air_date=COALESCE(EXCLUDED.air_date,tv_episodes.air_date),tmdb_id=COALESCE(EXCLUDED.tmdb_id,tv_episodes.tmdb_id)
    RETURNING id,runtime,(xmax=0) AS inserted`,{id:randomUUID(),seasonId:season.id,movieId,userId,...ep})).rows[0];
  await query(`INSERT INTO tv_tracking(movie_id,user_id) VALUES(@movieId,@userId) ON CONFLICT(movie_id) DO NOTHING`,{movieId,userId});
  if(row.inserted) await query('UPDATE tv_tracking SET catalog_complete=FALSE WHERE movie_id=@movieId AND user_id=@userId',{movieId,userId});
  return row;
}
async function upsertCatalog(movieId, userId, inputs) {
  const seasons = new Map();
  const seen = new Set();
  const episodes = inputs.map(input => {
    const ep = episodeInput(input);
    const key = `${ep.season}:${ep.number}`;
    if (seen.has(key)) throw new HttpError(400, 'Duplicate episode in catalog batch');
    seen.add(key);
    if (!seasons.has(ep.season)) seasons.set(ep.season, randomUUID());
    return { ...ep, id: randomUUID(), seasonId: seasons.get(ep.season) };
  });
  if (!episodes.length) return;
  // Import a batch in one round trip rather than issuing several queries per episode.
  await query(`WITH incoming AS (
    SELECT * FROM jsonb_to_recordset(@episodes::jsonb) AS x(
      id text,"seasonId" text,season integer,number integer,title text,runtime integer,"airDate" date,"tmdbId" bigint)
  ), seasons AS (
    INSERT INTO tv_seasons(id,movie_id,user_id,number)
    SELECT DISTINCT "seasonId",@movieId,@userId,season FROM incoming
    ON CONFLICT(movie_id,number) DO UPDATE SET number=EXCLUDED.number
    RETURNING id,number
  )
  INSERT INTO tv_episodes(id,season_id,movie_id,user_id,number,title,runtime,air_date,tmdb_id)
  SELECT e.id,s.id,@movieId,@userId,e.number,e.title,e.runtime,e."airDate",e."tmdbId"
  FROM incoming e JOIN seasons s ON s.number=e.season
  ON CONFLICT(season_id,number) DO UPDATE SET
    title=CASE WHEN EXCLUDED.title='' THEN tv_episodes.title ELSE EXCLUDED.title END,
    runtime=COALESCE(EXCLUDED.runtime,tv_episodes.runtime),
    air_date=COALESCE(EXCLUDED.air_date,tv_episodes.air_date),
    tmdb_id=COALESCE(EXCLUDED.tmdb_id,tv_episodes.tmdb_id)`,
  { movieId, userId, episodes: JSON.stringify(episodes) });
}
module.exports={integer,episodeInput,requireSeries,upsertEpisode,upsertCatalog};
