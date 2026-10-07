import { dataCache } from './dataCache';
// CineLog — Storage service.
// The backend is the source of truth; an in-memory cache provides synchronous UI reads.

import { getCurrentUserId, apiFetch, apiFetchAll, getToken } from './auth';

function getKeys() {
  const uid = getCurrentUserId() || 'anonymous';
  return {
    WATCH_LOG: `cinelog_watch_log_${uid}`,
    USER_PROFILE: `cinelog_user_profile_${uid}`,
    TMDB_CACHE: 'cinelog_tmdb_cache',
  };
}

// ---- Sync with server ----

export async function fetchLogsFromServer({ strict = false } = {}) {
  if (!getToken()) return [];
  try {
    const owner = getCurrentUserId();
    const logs = await apiFetchAll('/logs');
    if (owner !== getCurrentUserId()) return [];
    saveLogs(logs);
    updateProfileStats(logs);
    return logs;
  } catch (e) {
    window.dispatchEvent(new CustomEvent('cinelog:sync-error', { detail: e.message }));
    if (strict) throw e;
    console.error('Failed to fetch logs from server:', e.message);
    return getAllLogs(); // cache fallback
  }
}

// ---- Watch Log CRUD ----

export function getAllLogs() {
  try {
    const data = dataCache.getItem(getKeys().WATCH_LOG);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getLogById(id) {
  return getAllLogs().find(log => log.id === id) || null;
}

export async function setTitleFavourite(movieId, isFavourite) {
  const owner = getCurrentUserId();
  const saved = await apiFetch(`/logs/titles/${encodeURIComponent(movieId)}/favourite`, { method: 'PATCH', body: { isFavourite } });
  if (owner === getCurrentUserId()) saveLogs(getAllLogs().map(log => log.movieId === movieId ? { ...log, isFavourite: saved.isFavourite } : log));
  return saved;
}

export async function addLog(entry) {
  const created = await apiFetch('/logs', { method: 'POST', body: entry });
  const logs = getAllLogs();
  logs.unshift(created);
  saveLogs(logs);
  updateProfileStats(logs);
  await fetchLogsFromServer();
  return created;
}

export async function updateLog(id, updates) {
  // Merge with existing cached record, then PUT the whole thing.
  const current = getLogById(id);
  if (!current) throw new Error('Log not found in local cache');
  const merged = { ...current, ...updates };

  const saved = await apiFetch(`/logs/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: merged,
  });

  const logs = getAllLogs();
  const idx = logs.findIndex(l => l.id === id);
  if (idx !== -1) logs[idx] = saved;
  saveLogs(logs);
  updateProfileStats(logs);
  await fetchLogsFromServer();
  return saved;
}

export async function deleteLog(id) {
  await apiFetch(`/logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const logs = getAllLogs().filter(log => log.id !== id);
  saveLogs(logs);
  updateProfileStats(logs);
  await fetchLogsFromServer();
}

// ---- Filtering ----

export function getLogsByIndustry(industry) {
  if (!industry || industry === 'all') return getAllLogs();
  return getAllLogs().filter(log => log.industry === industry);
}

export function getLogsByMood(mood) {
  return getAllLogs().filter(log => log.moodBefore === mood);
}

export function searchLogs(query) {
  const q = query.toLowerCase();
  return getAllLogs().filter(log =>
    log.title?.toLowerCase().includes(q) ||
    log.notes?.toLowerCase().includes(q) ||
    log.actors?.some(a => a.toLowerCase().includes(q)) ||
    log.actresses?.some(a => a.toLowerCase().includes(q)) ||
    log.director?.toLowerCase().includes(q) ||
    log.category?.toLowerCase().includes(q)
  );
}

// ---- Statistics ----

export function getStats() {
  const logs = getAllLogs();

  const totalWatched = logs.length;
  const films = logs.filter(l => l.type !== 'tv_series');
  const totalRewatches = films.length - new Set(films.map(l => l.movieId || l.id)).size;
  const totalEpisodes = logs.filter(l => l.episodeId).length;
  const minutes = l => l.watchedMinutes ?? (l.type === 'tv_series' ? 0 : l.runtime || 0);
  const rated = logs.filter(l => l.rating > 0);
  const avgRating = rated.length > 0
    ? (rated.reduce((sum, l) => sum + l.rating, 0) / rated.length).toFixed(1)
    : 0;

  const byIndustry = {};
  logs.forEach(l => {
    const ind = l.industry || 'other';
    byIndustry[ind] = (byIndustry[ind] || 0) + 1;
  });

  const byMood = {};
  logs.forEach(l => {
    const mood = l.moodBefore || 'unknown';
    byMood[mood] = (byMood[mood] || 0) + 1;
  });

  const byMonth = {};
  const hoursByMonth = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = 0;
    hoursByMonth[key] = 0;
  }
  let totalRuntime = 0;
  logs.forEach(l => {
    totalRuntime += minutes(l);
    if (l.dateWatched) {
      const d = new Date(l.dateWatched);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (Object.prototype.hasOwnProperty.call(byMonth, key)) {
        byMonth[key]++;
        hoursByMonth[key] += parseFloat((minutes(l) / 60).toFixed(2));
      }
    }
  });

  const totalHoursWatched = (totalRuntime / 60).toFixed(1);

  let avgHoursPerDay = '0.0';
  if (logs.length > 0) {
    const dates = logs.map(l => new Date(l.dateWatched || l.createdAt || new Date())).filter(d => !Number.isNaN(d.getTime()));
    if (dates.length > 0) {
      const earliest = new Date(Math.min(...dates));
      const latest = new Date();
      const diffDays = Math.max(1, Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24)));
      avgHoursPerDay = (totalRuntime / 60 / diffDays).toFixed(1);
    }
  }

  const ratingDist = {};
  for (let i = 1; i <= 10; i++) ratingDist[i] = 0;
  logs.forEach(l => {
    if (l.rating >= 1 && l.rating <= 10) ratingDist[l.rating]++;
  });

  const topRated = [...logs]
    .filter(l => l.rating)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);

  const actorCounts = {};
  logs.forEach(l => {
    [...(l.actors || []), ...(l.actresses || [])].forEach(name => {
      const n = (name || '').trim();
      if (n) actorCounts[n] = (actorCounts[n] || 0) + 1;
    });
  });
  const topActors = Object.entries(actorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const dirCounts = {};
  logs.forEach(l => {
    if (l.director?.trim()) {
      dirCounts[l.director.trim()] = (dirCounts[l.director.trim()] || 0) + 1;
    }
  });
  const topDirectors = Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const watchDates = [...new Set(logs.map(l => l.dateWatched).filter(Boolean))].sort();
  let maxStreak = 0;
  let currentStreak = 0;
  for (let i = 0; i < watchDates.length; i++) {
    if (i === 0) { currentStreak = 1; }
    else {
      const prev = new Date(watchDates[i - 1]);
      const curr = new Date(watchDates[i]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
      currentStreak = diff === 1 ? currentStreak + 1 : 1;
    }
    maxStreak = Math.max(maxStreak, currentStreak);
  }

  const moodRatings = {};
  logs.forEach(l => {
    if (l.moodBefore && l.rating) {
      if (!moodRatings[l.moodBefore]) moodRatings[l.moodBefore] = [];
      moodRatings[l.moodBefore].push(l.rating);
    }
  });
  const moodAvgRating = {};
  Object.entries(moodRatings).forEach(([mood, ratings]) => {
    moodAvgRating[mood] = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
  });

  return {
    totalWatched, totalRewatches, totalEpisodes, totalFilms: films.length, unknownDuration: logs.filter(l => !minutes(l)).length, avgRating,
    byIndustry, byMood, byMonth, hoursByMonth,
    totalHoursWatched, avgHoursPerDay,
    ratingDist, topRated, topActors, topDirectors,
    maxStreak, moodAvgRating,
  };
}

// ---- User Profile (local cache only) ----

export function getProfile() {
  try {
    const data = dataCache.getItem(getKeys().USER_PROFILE);
    return data ? JSON.parse(data) : { displayName: 'Cinephile', joinedAt: new Date().toISOString() };
  } catch {
    return { displayName: 'Cinephile', joinedAt: new Date().toISOString() };
  }
}

export function updateProfile(updates) {
  const profile = getProfile();
  const updated = { ...profile, ...updates };
  dataCache.setItem(getKeys().USER_PROFILE, JSON.stringify(updated));
  return updated;
}

// ---- TMDB Cache ----

export function getCachedTMDB(tmdbId) {
  try {
    const cache = JSON.parse(localStorage.getItem(getKeys().TMDB_CACHE) || '{}');
    return cache[tmdbId] || null;
  } catch {
    return null;
  }
}

export function cacheTMDB(tmdbId, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(getKeys().TMDB_CACHE) || '{}');
    cache[tmdbId] = { ...data, cachedAt: Date.now() };
    const cacheStr = JSON.stringify(cache);
    if (cacheStr.length < 5 * 1024 * 1024) {
      localStorage.setItem(getKeys().TMDB_CACHE, cacheStr);
    }
  } catch {
    // noop
  }
}

