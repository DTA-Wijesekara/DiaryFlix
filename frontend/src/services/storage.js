// CineLog — Storage service (hybrid).
// The backend is the source of truth; localStorage is a synchronous cache for UI reads.

import { getCurrentUserId, apiFetch, getToken } from './auth';

function getKeys() {
  const uid = getCurrentUserId() || 'anonymous';
  return {
    WATCH_LOG: `cinelog_watch_log_${uid}`,
    USER_PROFILE: `cinelog_user_profile_${uid}`,
    TMDB_CACHE: 'cinelog_tmdb_cache',
  };
}

// ---- Sync with server ----

export async function fetchLogsFromServer() {
  if (!getToken()) return [];
  try {
    const logs = await apiFetch('/logs');
    saveLogs(logs);
    updateProfileStats(logs);
    return logs;
  } catch (e) {
    console.error('Failed to fetch logs from server:', e.message);
    return getAllLogs(); // cache fallback
  }
}

// ---- Watch Log CRUD ----

export function getAllLogs() {
  try {
    const data = localStorage.getItem(getKeys().WATCH_LOG);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getLogById(id) {
  return getAllLogs().find(log => log.id === id) || null;
}

export async function addLog(entry) {
  const created = await apiFetch('/logs', { method: 'POST', body: entry });
  const logs = getAllLogs();
  logs.unshift(created);
  saveLogs(logs);
  updateProfileStats(logs);
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
  return saved;
}

export async function deleteLog(id) {
  await apiFetch(`/logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const logs = getAllLogs().filter(log => log.id !== id);
  saveLogs(logs);
  updateProfileStats(logs);
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
  const totalRewatches = logs.reduce((sum, l) => sum + (l.rewatchCount || 0), 0);
  const avgRating = logs.length > 0
    ? (logs.reduce((sum, l) => sum + (l.rating || 0), 0) / logs.length).toFixed(1)
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
    totalRuntime += (l.runtime || 0);
    if (l.dateWatched) {
      const d = new Date(l.dateWatched);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (Object.prototype.hasOwnProperty.call(byMonth, key)) {
        byMonth[key]++;
        hoursByMonth[key] += parseFloat(((l.runtime || 0) / 60).toFixed(2));
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
    totalWatched, totalRewatches, avgRating,
    byIndustry, byMood, byMonth, hoursByMonth,
    totalHoursWatched, avgHoursPerDay,
    ratingDist, topRated, topActors, topDirectors,
    maxStreak, moodAvgRating,
  };
}

// ---- User Profile (local cache only) ----

export function getProfile() {
  try {
    const data = localStorage.getItem(getKeys().USER_PROFILE);
    return data ? JSON.parse(data) : { displayName: 'Cinephile', joinedAt: new Date().toISOString() };
  } catch {
    return { displayName: 'Cinephile', joinedAt: new Date().toISOString() };
  }
}

export function updateProfile(updates) {
  const profile = getProfile();
  const updated = { ...profile, ...updates };
  localStorage.setItem(getKeys().USER_PROFILE, JSON.stringify(updated));
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

// ---- Import / Export ----

export function exportToJSON() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    logs: getAllLogs(),
    profile: getProfile(),
  }, null, 2);
}

export function importFromCSV(/* csvText */) {
  // Placeholder: CSV import would POST each parsed row to /api/logs.
  return [];
}

// ---- Helpers ----

function saveLogs(logs) {
  localStorage.setItem(getKeys().WATCH_LOG, JSON.stringify(logs));
}

function updateProfileStats(logs) {
  const profile = getProfile();
  profile.totalWatched = logs.length;
  localStorage.setItem(getKeys().USER_PROFILE, JSON.stringify(profile));
}
