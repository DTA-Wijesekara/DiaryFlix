import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Film, Tv, Users, MapPin, Tag } from 'lucide-react';
import { addLog } from '../services/storage';
import { getMovieDetails, getPosterUrl, detectIndustry, hasTMDBKey } from '../services/tmdb';
import MovieSearch from '../components/MovieSearch';
import MoodPicker from '../components/MoodPicker';
import StarRating from '../components/StarRating';
import SongEntry from '../components/SongEntry';
import QuoteEntry from '../components/QuoteEntry';
import Toast from '../components/Toast';
import './LogWatch.css';

const INDUSTRY_OPTIONS = [
  { value: 'bollywood', label: 'Bollywood' },
  { value: 'tollywood', label: 'Tollywood' },
  { value: 'kollywood', label: 'Kollywood' },
  { value: 'mollywood', label: 'Mollywood' },
  { value: 'hollywood', label: 'Hollywood' },
  { value: 'sandalwood', label: 'Sandalwood' },
  { value: 'sinhala', label: 'Sinhala' },
  { value: 'other', label: 'Other' },
];

const PLATFORM_OPTIONS = [
  'Netflix', 'Amazon Prime', 'Hotstar', 'JioCinema', 'Zee5',
  'YouTube', 'Theater', 'TV', 'Downloaded', 'Other'
];

