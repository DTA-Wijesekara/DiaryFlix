import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Film, Tv,
  Users, RefreshCw, Edit3, Trash2, Music, Quote, ExternalLink, X, Save
} from 'lucide-react';
import { getLogById, deleteLog, updateLog } from '../services/storage';
import { getPosterUrl, getBackdropUrl } from '../services/tmdb';
import StarRating from '../components/StarRating';
import MoodPicker from '../components/MoodPicker';
import Toast from '../components/Toast';
import './MovieDetail.css';

const PLATFORM_OPTIONS = [
  'Netflix', 'Amazon Prime', 'Hotstar', 'JioCinema', 'Zee5',
  'YouTube', 'Theater', 'TV', 'Downloaded', 'Other',
];

export default function MovieDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [log, setLog] = useState(null);
  const [toast, setToast] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const data = getLogById(id);
    if (!data) { navigate('/library'); return; }
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

  const openEdit = () => {
    setEditForm({
      dateWatched: log.dateWatched || '',
      rating: log.rating || 0,
      moodBefore: log.moodBefore || '',
      moodAfter: log.moodAfter || '',
      platform: log.platform || '',
      watchedWith: log.watchedWith || '',
      occasion: log.occasion || '',
      category: log.category || '',
      notes: log.notes || '',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editForm || saving) return;
    setSaving(true);
    try {
      const updated = await updateLog(log.id, editForm);
      setLog(updated);
      setEditOpen(false);
      setToast({ message: 'Entry updated', type: 'success' });
    } catch (err) {
      setToast({ message: err.message || 'Could not update entry', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRewatch = () => {
    navigate('/log', { state: { rewatchOf: log } });
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${log.title}" from your diary?`)) return;
    try {
      await deleteLog(log.id);
      navigate('/diary');
    } catch (err) {
      setToast({ message: err.message || 'Could not delete entry', type: 'error' });
    }
  };

  const backdropSrc = log.backdropPath ? getBackdropUrl(log.backdropPath) : null;
  const posterSrc = log.posterUrl || (log.posterPath ? getPosterUrl(log.posterPath) : null);

  return (
    <div className="movie-detail fade-in" id="movie-detail-page">
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
          <button className="btn btn-ghost btn-icon" onClick={openEdit} title="Edit entry">
            <Edit3 size={18} />
          </button>
          <button className="btn btn-ghost btn-icon" onClick={handleDelete} title="Delete entry">
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

          {log.genres?.length > 0 && (
            <div className="detail-genres">
              {log.genres.map(g => <span key={g} className="chip">{g}</span>)}
            </div>
          )}
        </div>
      </div>

      {/* Details Grid */}
      <div className="detail-grid">
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

        {log.notes && (
          <div className="detail-section glass-card-static">
            <h3>📝 Notes</h3>
            <p className="detail-notes">{log.notes}</p>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editOpen && editForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditOpen(false)}>
          <div className="modal detail-edit-modal">
            <div className="detail-edit-header">
              <div>
                <h2>Edit Entry</h2>
                <p className="detail-edit-title-hint">{log.title}</p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="detail-edit-body">
              <div className="detail-edit-row">
                <div className="input-group">
                  <label>Date Watched</label>
                  <input
                    type="date"
                    className="input"
                    value={editForm.dateWatched}
                    onChange={(e) => setEditForm(f => ({ ...f, dateWatched: e.target.value }))}
                  />
                </div>
                <div className="input-group">
                  <label>Platform</label>
                  <select
                    className="select"
                    value={editForm.platform}
                    onChange={(e) => setEditForm(f => ({ ...f, platform: e.target.value }))}
                  >
                    <option value="">Where did you watch?</option>
                    {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div className="detail-edit-row">
                <div className="input-group">
                  <label>Watched With</label>
                  <select
                    className="select"
                    value={editForm.watchedWith}
                    onChange={(e) => setEditForm(f => ({ ...f, watchedWith: e.target.value }))}
                  >
                    <option value="">Who did you watch with?</option>
                    <option value="solo">Solo 🎧</option>
                    <option value="family">Family 👨‍👩‍👧</option>
                    <option value="friends">Friends 👯</option>
                    <option value="partner">Partner 💕</option>
                  </select>
                </div>
                <div className="input-group">
                  <label>Occasion</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Birthday, rainy day..."
                    value={editForm.occasion}
                    onChange={(e) => setEditForm(f => ({ ...f, occasion: e.target.value }))}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Category / Genre Tag</label>
                <input
                  type="text"
                  className="input"
                  placeholder="love, action, thriller..."
                  value={editForm.category}
                  onChange={(e) => setEditForm(f => ({ ...f, category: e.target.value }))}
                />
              </div>

              <div className="input-group">
                <label>Your Rating</label>
                <StarRating
                  value={editForm.rating}
                  onChange={(v) => setEditForm(f => ({ ...f, rating: v }))}
                />
              </div>

              <MoodPicker
                value={editForm.moodBefore}
                onChange={(v) => setEditForm(f => ({ ...f, moodBefore: v }))}
                label="How were you feeling BEFORE watching?"
                id="edit-mood-before"
              />
              <div style={{ marginTop: '16px' }}>
                <MoodPicker
                  value={editForm.moodAfter}
                  onChange={(v) => setEditForm(f => ({ ...f, moodAfter: v }))}
                  label="How did you feel AFTER watching? (optional)"
                  id="edit-mood-after"
                />
              </div>

              <div className="input-group" style={{ marginTop: '16px' }}>
                <label>Notes</label>
                <textarea
                  className="textarea"
                  rows={4}
                  placeholder="Any personal thoughts or memories..."
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="detail-edit-footer">
              <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleEditSave} disabled={saving}>
                {saving
                  ? <div className="auth-btn-spinner" />
                  : <><Save size={15} /> Save changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
