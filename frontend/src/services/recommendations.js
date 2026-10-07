// DiaryFLIX — Recommendations service.
// Read-only: the recommendation graph is built and served by the backend.

import { apiFetch, getToken } from './auth';

export async function fetchRecommendations() {
  if (!getToken()) return { recommendations: [], fallback: false, stats: null };
  try {
    return await apiFetch('/recommendations');
  } catch (e) {
    console.error('Failed to fetch recommendations:', e.message);
    return { recommendations: [], fallback: false, stats: null };
  }
}

export async function fetchSimilarMovies({ tmdbId, title, type = 'movie', year = '' }) {
  if (!getToken()) return [];
  let params = tmdbId
    ? `tmdbId=${encodeURIComponent(tmdbId)}`
    : `title=${encodeURIComponent(title || '')}`;
  params += `&type=${encodeURIComponent(type)}&year=${encodeURIComponent(year)}`;
  try {
    const data = await apiFetch(`/recommendations/similar?${params}`);
    return data.similar || [];
  } catch (e) {
    console.error('Failed to fetch similar movies:', e.message);
    return [];
  }
}
