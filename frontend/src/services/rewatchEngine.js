// CineLog — Smart Rewatch Engine
// Scores each movie based on mood correlation, time decay, rating, and rewatch history

import { getAllLogs } from './storage';

const MOOD_WEIGHTS = {
  stressed: { genres: ['comedy', 'romance', 'animation', 'family'], weight: 1.5 },
  relaxed: { genres: ['drama', 'thriller', 'mystery', 'documentary'], weight: 1.2 },
  happy: { genres: ['action', 'adventure', 'comedy', 'musical'], weight: 1.3 },
  sad: { genres: ['romance', 'drama', 'animation'], weight: 1.4 },
  bored: { genres: ['action', 'thriller', 'horror', 'sci-fi'], weight: 1.5 },
  excited: { genres: ['action', 'adventure', 'sci-fi', 'fantasy'], weight: 1.3 },
  nostalgic: { genres: ['romance', 'drama', 'family', 'musical'], weight: 1.6 },
  angry: { genres: ['action', 'thriller', 'comedy'], weight: 1.3 },
};

/**
 * Get rewatch suggestions based on current mood and user history
 * @param {string} currentMood - User's current mood
 * @param {number} limit - Number of suggestions to return
 * @returns {Array} Scored and sorted movie suggestions
 */
export function getRewatchSuggestions(currentMood = null, limit = 10) {
  const logs = getAllLogs();
  if (logs.length === 0) return [];

  const now = new Date();
  const scored = logs
    .filter(log => log.rating >= 7) // Only suggest movies rated 7+
    .map(log => {
      let score = 0;

      // 1. Base score from rating (0-10 points)
      score += (log.rating || 5) * 1;

      // 2. Time decay — older watches get boosted (0-15 points)
      const watched = new Date(log.dateWatched || log.createdAt);
      const daysSince = Math.max(1, (now - watched) / (1000 * 60 * 60 * 24));
      if (daysSince > 180) score += 15;       // 6+ months ago
      else if (daysSince > 90) score += 10;   // 3-6 months ago
      else if (daysSince > 30) score += 5;    // 1-3 months ago
      else score += 1;                         // Recently watched — don't suggest yet

      // 3. Rewatch penalty — already rewatched a lot? Lower score
      const rewatches = log.rewatchCount || 0;
      score -= rewatches * 3;

      // 4. Mood correlation (0-20 points)
      if (currentMood && log.moodBefore) {
        // If user watched this movie in the same mood and rated it highly
        if (log.moodBefore === currentMood && log.rating >= 8) {
          score += 20;
        }
        // If the mood is similar to what they felt when they watched it
        else if (log.moodBefore === currentMood) {
          score += 12;
        }
        // Check if the mood change was positive (moodAfter better than moodBefore)
        if (log.moodAfter && isMoodImprovement(log.moodBefore, log.moodAfter)) {
          score += 8;
        }
      }

      // 5. Category/genre match with mood preferences
      if (currentMood && MOOD_WEIGHTS[currentMood]) {
        const preferredGenres = MOOD_WEIGHTS[currentMood].genres;
        const weight = MOOD_WEIGHTS[currentMood].weight;
        const logCategory = (log.category || '').toLowerCase();
        const logGenres = (log.genres || []).map(g => g.toLowerCase());
        
        const allGenres = [...logGenres, logCategory];
        const matchCount = allGenres.filter(g => 
          preferredGenres.some(pg => g.includes(pg))
        ).length;
        score += matchCount * 3 * weight;
      }

      // 6. Day-of-week pattern bonus
      const watchDay = new Date(log.dateWatched || log.createdAt).getDay();
      const todayDay = now.getDay();
      if (watchDay === todayDay) score += 3; // Watched on same day of week

      // 7. Has favourite songs/quotes — more memorable
      if (log.favouriteSongs?.length > 0) score += 2;
      if (log.favouriteQuotes?.length > 0) score += 2;

      // 8. Anniversary bonus — watched around this time of year
      const watchMonth = new Date(log.dateWatched || log.createdAt).getMonth();
      const nowMonth = now.getMonth();
      if (watchMonth === nowMonth) score += 5;

      return {
        ...log,
        rewatchScore: Math.max(0, Math.round(score * 10) / 10),
        daysSinceWatch: Math.round(daysSince),
        reason: generateReason(log, currentMood, daysSince),
      };
    })
    .sort((a, b) => b.rewatchScore - a.rewatchScore)
    .slice(0, limit);

  return scored;
}

