// CineLog — TMDB API Service (Free, no cost)
// https://developer.themoviedb.org/docs

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

// Using a global environment variable first, falling back to local storage
let API_KEY = import.meta.env.VITE_TMDB_API_KEY || localStorage.getItem('cinelog_tmdb_key') || '';

export function setTMDBKey(key) {
  API_KEY = key;
  if (!import.meta.env.VITE_TMDB_API_KEY) {
    localStorage.setItem('cinelog_tmdb_key', key);
  }
}

export function getTMDBKey() {
  return API_KEY;
}

export function hasTMDBKey() {
  return !!API_KEY;
}

export function isGlobalKey() {
  return !!import.meta.env.VITE_TMDB_API_KEY;
}

// ---- Search ----

export async function searchMovies(query, page = 1) {
  if (!API_KEY || !query.trim()) return { results: [], totalPages: 0 };
  
  try {
    const res = await fetch(
      `${TMDB_BASE}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`
    );
    if (!res.ok) throw new Error('TMDB search failed');
    const data = await res.json();
    
    return {
      results: data.results
        .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
        .map(r => ({
          tmdbId: r.id,
          title: r.title || r.name,
          originalTitle: r.original_title || r.original_name,
          type: r.media_type === 'movie' ? 'movie' : 'tv_series',
          year: (r.release_date || r.first_air_date || '').slice(0, 4),
          posterPath: r.poster_path,
          backdropPath: r.backdrop_path,
          overview: r.overview,
          rating: r.vote_average,
          language: r.original_language,
        })),
      totalPages: data.total_pages,
    };
  } catch (err) {
    console.error('TMDB search error:', err);
    return { results: [], totalPages: 0 };
  }
}

// ---- Movie Details ----

export async function getMovieDetails(tmdbId, type = 'movie') {
  if (!API_KEY) return null;
  
  try {
    const endpoint = type === 'tv_series' ? 'tv' : 'movie';
    const res = await fetch(
      `${TMDB_BASE}/${endpoint}/${tmdbId}?api_key=${API_KEY}&append_to_response=credits`
    );
    if (!res.ok) throw new Error('TMDB details failed');
    const d = await res.json();

    const cast = d.credits?.cast || [];
    const crew = d.credits?.crew || [];
    const director = crew.find(c => c.job === 'Director');

    return {
      tmdbId: d.id,
      title: d.title || d.name,
      originalTitle: d.original_title || d.original_name,
      type: type,
      year: (d.release_date || d.first_air_date || '').slice(0, 4),
      posterPath: d.poster_path,
      backdropPath: d.backdrop_path,
      overview: d.overview,
      tmdbRating: d.vote_average,
      runtime: d.runtime || (d.episode_run_time?.[0]) || 0,
      genres: (d.genres || []).map(g => g.name),
      language: d.original_language,
      actors: cast.filter(c => c.gender === 2).slice(0, 5).map(c => c.name),
      actresses: cast.filter(c => c.gender === 1).slice(0, 5).map(c => c.name),
      director: director?.name || '',
      productionCountries: (d.production_countries || []).map(c => c.name),
    };
  } catch (err) {
    console.error('TMDB details error:', err);
    return null;
  }
}

// ---- Image URLs ----

export function getPosterUrl(path, size = 'w342') {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getBackdropUrl(path, size = 'w1280') {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

// ---- Detect Industry from language/country ----

export function detectIndustry(details) {
  if (!details) return 'other';
  
  const lang = details.language?.toLowerCase();
  const countries = (details.productionCountries || []).map(c => c.toLowerCase());
  
  if (lang === 'te') return 'tollywood';
  if (lang === 'ta') return 'kollywood';
  if (lang === 'hi') return 'bollywood';
  if (lang === 'ml') return 'mollywood';
  if (lang === 'kn') return 'sandalwood';
  if (lang === 'en' && countries.some(c => c.includes('united states') || c.includes('united kingdom'))) return 'hollywood';
  if (lang === 'en') return 'hollywood';
  if (lang === 'si') return 'sinhala';
  
  return 'other';
}
