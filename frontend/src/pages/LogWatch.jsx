import EpisodePicker from '../components/EpisodePicker';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Save, Film, Tv, Users, Tag, AlertCircle, RefreshCw, Bookmark } from 'lucide-react';
import { addLog, getAllLogs } from '../services/storage';
import { getWishlistById, deleteWishlist } from '../services/wishlist';
import { getMovieDetails, getPosterUrl, detectIndustry, hasTMDBKey } from '../services/tmdb';
import MovieSearch from '../components/MovieSearch';
import MoodPicker from '../components/MoodPicker';
import StarRating from '../components/StarRating';
import SongEntry from '../components/SongEntry';
import QuoteEntry from '../components/QuoteEntry';
import Toast from '../components/Toast';
import { track } from '../analytics';
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
  'YouTube', 'Theater', 'TV', 'Downloaded', 'Other',
];

function buildInitialForm(seed) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (!seed) {
    return {
      title: '', type: 'movie', year: '', tmdbId: null,
      posterPath: '', posterUrl: '', backdropPath: '', overview: '',
      industry: '', dateWatched: today, rating: 0, category: '',
      moodBefore: '', moodAfter: '', actors: [''], actresses: [''],
      director: '', genres: [], runtime: 0, platform: '',
      watchedWith: '', occasion: '', favouriteSongs: [], favouriteQuotes: [], notes: '',
    };
  }
  return {
    movieId: seed.movieId || null,
    episode: seed.episode || (seed.episodeId ? {seasonNumber: seed.seasonNumber, episodeNumber: seed.episodeNumber, title: seed.episodeTitle || '', runtime: seed.episodeRuntime, airDate: seed.episodeAirDate} : null),
    allowRewatch: seed.allowRewatch ?? !!seed.episodeId,
    title: seed.title || '',
    type: seed.type || 'movie',
    year: seed.year || '',
    tmdbId: seed.tmdbId || null,
    posterPath: seed.posterPath || '',
    posterUrl: seed.posterUrl || (seed.posterPath ? getPosterUrl(seed.posterPath) : ''),
    backdropPath: seed.backdropPath || '',
    overview: seed.overview || '',
    industry: seed.industry || '',
    actors: seed.actors?.length > 0 ? seed.actors : [''],
    actresses: seed.actresses?.length > 0 ? seed.actresses : [''],
    director: seed.director || '',
    genres: seed.genres || [],
    runtime: seed.runtime || 0,
    category: seed.category || '',
    // Reset watch-specific fields so the user fills them fresh
    dateWatched: today,
    rating: 0,
    moodBefore: '',
    moodAfter: '',
    platform: '',
    watchedWith: '',
    occasion: '',
    favouriteSongs: [],
    favouriteQuotes: [],
    notes: '',
  };
}