// ---- Export ----

// Build a spreadsheet of all logs as CSV. CSV opens natively in Excel,
// Google Sheets, and Numbers.
export function exportToCSV() {
  const columns = [
    ['Title',        l => l.title],
    ['Favourite', l => l.isFavourite ? 'Yes' : 'No'],
    ['Year',         l => l.year],
    ['Type',         l => l.type],
    ['Entry type', l => l.entryType || (l.type === 'tv_series' ? 'series' : 'film')],
    ['Season', l => l.seasonNumber],
    ['Episode', l => l.episodeNumber],
    ['Episode title', l => l.episodeTitle],
    ['Watched minutes', l => l.watchedMinutes],
    ['Industry',     l => l.industry],
    ['Rating',       l => l.rating],
    ['Date Watched', l => l.dateWatched],
    ['Mood Before',  l => l.moodBefore],
    ['Mood After',   l => l.moodAfter],
    ['Platform',     l => l.platform],
    ['Director',     l => l.director],
    ['Rewatches',    l => l.rewatchCount],
    ['Notes',        l => l.notes],
  ];

  const escape = (val) => {
    let s = val == null ? '' : String(val);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = columns.map(c => c[0]).join(',');
  const rows = getAllLogs().map(l => columns.map(c => escape(c[1](l))).join(','));
  return [header, ...rows].join('\r\n');
}

// ---- Helpers ----

function saveLogs(logs) {
  dataCache.setItem(getKeys().WATCH_LOG, JSON.stringify(logs));
  window.dispatchEvent(new CustomEvent('cinelog:logs-changed'));
}

function updateProfileStats(logs) {
  const profile = getProfile();
  profile.totalWatched = logs.length;
  dataCache.setItem(getKeys().USER_PROFILE, JSON.stringify(profile));
}
