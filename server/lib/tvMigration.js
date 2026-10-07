// Additive migration: old TV logs remain series-level entries with unknown duration.
module.exports = async function tvMigration(query) {
  await query(`
    ALTER TABLE movies ADD CONSTRAINT movies_owner_type_unique UNIQUE(id,user_id,type);
    CREATE TABLE tv_seasons (
      id TEXT PRIMARY KEY, movie_id VARCHAR(100) NOT NULL, user_id VARCHAR(100) NOT NULL,
      series_type VARCHAR(32) NOT NULL DEFAULT 'tv_series' CHECK(series_type='tv_series'),
      number INTEGER NOT NULL CHECK(number>=0), title TEXT NOT NULL DEFAULT '',
      UNIQUE(movie_id,number), UNIQUE(id,movie_id,user_id),
      FOREIGN KEY(movie_id,user_id,series_type) REFERENCES movies(id,user_id,type) ON DELETE CASCADE
    );
    CREATE TABLE tv_episodes (
      id TEXT PRIMARY KEY, season_id TEXT NOT NULL, movie_id VARCHAR(100) NOT NULL, user_id VARCHAR(100) NOT NULL,
      number INTEGER NOT NULL CHECK(number>0), title TEXT NOT NULL DEFAULT '', tmdb_id BIGINT,
      air_date DATE, runtime INTEGER CHECK(runtime>0 AND runtime<=10000),
      UNIQUE(season_id,number), UNIQUE(id,movie_id,user_id),
      FOREIGN KEY(season_id,movie_id,user_id) REFERENCES tv_seasons(id,movie_id,user_id) ON DELETE CASCADE
    );
    CREATE TABLE tv_tracking (
      movie_id VARCHAR(100) PRIMARY KEY, user_id VARCHAR(100) NOT NULL,
      status TEXT NOT NULL DEFAULT 'watching' CHECK(status IN ('watching','on_hold','dropped','completed')),
      series_ended BOOLEAN NOT NULL DEFAULT FALSE,
      catalog_complete BOOLEAN NOT NULL DEFAULT FALSE, catalog_updated_at TIMESTAMPTZ,
      FOREIGN KEY(movie_id,user_id) REFERENCES movies(id,user_id) ON DELETE CASCADE
    );
    ALTER TABLE watchlogs ADD COLUMN episode_id TEXT;
    ALTER TABLE watchlogs ADD COLUMN watched_minutes INTEGER CHECK(watched_minutes>=0 AND watched_minutes<=10000);
    ALTER TABLE watchlogs ADD COLUMN client_request_id TEXT;
    ALTER TABLE watchlogs ADD CONSTRAINT watchlogs_episode_owner_fk FOREIGN KEY(episode_id,movie_id,user_id) REFERENCES tv_episodes(id,movie_id,user_id);
    CREATE UNIQUE INDEX watchlogs_request_unique ON watchlogs(user_id,client_request_id) WHERE client_request_id IS NOT NULL;
    CREATE INDEX watchlogs_episode_idx ON watchlogs(episode_id);
    UPDATE watchlogs w SET watched_minutes=NULLIF(m.runtime,0) FROM movies m WHERE w.movie_id=m.id AND m.type='movie';
  `);
};