export default function LogWatch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rewatchOf = location.state?.rewatchOf || null;

  const wishlistId = searchParams.get('wishlistId');
  const wishlistSeed = wishlistId ? getWishlistById(wishlistId) : null;

  const selection = useRef(0);
  const submission = useRef(null);
  const [manual, setManual] = useState(!hasTMDBKey());
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState(null);
  const [duplicateLogId, setDuplicateLogId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => buildInitialForm(rewatchOf || wishlistSeed));

  // Fill in cast/director/runtime from TMDB when seeded from a watchlist item that has a tmdbId.
  useEffect(() => {
    if (!wishlistSeed?.tmdbId || rewatchOf) return;
    let cancelled = false;
    getMovieDetails(wishlistSeed.tmdbId, wishlistSeed.type).then(details => {
      if (cancelled || !details) return;
      setForm(prev => ({
        ...prev,
        actors: details.actors.length > 0 ? details.actors : prev.actors,
        actresses: details.actresses.length > 0 ? details.actresses : prev.actresses,
        director: details.director || prev.director,
        genres: details.genres || prev.genres,
        category: prev.category || (details.genres ? details.genres.join(', ') : ''),
        runtime: details.runtime || prev.runtime,
        industry: prev.industry || detectIndustry(details),
      }));
    });
    return () => { cancelled = true; };
  }, [wishlistSeed, rewatchOf]);

  useEffect(() => {
    if (!dirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    const leave = e => {
      const link = e.target.closest('a[href]');
      if (link && !e.defaultPrevented && !window.confirm('Leave without saving this watch?')) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', leave, true); };
  }, [dirty]);

  const updateField = (field, value) => { setDirty(true); setForm(prev => ({ ...prev, [field]: value })); };

  const handleMovieSelect = useCallback(async (movie) => {
    const request = ++selection.current;
    setDirty(true);
    // Duplicate detection — only relevant when NOT a Watch Again flow
    if (!rewatchOf && movie.tmdbId) {
      const existing = getAllLogs().find(l => l.tmdbId === movie.tmdbId && l.type === movie.type);
      setDuplicateLogId(existing ? existing.id : null);
    } else {
      setDuplicateLogId(null);
    }

    setForm(prev => ({
      ...prev,
      movieId: null, episode: null, allowRewatch: false,
      actors: [''], actresses: [''], director: '', genres: [], category: '', runtime: 0, industry: '',
      title: movie.title,
      type: movie.type || 'movie',
      year: movie.year,
      tmdbId: movie.tmdbId,
      posterPath: movie.posterPath,
      posterUrl: movie.posterPath ? getPosterUrl(movie.posterPath) : '',
      backdropPath: movie.backdropPath,
      overview: movie.overview,
    }));

    if (movie.tmdbId) {
      const details = await getMovieDetails(movie.tmdbId, movie.type);
      if (details && request === selection.current) {
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
  }, [rewatchOf]);

  const handleArrayField = (field, index, value) => {
    setForm(prev => {
      const arr = [...prev[field]];
      arr[index] = value;
      return { ...prev, [field]: arr };
    });
  };

  const addArrayItem = (field) => setForm(prev => ({ ...prev, [field]: [...prev[field], ''] }));

  const removeArrayItem = (field, index) =>
    setForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));

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

    if (entry.type !== 'tv_series') delete entry.episode;
    const signature = JSON.stringify(entry);
    if (submission.current?.signature !== signature) submission.current = { signature, id: crypto.randomUUID() };
    entry.requestId = submission.current.id;
    setSaving(true);
    try {
      await addLog(entry);
      setDirty(false);
      track('film_logged', {
        title: entry.title,
        rating: entry.rating,
        industry: entry.industry,
        from_wishlist: !!wishlistId,
      });
      if (wishlistId && !entry.episode) {
        try { await deleteWishlist(wishlistId); } catch { /* non-fatal */ }
      }
      setToast({ message: `"${form.title}" saved to your diary`, type: 'success' });
      setTimeout(() => navigate('/diary'), 900);
    } catch (err) {
      setToast({ message: err.message || 'Could not save entry', type: 'error' });
      setSaving(false);
    }
  };

  const submitLabel = 'Save watch';

  return (
    <div className="log-watch fade-in" id="log-watch-page">
      <div className="page-header">
        {rewatchOf ? (
          <>
            <h1>Log another watch</h1>
            <p>Recording a new watch of <strong>{rewatchOf.title}</strong> — this will be a separate diary entry.</p>
          </>
        ) : wishlistSeed ? (
          <>
            <h1>Log a watch</h1>
            <p>Logging <strong>{wishlistSeed.title}</strong> from your watchlist — fill in the details below.</p>
          </>
        ) : (
          <>
            <h1>Log a watch</h1>
            <p>Choose a film or series, add the date, and save. Everything else is optional.</p>
          </>
        )}
      </div>

      {rewatchOf && (
        <div className="log-rewatch-banner">
          <RefreshCw size={15} />
          <span>Adding a new watch of <strong>{rewatchOf.title}</strong>. Your earlier entries stay in your diary.</span>
        </div>
      )}

      {wishlistSeed && !rewatchOf && (
        <div className="log-rewatch-banner">
          <Bookmark size={15} />
          <span>From your watchlist — saving a film or general series entry removes <strong>{wishlistSeed.title}</strong> from your watchlist. Episode entries keep it there.</span>
        </div>
      )}

      <form className="log-form" onSubmit={handleSubmit} onChange={() => setDirty(true)}>
        {/* Movie / Search */}
        {(!rewatchOf && !wishlistSeed || form.posterUrl) && <div className="log-section glass-card-static" style={{ position: 'relative', zIndex: 10 }}>
          <h2 className="log-section-title">What did you watch?</h2>

          {!rewatchOf && !wishlistSeed && <>
            {!manual && <MovieSearch onSelect={handleMovieSelect} />}
            {hasTMDBKey() && <button type="button" className="btn btn-link" onClick={() => {
              selection.current += 1;
              setManual(!manual);
              setForm(prev => ({ ...buildInitialForm(null), dateWatched: prev.dateWatched, rating: prev.rating, notes: prev.notes }));
              setDuplicateLogId(null);
            }}>{manual ? 'Search for a film instead' : 'Can’t find it? Add manually'}</button>}
          </>}

          {duplicateLogId && !rewatchOf && (
            <div className="log-duplicate-warn">
              <AlertCircle size={15} />
              You've watched <strong>{form.title}</strong> before. This will add another watch.
            </div>
          )}

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
                    {form.genres.map(g => <span key={g} className="chip">{g}</span>)}
                  </div>
                )}
              </div>
            </div>
          )}

          {manual && !rewatchOf && !wishlistSeed && (
            <div className="input-group">
              <label htmlFor="watch-title">Title</label>
              <input
                id="watch-title" type="text" className="input" placeholder="Enter movie or TV series name"
                value={form.title} onChange={(e) => updateField('title', e.target.value)} required
              />
            </div>
          )}

          {manual && !rewatchOf && !wishlistSeed && <div className="log-row">
            <div className="input-group">
              <label>Type</label>
              <div className="log-type-toggle">
                <button type="button" className={`btn ${form.type === 'movie' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => updateField('type', 'movie')}>
                  <Film size={16} /> Movie
                </button>
                <button type="button" className={`btn ${form.type === 'tv_series' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => updateField('type', 'tv_series')}>
                  <Tv size={16} /> TV Series
                </button>
              </div>
            </div>
            <div className="input-group">
              <label htmlFor="log-year">Year</label>
              <input id="log-year" type="text" className="input" placeholder="2024" value={form.year} onChange={(e) => updateField('year', e.target.value)} />
            </div>
          </div>}
        </div>}

        {form.type === 'tv_series' && <EpisodePicker key={`${form.tmdbId || form.movieId || 'manual'}`} value={form.episode || null} tmdbId={form.tmdbId} onChange={value => updateField('episode', value)} />}
        {form.episode && <label><input type="checkbox" checked={!!form.allowRewatch} onChange={e => updateField('allowRewatch', e.target.checked)} /> This is an intentional rewatch of this episode</label>}
        <section className="log-section card">
          <div className="input-group"><label htmlFor="watch-date">Date watched</label>
            <input id="watch-date" type="date" className="input" value={form.dateWatched} onChange={e => updateField('dateWatched', e.target.value)} required />
          </div>
          <div className="input-group"><span id="watch-rating-label">Your rating <span className="text-muted">— optional</span></span>
            <StarRating value={form.rating} onChange={v => updateField('rating', v)} />
          </div>
          <div className="input-group"><label htmlFor="watch-note">Your note — optional</label>
            <textarea id="watch-note" className="textarea" placeholder="What did you think?" value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={3} />
          </div>
        </section>
        <details className="quiet-disclosure log-extras"><summary>Add more details <span className="text-muted">— optional</span></summary>
        {/* Watch Details */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title"><Tag size={18} /> Watch Details</h3>

          <div className="log-row">
            <div className="input-group">
              <label htmlFor="log-industry">Industry</label>
              <select id="log-industry" className="select" value={form.industry} onChange={(e) => updateField('industry', e.target.value)}>
                <option value="">Select industry</option>
                {INDUSTRY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>

          <div className="log-row">
            <div className="input-group">
              <label htmlFor="log-category-genre-tag">Category / Genre Tag</label>
              <input id="log-category-genre-tag" type="text" className="input" placeholder="love, action, thriller..." value={form.category} onChange={(e) => updateField('category', e.target.value)} />
            </div>
            <div className="input-group">
              <label htmlFor="log-platform">Platform</label>
              <select id="log-platform" className="select" value={form.platform} onChange={(e) => updateField('platform', e.target.value)}>
                <option value="">Where did you watch?</option>
                {PLATFORM_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="log-row">
            <div className="input-group">
              <label htmlFor="log-watched-with">Watched With</label>
              <select id="log-watched-with" className="select" value={form.watchedWith} onChange={(e) => updateField('watchedWith', e.target.value)}>
                <option value="">Who did you watch with?</option>
                <option value="solo">Solo 🎧</option>
                <option value="family">Family 👨‍👩‍👧</option>
                <option value="friends">Friends 👯</option>
                <option value="partner">Partner 💕</option>
              </select>
            </div>
            <div className="input-group">
              <label htmlFor="log-occasion">Occasion</label>
              <input id="log-occasion" type="text" className="input" placeholder="Birthday, Diwali, rainy day..." value={form.occasion} onChange={(e) => updateField('occasion', e.target.value)} />
            </div>
          </div>

        </div>

        {/* Cast & Crew */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title"><Users size={18} /> Cast & Crew</h3>

          <div className="input-group">
            <label htmlFor="log-director">Director</label>
            <input id="log-director" type="text" className="input" placeholder="Director name" value={form.director} onChange={(e) => updateField('director', e.target.value)} />
          </div>

          <div className="log-row">
            <div className="input-group">
              <label>Actors</label>
              {form.actors.map((actor, i) => (
                <div key={i} className="log-array-row">
                  <input type="text" className="input" placeholder="Actor name" value={actor} onChange={(e) => handleArrayField('actors', i, e.target.value)} />
                  {form.actors.length > 1 && (
                    <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeArrayItem('actors', i)}>×</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost log-add-field" onClick={() => addArrayItem('actors')}>+ Add actor</button>
            </div>

            <div className="input-group">
              <label>Actresses</label>
              {form.actresses.map((actress, i) => (
                <div key={i} className="log-array-row">
                  <input type="text" className="input" placeholder="Actress name" value={actress} onChange={(e) => handleArrayField('actresses', i, e.target.value)} />
                  {form.actresses.length > 1 && (
                    <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeArrayItem('actresses', i)}>×</button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-ghost log-add-field" onClick={() => addArrayItem('actresses')}>+ Add actress</button>
            </div>
          </div>
        </div>

        {/* Mood */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title">How did you feel?</h3>
          <MoodPicker value={form.moodBefore} onChange={(v) => updateField('moodBefore', v)} label="How were you feeling BEFORE watching?" id="mood-before" />
          <div style={{ marginTop: '16px' }}>
            <MoodPicker value={form.moodAfter} onChange={(v) => updateField('moodAfter', v)} label="How did you feel AFTER watching? (optional)" id="mood-after" />
          </div>
        </div>

        {/* Songs & Quotes */}
        <div className="log-section glass-card-static">
          <h3 className="log-section-title">Songs & quotes</h3>
          <SongEntry songs={form.favouriteSongs} onChange={(v) => updateField('favouriteSongs', v)} movieTitle={form.title} />
          <div style={{ marginTop: '20px' }}>
            <QuoteEntry quotes={form.favouriteQuotes} onChange={(v) => updateField('favouriteQuotes', v)} />
          </div>
        </div>

        </details>
        <div className="log-submit">
          <button type="submit" className="btn btn-primary btn-lg log-submit-btn" disabled={saving}>
            <Save size={18} />
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
