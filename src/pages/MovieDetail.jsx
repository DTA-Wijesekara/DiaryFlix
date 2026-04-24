import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Star, Clock, Calendar, Film, Tv, MapPin,
  Users, RefreshCw, Edit3, Trash2, Music, Quote, ExternalLink
} from 'lucide-react';
import { getLogById, deleteLog, incrementRewatch } from '../services/storage';
import { getPosterUrl, getBackdropUrl } from '../services/tmdb';
import StarRating from '../components/StarRating';
import Toast from '../components/Toast';
import './MovieDetail.css';

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [log, setLog] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const data = getLogById(id);
    if (!data) {
      navigate('/library');
      return;
    }
    setLog(data);
  }, [id, navigate]);

  if (!log) return null;

  const moodEmoji = {
    stressed: '😰', relaxed: '😌', happy: '😊', sad: '😢',
    bored: '😐', excited: '🤩', nostalgic: '🥹', angry: '😤',
  };

  const industryColor = {
    bollywood: 'var(--industry-bollywood)',
    tollywood: 'var(--industry-tollywood)',
    kollywood: 'var(--industry-kollywood)',
    mollywood: 'var(--industry-mollywood)',
    hollywood: 'var(--industry-hollywood)',
    sandalwood: 'var(--industry-sandalwood)',
    sinhala: 'var(--industry-sinhala)',
  }[log.industry] || 'var(--industry-other)';

  const handleRewatch = () => {
    const updated = incrementRewatch(log.id);
    setLog(updated);
    setToast({ message: `Rewatch #${updated.rewatchCount} logged! 🔁`, type: 'success' });
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${log.title}" from your diary?`)) {
      deleteLog(log.id);
      navigate('/library');
    }
  };

  const backdropSrc = log.backdropPath ? getBackdropUrl(log.backdropPath) : null;
  const posterSrc = log.posterUrl || (log.posterPath ? getPosterUrl(log.posterPath) : null);

  return (
    <div className="movie-detail fade-in" id="movie-detail-page">
      {/* Backdrop */}
      {backdropSrc && (
        <div className="detail-backdrop">
          <img src={backdropSrc} alt="" className="detail-backdrop-img" />
          <div className="detail-backdrop-overlay" />
        </div>
      )}

      {/* Top Bar */}
      <div className="detail-topbar">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> Back
        </button>
        <div className="detail-topbar-actions">
          <button className="btn btn-secondary" onClick={handleRewatch}>
            <RefreshCw size={16} /> Watch Again
          </button>
          <button className="btn btn-ghost btn-icon" onClick={handleDelete} title="Delete">
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="detail-hero">
        {posterSrc && (
          <img src={posterSrc} alt={log.title} className="detail-poster" />
        )}
        <div className="detail-hero-info">
          <div className="detail-industry-badge" style={{ color: industryColor, borderColor: industryColor }}>
            {log.industry || 'Other'}
          </div>
          <h1 className="detail-title">{log.title}</h1>
          <div className="detail-meta">
            {log.year && <span>{log.year}</span>}
            {log.type && (
              <span className="detail-type">
                {log.type === 'tv_series' ? <><Tv size={14} /> TV Series</> : <><Film size={14} /> Movie</>}
              </span>
            )}
            {log.runtime > 0 && <span>{log.runtime} min</span>}
            {log.director && <span>Dir: {log.director}</span>}
          </div>

          <div className="detail-rating-row">
            <StarRating value={log.rating} readonly size={20} />
          </div>

          {log.overview && (
            <p className="detail-overview">{log.overview}</p>
          )}

          {(log.genres?.length > 0) && (
            <div className="detail-genres">
              {log.genres.map(g => <span key={g} className="chip">{g}</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="detail-grid">
        {/* Watch Info */}
        <div className="detail-section glass-card-static">
          <h3><Calendar size={16} /> Watch Info</h3>
          <div className="detail-info-list">
            <div className="detail-info-row">
              <span>Date Watched</span>
              <strong>
                {log.dateWatched
                  ? new Date(log.dateWatched).toLocaleDateString('en-US', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })
                  : 'Unknown'}
              </strong>
            </div>
            {log.platform && (
              <div className="detail-info-row">
                <span>Platform</span><strong>{log.platform}</strong>
              </div>
            )}
            {log.watchedWith && (
              <div className="detail-info-row">
                <span>Watched With</span>
                <strong style={{ textTransform: 'capitalize' }}>{log.watchedWith}</strong>
              </div>
            )}
            {log.occasion && (
              <div className="detail-info-row">
                <span>Occasion</span><strong>{log.occasion}</strong>
              </div>
            )}
            {log.category && (
              <div className="detail-info-row">
                <span>Category</span><strong style={{ textTransform: 'capitalize' }}>{log.category}</strong>
              </div>
            )}
            <div className="detail-info-row">
              <span>Rewatched</span><strong>{log.rewatchCount || 0} times</strong>
            </div>
          </div>
        </div>

        {/* Mood */}
        <div className="detail-section glass-card-static">
          <h3>🎭 Mood Journey</h3>
          <div className="detail-mood-journey">
            {log.moodBefore && (
              <div className="detail-mood-card">
                <span className="detail-mood-label">Before</span>
                <span className="detail-mood-emoji">{moodEmoji[log.moodBefore] || '🎭'}</span>
                <span className="detail-mood-name">{log.moodBefore}</span>
              </div>
            )}
            {log.moodBefore && log.moodAfter && (
              <div className="detail-mood-arrow">→</div>
            )}
            {log.moodAfter && (
              <div className="detail-mood-card">
                <span className="detail-mood-label">After</span>
                <span className="detail-mood-emoji">{moodEmoji[log.moodAfter] || '🎭'}</span>
                <span className="detail-mood-name">{log.moodAfter}</span>
              </div>
            )}
            {!log.moodBefore && !log.moodAfter && (
              <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No mood recorded</p>
            )}
          </div>
        </div>

        {/* Cast */}
        {(log.actors?.length > 0 || log.actresses?.length > 0) && (
          <div className="detail-section glass-card-static">
            <h3><Users size={16} /> Cast</h3>
            <div className="detail-cast">
              {[...(log.actors || []), ...(log.actresses || [])].filter(Boolean).map((name, i) => (
                <span key={i} className="chip">{name}</span>
              ))}
            </div>
          </div>
        )}

        {/* Favourite Songs */}
        {log.favouriteSongs?.length > 0 && (
          <div className="detail-section glass-card-static">
            <h3><Music size={16} /> Favourite Songs</h3>
            <div className="detail-songs">
              {log.favouriteSongs.map((song, i) => (
                <div key={i} className="detail-song-card">
                  <Music size={16} className="detail-song-icon" />
                  <span className="detail-song-name">{song.name}</span>
                  {song.youtubeUrl && (
                    <a
                      href={song.youtubeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="detail-song-link"
                    >
                      <ExternalLink size={14} /> Play
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Favourite Quotes */}
        {log.favouriteQuotes?.length > 0 && (
          <div className="detail-section glass-card-static detail-quotes-section">
            <h3><Quote size={16} /> Favourite Quotes</h3>
            <div className="detail-quotes">
              {log.favouriteQuotes.map((quote, i) => (
                <blockquote key={i} className="detail-quote">
                  <span className="detail-quote-mark">"</span>
                  {quote}
                </blockquote>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {log.notes && (
          <div className="detail-section glass-card-static">
            <h3>📝 Notes</h3>
            <p className="detail-notes">{log.notes}</p>
          </div>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
