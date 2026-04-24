// CineLog — Storage Service (Hybrid)
// Uses API for persistence, localStorage for synchronous reads in UI

import { getCurrentUserId, getToken } from './auth';

const API_URL = 'http://localhost:5000/api';

function getKeys() {
  const uid = getCurrentUserId() || 'anonymous';
  return {
    WATCH_LOG: `cinelog_watch_log_${uid}`,
    USER_PROFILE: `cinelog_user_profile_${uid}`,
    TMDB_CACHE: 'cinelog_tmdb_cache', // shared across users
  };
}

// ---- Backend Sync ----

export async function fetchLogsFromServer() {
    const token = getToken();
    if (!token) return [];
    
    try {
        const res = await fetch(`${API_URL}/logs`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const logs = await res.json();
            saveLogs(logs);
            updateProfileStats(logs);
            return logs;
        }
    } catch (e) {
        console.error("Failed to fetch logs from server", e);
    }
    return getAllLogs(); // fallback to local cache
}

// ---- Watch Log CRUD ----

// Synchronous read from local cache
export function getAllLogs() {
  try {
    const data = localStorage.getItem(getKeys().WATCH_LOG);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getLogById(id) {
  const logs = getAllLogs();
  return logs.find(log => log.id === id) || null;
}

export async function addLog(entry) {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${API_URL}/logs`, {
      method: 'POST',
      headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(entry)
  });
  
  if (!res.ok) throw new Error("Failed to add log");
  const newEntry = await res.json();
  
  const logs = getAllLogs();
  logs.unshift(newEntry);
  saveLogs(logs);
  updateProfileStats(logs);
  return newEntry;
}

export async function updateLog(id, updates) {
  // Not fully implemented in backend yet, but we'll mock the local update for now
  // Ideally, you'd have a PUT /api/logs/:id endpoint
  const logs = getAllLogs();
  const index = logs.findIndex(log => log.id === id);
  if (index === -1) return null;
  
  logs[index] = {
    ...logs[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveLogs(logs);
  updateProfileStats(logs);
  return logs[index];
}

export async function deleteLog(id) {
  const token = getToken();
  if (token) {
      await fetch(`${API_URL}/logs/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
      });
  }

  let logs = getAllLogs();
  logs = logs.filter(log => log.id !== id);
  saveLogs(logs);
  updateProfileStats(logs);
}

export async function incrementRewatch(id) {
  const token = getToken();
  if (token) {
      await fetch(`${API_URL}/logs/${id}/rewatch`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${token}` }
      });
  }

  const logs = getAllLogs();
  const index = logs.findIndex(log => log.id === id);
  if (index === -1) return null;
  
  logs[index].rewatchCount = (logs[index].rewatchCount || 0) + 1;
  logs[index].lastRewatched = new Date().toISOString();
  logs[index].updatedAt = new Date().toISOString();
  saveLogs(logs);
  return logs[index];
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

  // By industry
  const byIndustry = {};
  logs.forEach(l => {
    const ind = l.industry || 'other';
    byIndustry[ind] = (byIndustry[ind] || 0) + 1;
  });

  // By mood
  const byMood = {};
  logs.forEach(l => {
    const mood = l.moodBefore || 'unknown';
    byMood[mood] = (byMood[mood] || 0) + 1;
  });

  // By month (last 12 months)
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
      if (byMonth.hasOwnProperty(key)) {
        byMonth[key]++;
        hoursByMonth[key] += parseFloat(((l.runtime || 0) / 60).toFixed(2));
      }
    }
  });

  const totalHoursWatched = (totalRuntime / 60).toFixed(1);

  let avgHoursPerDay = '0.0';
  if (logs.length > 0) {
    const dates = logs.map(l => new Date(l.dateWatched || l.createdAt || new Date())).filter(d => !isNaN(d));
    if (dates.length > 0) {
      const earliest = new Date(Math.min(...dates));
      const latest = new Date();
      const diffDays = Math.max(1, Math.ceil((latest - earliest) / (1000 * 60 * 60 * 24)));
      avgHoursPerDay = (totalRuntime / 60 / diffDays).toFixed(1);
    }
  }

  // Rating distribution
  const ratingDist = {};
  for (let i = 1; i <= 10; i++) ratingDist[i] = 0;
  logs.forEach(l => {
    if (l.rating >= 1 && l.rating <= 10) {
      ratingDist[l.rating]++;
    }
  });

  // Top rated
  const topRated = [...logs]
    .filter(l => l.rating)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5);

  // Top actors/actresses
  const actorCounts = {};
  logs.forEach(l => {
    [...(l.actors || []), ...(l.actresses || [])].forEach(name => {
      const n = name.trim();
      if (n) actorCounts[n] = (actorCounts[n] || 0) + 1;
    });
  });
  const topActors = Object.entries(actorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Most watched directors
  const dirCounts = {};
  logs.forEach(l => {
    if (l.director?.trim()) {
      dirCounts[l.director.trim()] = (dirCounts[l.director.trim()] || 0) + 1;
    }
  });
  const topDirectors = Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Watch streak (consecutive days)
  const watchDates = [...new Set(logs.map(l => l.dateWatched).filter(Boolean))].sort();
  let maxStreak = 0, currentStreak = 0;
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

  // Mood-to-rating correlation
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
    totalWatched,
    totalRewatches,
    avgRating,
    byIndustry,
    byMood,
    byMonth,
    hoursByMonth,
    totalHoursWatched,
    avgHoursPerDay,
    ratingDist,
    topRated,
    topActors,
    topDirectors,
    maxStreak,
    moodAvgRating,
  };
}

// ---- User Profile ----

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
    // silently fail
  }
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

export function importFromCSV(csvText) { return []; }
export function exportToJSON() { return "{}"; }
