import { apiFetch } from './auth';
import { getTMDBKey } from './tmdb';

export const episodeLabel = log => log.episodeId || log.episodeNumber != null
  ? `S${String(log.seasonNumber).padStart(2, '0')} · E${String(log.episodeNumber).padStart(2, '0')}${log.episodeTitle ? ` — ${log.episodeTitle}` : ''}`
  : log.type === 'tv_series' ? 'Series entry' : '';

const cache = new Map();
async function tmdb(path) {
  const key = getTMDBKey();
  if (!key) throw new Error('Add a TMDB key in Settings or enter the episode manually.');
  const cached = cache.get(path);
  if (cached && Date.now() - cached.time < 600000) return cached.data;
  const response = await fetch(`https://api.themoviedb.org/3${path}?api_key=${encodeURIComponent(key)}`);
  if (!response.ok) throw new Error('Could not load episodes. Try again or enter the episode manually.');
  const data = await response.json();
  cache.set(path, { data, time: Date.now() });
  return data;
}
export const getSeriesMetadata = id => tmdb(`/tv/${encodeURIComponent(id)}`);
export async function getSeasonEpisodes(id, season) {
  const data = await tmdb(`/tv/${encodeURIComponent(id)}/season/${season}`);
  return (data.episodes || []).map(e => ({ seasonNumber: season, episodeNumber: e.episode_number,
    title: e.name || '', runtime: e.runtime || null, airDate: e.air_date || null, tmdbId: e.id }));
}
export const getSeriesProgress = id => apiFetch(`/series/${encodeURIComponent(id)}`);
export async function refreshSeriesCatalog(movieId, tmdbId) {
  const details = await getSeriesMetadata(tmdbId);
  const episodes = [];
  for (const season of details.seasons || []) episodes.push(...await getSeasonEpisodes(tmdbId, season.season_number));
  for (let offset = 0; offset < episodes.length; offset += 500) {
    await apiFetch(`/series/${encodeURIComponent(movieId)}/catalog`, { method: 'PUT', body: {
      episodes: episodes.slice(offset, offset + 500), catalogComplete: offset + 500 >= episodes.length,
      expectedEpisodeCount: episodes.length, seriesEnded: ['Ended', 'Canceled'].includes(details.status),
    } });
  }
  return getSeriesProgress(movieId);
}