/**
 * Generate a human-readable reason for the suggestion
 */
function generateReason(log, currentMood, daysSince) {
  const reasons = [];

  if (currentMood && log.moodBefore === currentMood && log.rating >= 8) {
    reasons.push(`You loved this when you were ${currentMood} — rated it ${log.rating}/10`);
  }

  if (daysSince > 365) {
    const years = Math.floor(daysSince / 365);
    reasons.push(`It's been ${years} year${years > 1 ? 's' : ''} since you watched this`);
  } else if (daysSince > 180) {
    reasons.push(`You watched this ${Math.floor(daysSince / 30)} months ago — time for a rewatch!`);
  }

  if (log.moodAfter && isMoodImprovement(log.moodBefore, log.moodAfter)) {
    reasons.push(`This movie improved your mood from ${log.moodBefore} to ${log.moodAfter}`);
  }

  if (log.rating === 10) {
    reasons.push('Your perfect 10/10 — a masterpiece worth revisiting');
  }

  if ((log.rewatchCount || 0) === 0) {
    reasons.push('You haven\'t rewatched this yet');
  }

  // Anniversary
  const watchDate = new Date(log.dateWatched || log.createdAt);
  const now = new Date();
  if (watchDate.getMonth() === now.getMonth() && watchDate.getDate() === now.getDate()) {
    const yearsAgo = now.getFullYear() - watchDate.getFullYear();
    if (yearsAgo > 0) {
      reasons.push(`🎂 You watched this exactly ${yearsAgo} year${yearsAgo > 1 ? 's' : ''} ago today!`);
    }
  }

  return reasons.length > 0 ? reasons[0] : `Rated ${log.rating}/10 — a great rewatch candidate`;
}

/**
 * Check if mood improved from before to after
 */
function isMoodImprovement(before, after) {
  const moodScale = {
    angry: 1,
    stressed: 2,
    sad: 3,
    bored: 4,
    nostalgic: 5,
    relaxed: 6,
    happy: 7,
    excited: 8,
  };
  return (moodScale[after] || 5) > (moodScale[before] || 5);
}

/**
 * Get mood-based insights
 */
export function getMoodInsights() {
  const logs = getAllLogs();
  const insights = {};

  // For each mood, find the best movies
  const moods = ['stressed', 'relaxed', 'happy', 'sad', 'bored', 'excited', 'nostalgic', 'angry'];
  
  moods.forEach(mood => {
    const moodLogs = logs.filter(l => l.moodBefore === mood);
    if (moodLogs.length === 0) return;

    const topForMood = [...moodLogs]
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 3);

    const avgRating = (moodLogs.reduce((s, l) => s + (l.rating || 0), 0) / moodLogs.length).toFixed(1);
    
    const moodImprovements = moodLogs.filter(l => l.moodAfter && isMoodImprovement(mood, l.moodAfter));

    insights[mood] = {
      count: moodLogs.length,
      avgRating,
      topMovies: topForMood,
      improvementRate: moodLogs.length > 0 
        ? Math.round((moodImprovements.length / moodLogs.length) * 100) 
        : 0,
    };
  });

  return insights;
}

/**
 * Get anniversary watches — movies watched on this day in previous years
 */
export function getAnniversaryWatches() {
  const logs = getAllLogs();
  const now = new Date();
  const today = { month: now.getMonth(), day: now.getDate() };

  return logs.filter(log => {
    const d = new Date(log.dateWatched || log.createdAt);
    return d.getMonth() === today.month && 
           d.getDate() === today.day && 
           d.getFullYear() < now.getFullYear();
  }).map(log => ({
    ...log,
    yearsAgo: now.getFullYear() - new Date(log.dateWatched || log.createdAt).getFullYear(),
  }));
}
