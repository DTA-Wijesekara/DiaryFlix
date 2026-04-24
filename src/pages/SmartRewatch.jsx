import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Sparkles, Star, Clock, ChevronRight, ThumbsUp, ThumbsDown } from 'lucide-react';
import { getRewatchSuggestions, getMoodInsights } from '../services/rewatchEngine';
import { getPosterUrl } from '../services/tmdb';
import MoodPicker from '../components/MoodPicker';
import './SmartRewatch.css';

export default function SmartRewatch() {
  const navigate = useNavigate();
  const [currentMood, setCurrentMood] = useState('');
  const [dismissed, setDismissed] = useState(new Set());

  const suggestions = useMemo(() => {
    return getRewatchSuggestions(currentMood || null, 20)
      .filter(s => !dismissed.has(s.id));
  }, [currentMood, dismissed]);

  const moodInsights = useMemo(() => getMoodInsights(), []);

  const handleDismiss = (id) => {
    setDismissed(prev => new Set([...prev, id]));
  };

  const moodEmoji = {
    stressed: '😰', relaxed: '😌', happy: '😊', sad: '😢',
    bored: '😐', excited: '🤩', nostalgic: '🥹', angry: '😤',
  };

  return (
    <div className="smart-rewatch fade-in" id="smart-rewatch-page">
      <div className="page-header">
        <h1>Smart Rewatch ✨</h1>
        <p>Your AI-powered guide to what to watch again tonight.</p>
      </div>

      {/* Mood Selector */}
      <div className="rewatch-mood-section glass-card-static">
        <h3>
          <Sparkles size={18} />
          How are you feeling right now?
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
          Select your mood and we'll find movies that matched it best.
        </p>
        <MoodPicker
          value={currentMood}
          onChange={setCurrentMood}
          label=""
          id="rewatch-mood-picker"
        />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 ? (
        <div className="rewatch-suggestions">
          <h3 className="rewatch-suggestions-title">
            <RefreshCw size={18} />
            {currentMood
              ? `Best rewatches for when you're ${currentMood}`
              : 'Top rewatch suggestions'}
            <span className="rewatch-count">{suggestions.length}</span>
          </h3>

          <div className="rewatch-list">
            {suggestions.map((movie, i) => (
              <div
                key={movie.id}
                className="rewatch-card glass-card slide-up"
                style={{ animationDelay: `${i * 0.06}s` }}
              >
                <div className="rewatch-card-poster" onClick={() => navigate(`/movie/${movie.id}`)}>
                  {(movie.posterUrl || movie.posterPath) ? (
                    <img
                      src={movie.posterUrl || getPosterUrl(movie.posterPath)}
                      alt={movie.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="rewatch-card-poster-ph">
                      {movie.title?.charAt(0)}
                    </div>
                  )}
                </div>

                <div className="rewatch-card-info">
                  <h4 onClick={() => navigate(`/movie/${movie.id}`)}>{movie.title}</h4>
                  <div className="rewatch-card-meta">
                    <span><Star size={13} /> {movie.rating}/10</span>
                    <span><Clock size={13} /> {movie.daysSinceWatch}d ago</span>
                    {movie.moodBefore && (
                      <span>{moodEmoji[movie.moodBefore]} {movie.moodBefore}</span>
                    )}
                    {movie.industry && (
                      <span className="chip" style={{ fontSize: '0.65rem', padding: '1px 8px' }}>
                        {movie.industry}
                      </span>
                    )}
                  </div>
                  <p className="rewatch-card-reason">{movie.reason}</p>
                  <div className="rewatch-card-score">
                    Score: <strong>{movie.rewatchScore}</strong>
                  </div>
                </div>

                <div className="rewatch-card-actions">
                  <button
                    className="btn btn-primary btn-icon rewatch-accept"
                    onClick={() => navigate(`/movie/${movie.id}`)}
                    title="Watch this!"
                  >
                    <ThumbsUp size={18} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon rewatch-dismiss"
                    onClick={() => handleDismiss(movie.id)}
                    title="Not tonight"
                  >
                    <ThumbsDown size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: '40px' }}>
          <RefreshCw size={48} />
          <h3>No rewatch suggestions yet</h3>
          <p>
            Log more movies with ratings of 7+ to get personalized rewatch recommendations.
            The more mood data you provide, the smarter the suggestions become!
          </p>
        </div>
      )}

      {/* Mood Insights */}
      {Object.keys(moodInsights).length > 0 && (
        <div className="rewatch-insights">
          <h3>
            <Sparkles size={18} />
            Your Mood Insights
          </h3>
          <div className="insights-grid">
            {Object.entries(moodInsights).map(([mood, data]) => (
              <div key={mood} className="insight-card glass-card-static">
                <div className="insight-header">
                  <span className="insight-emoji">{moodEmoji[mood]}</span>
                  <span className="insight-mood">{mood}</span>
                </div>
                <div className="insight-stats">
                  <div className="insight-stat">
                    <span className="insight-stat-value">{data.count}</span>
                    <span className="insight-stat-label">watches</span>
                  </div>
                  <div className="insight-stat">
                    <span className="insight-stat-value">⭐ {data.avgRating}</span>
                    <span className="insight-stat-label">avg rating</span>
                  </div>
                  <div className="insight-stat">
                    <span className="insight-stat-value">{data.improvementRate}%</span>
                    <span className="insight-stat-label">mood improved</span>
                  </div>
                </div>
                {data.topMovies.length > 0 && (
                  <div className="insight-top">
                    <span className="insight-top-label">Best when {mood}:</span>
                    {data.topMovies.map(m => (
                      <span key={m.id} className="insight-top-movie">{m.title} ({m.rating}/10)</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