export default function LogWatch() {
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    title: '',
    type: 'movie',
    year: '',
    tmdbId: null,
    posterPath: '',
    posterUrl: '',
    backdropPath: '',
    overview: '',
    industry: '',
    dateWatched: new Date().toISOString().split('T')[0],
    rating: 0,
    category: '',
    moodBefore: '',
    moodAfter: '',
    actors: [''],
    actresses: [''],
    director: '',
    genres: [],
    runtime: 0,
    platform: '',
    watchedWith: '',
    occasion: '',
    favouriteSongs: [],
    favouriteQuotes: [],
    notes: '',
  });

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleMovieSelect = useCallback(async (movie) => {
    // Fill basic fields from search result
    setForm(prev => ({
      ...prev,
      title: movie.title,
      type: movie.type || 'movie',
      year: movie.year,
      tmdbId: movie.tmdbId,
      posterPath: movie.posterPath,
      posterUrl: movie.posterPath ? getPosterUrl(movie.posterPath) : '',
      backdropPath: movie.backdropPath,
      overview: movie.overview,
    }));

    // Fetch detailed info
    if (movie.tmdbId) {
      const details = await getMovieDetails(movie.tmdbId, movie.type);
      if (details) {
        setForm(prev => ({
          ...prev,
          actors: details.actors.length > 0 ? details.actors : [''],
          actresses: details.actresses.length > 0 ? details.actresses : [''],
          director: details.director || '',
          genres: details.genres || [],
          category: details.genres ? details.genres.join(', ') : '',
          runtime: details.runtime || 0,
          industry: detectIndustry(details),
        }));
      }
    }
  }, []);

  const handleArrayField = (field, index, value) => {
    setForm(prev => {
      const arr = [...prev[field]];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
  };

  const addArrayItem = (field) => {
    setForm(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const removeArrayItem = (field, index) => {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!form.title.trim()) {
      setToast({ message: 'Please enter a movie title', type: 'error' });
      return;
    }

    const entry = {
      ...form,
      actors: form.actors.filter(a => a.trim()),
      actresses: form.actresses.filter(a => a.trim()),
      favouriteSongs: form.favouriteSongs.filter(s => s.name?.trim()),
      favouriteQuotes: form.favouriteQuotes.filter(q => q.trim()),
    };

    setSaving(true);
    try {
      await addLog(entry);
      setToast({ message: `"${form.title}" saved to your diary`, type: 'success' });
      setTimeout(() => navigate('/diary'), 900);
    } catch (err) {
      setToast({ message: err.message || 'Could not save entry', type: 'error' });
      setSaving(false);
    }
  };

  return (
    <div className="log-watch fade-in" id="log-watch-page">
      <div className="page-header">
        <h1>Log a Watch 🎬</h1>
        <p>Record what you watched, how you felt, and what you loved.</p>
      </div>

      <form className="log-form" onSubmit={handleSubmit}>
        {/* Movie Search */}
        <div className="log-section glass-card-static" style={{ position: 'relative', zIndex: 10 }}>
          <h3 className="log-section-title">
            <Film size={18} />
            Movie / TV Series
          </h3>
          <MovieSearch onSelect={handleMovieSelect} />

          {/* Selected movie preview */}
          {form.posterUrl && (
            <div className="log-selected-preview">
              <img src={form.posterUrl} alt={form.title} className="log-selected-poster" />
              <div className="log-selected-info">
                <h4>{form.title}</h4>
                <span className="log-selected-year">{form.year}</span>
                {form.overview && (
                  <p className="log-selected-overview">{form.overview.slice(0, 150)}...</p>
                )}
                {form.genres.length > 0 && (
                  <div className="log-selected-genres">
                    {form.genres.map(g => (
                      <span key={g} className="chip">{g}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manual title if no TMDB */}
          {!hasTMDBKey() && (
            <div className="input-group">
              <label>Title</label>
              <input
                type="text"
                className="input"
                placeholder="Enter movie or TV series name"
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                required
              />
            </div>
          )}

          <div className="log-row">
            <div className="input-group">
              <label>Type</label>
              <div className="log-type-toggle">
                <button
                  type="button"
                  className={`btn ${form.type === 'movie' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => updateField('type', 'movie')}
                >
                  <Film size={16} /> Movie
                </button>
                <button
                  type="button"
                  className={`btn ${form.type === 'tv_series' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => updateField('type', 'tv_series')}
                >
                  <Tv size={16} /> TV Series
                </button>
              </div>
            </div>
            <div className="input-group">
              <label>Year</label>
              <input
                type="text"
                className="input"
                placeholder="2024"
                value={form.year}
                onChange={(e) => updateField('year', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Watch Details */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title">
            <Tag size={18} />
            Watch Details
          </h3>

          <div className="log-row">
            <div className="input-group">
              <label>Date Watched</label>
              <input
                type="date"
                className="input"
                value={form.dateWatched}
                onChange={(e) => updateField('dateWatched', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Industry</label>
              <select
                className="select"
                value={form.industry}
                onChange={(e) => updateField('industry', e.target.value)}
              >
                <option value="">Select industry</option>
                {INDUSTRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="log-row">
            <div className="input-group">
              <label>Category / Genre Tag</label>
              <input
                type="text"
                className="input"
                placeholder="love, action, thriller..."
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Platform</label>
              <select
                className="select"
                value={form.platform}
                onChange={(e) => updateField('platform', e.target.value)}
              >
                <option value="">Where did you watch?</option>
                {PLATFORM_OPTIONS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="log-row">
            <div className="input-group">
              <label>Watched With</label>
              <select
                className="select"
                value={form.watchedWith}
                onChange={(e) => updateField('watchedWith', e.target.value)}
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
                placeholder="Birthday, Diwali, rainy day..."
                value={form.occasion}
                onChange={(e) => updateField('occasion', e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label>Your Rating</label>
            <StarRating
              value={form.rating}
              onChange={(v) => updateField('rating', v)}
            />
          </div>
        </div>

        {/* Cast & Crew */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title">
            <Users size={18} />
            Cast & Crew
          </h3>

          <div className="input-group">
            <label>Director</label>
            <input
              type="text"
              className="input"
              placeholder="Director name"
              value={form.director}
              onChange={(e) => updateField('director', e.target.value)}
            />
          </div>

          <div className="log-row">
            <div className="input-group">
              <label>Actors</label>
              {form.actors.map((actor, i) => (
                <div key={i} className="log-array-row">
                  <input
                    type="text"
                    className="input"
                    placeholder="Actor name"
                    value={actor}
                    onChange={(e) => handleArrayField('actors', i, e.target.value)}
                  />
                  {form.actors.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      onClick={() => removeArrayItem('actors', i)}
                    >×</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost log-add-field" onClick={() => addArrayItem('actors')}>
                + Add actor
              </button>
            </div>

            <div className="input-group">
              <label>Actresses</label>
              {form.actresses.map((actress, i) => (
                <div key={i} className="log-array-row">
                  <input
                    type="text"
                    className="input"
                    placeholder="Actress name"
                    value={actress}
                    onChange={(e) => handleArrayField('actresses', i, e.target.value)}
                  />
                  {form.actresses.length > 1 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      onClick={() => removeArrayItem('actresses', i)}
                    >×</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost log-add-field" onClick={() => addArrayItem('actresses')}>
                + Add actress
              </button>
            </div>
          </div>
        </div>

        {/* Mood */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title">🎭 Your Mood</h3>
          <MoodPicker
            value={form.moodBefore}
            onChange={(v) => updateField('moodBefore', v)}
            label="How were you feeling BEFORE watching?"
            id="mood-before"
          />
          <div style={{ marginTop: '16px' }}>
            <MoodPicker
              value={form.moodAfter}
              onChange={(v) => updateField('moodAfter', v)}
              label="How did you feel AFTER watching? (optional)"
              id="mood-after"
            />
          </div>
        </div>

        {/* Songs & Quotes */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title">🎵 Songs & Quotes</h3>
          <SongEntry
            songs={form.favouriteSongs}
            onChange={(v) => updateField('favouriteSongs', v)}
            movieTitle={form.title}
          />
          <div style={{ marginTop: '20px' }}>
            <QuoteEntry
              quotes={form.favouriteQuotes}
              onChange={(v) => updateField('favouriteQuotes', v)}
            />
          </div>
        </div>

        {/* Notes */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title">📝 Notes</h3>
          <textarea
            className="textarea"
            placeholder="Any personal thoughts, memories, or context about this watch..."
            value={form.notes}
            onChange={(e) => updateField('notes', e.target.value)}
            rows={4}
          />
        </div>

        {/* Submit */}
        <div className="log-submit">
          <button
            type="submit"
            className="btn btn-primary btn-lg log-submit-btn"
            disabled={saving}
          >
            <Save size={18} />
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </form>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
