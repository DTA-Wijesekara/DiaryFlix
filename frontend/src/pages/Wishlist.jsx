import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bookmark, Plus, Calendar, Film, AlertCircle, Check, X, Trash2, Pencil,
} from 'lucide-react';
import {
  fetchWishlistFromServer, getAllWishlist, addWishlist, updateWishlist,
  deleteWishlist, bucketWishlist,
} from '../services/wishlist';
import { getPosterUrl, detectIndustry, getMovieDetails, hasTMDBKey } from '../services/tmdb';
import MovieSearch from '../components/MovieSearch';
import Toast from '../components/Toast';
import './Wishlist.css';

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function daysFromToday(dateStr) {
  if (!dateStr) return null;
  const a = new Date(todayKey());
  const b = new Date(dateStr);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

export default function Wishlist() {
  const navigate = useNavigate();
  const [items, setItems] = useState(() => getAllWishlist());
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchWishlistFromServer().then(fresh => {
      if (!cancelled) setItems(fresh);
    });
    return () => { cancelled = true; };
  }, []);

  const buckets = useMemo(() => bucketWishlist(items), [items]);

  const refresh = () => setItems(getAllWishlist());

  const handleAdd = async (entry) => {
    try {
      await addWishlist(entry);
      refresh();
      setShowAdd(false);
      setToast({ message: `"${entry.title}" added to your wishlist`, type: 'success' });
    } catch (err) {
      setToast({ message: err.message || 'Could not add to wishlist', type: 'error' });
    }
  };

  const handleUpdate = async (id, updates) => {
    try {
      await updateWishlist(id, updates);
      refresh();
      setEditing(null);
      setToast({ message: 'Wishlist item updated', type: 'success' });
    } catch (err) {
      setToast({ message: err.message || 'Could not update item', type: 'error' });
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Remove "${title}" from your wishlist?`)) return;
    try {
      await deleteWishlist(id);
      refresh();
      setToast({ message: 'Removed from wishlist', type: 'success' });
    } catch (err) {
      setToast({ message: err.message || 'Could not remove item', type: 'error' });
    }
  };

  const handleMarkWatched = (item) => {
    navigate(`/log?wishlistId=${encodeURIComponent(item.id)}`);
  };

  const totalDue = buckets.overdue.length + buckets.today.length;

  return (
    <div className="wishlist fade-in">
      <header className="page-header wishlist-header">
        <div>
          <span className="eyebrow"><Bookmark size={12} /> Up next</span>
          <h1>Wishlist</h1>
          <p>
            {items.length === 0
              ? 'Save films you want to watch later — assign a date and we\'ll remind you.'
              : `${items.length} ${items.length === 1 ? 'film' : 'films'} saved${totalDue > 0 ? ` · ${totalDue} due` : ''}.`}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> Add to wishlist
        </button>
      </header>

      {items.length === 0 ? (
        <div className="empty-state wishlist-empty">
          <div className="empty-state-icon"><Bookmark size={20} /></div>
          <h3>Your wishlist is empty</h3>
          <p>Save a film you've heard about — assign a date and we'll surface it on the day.</p>
          <button className="btn btn-accent" onClick={() => setShowAdd(true)}>
            <Plus size={16} /> Add your first film
          </button>
        </div>
      ) : (
        <>
          <Section
            title="Today"
            tone="due"
            items={buckets.today}
            onMarkWatched={handleMarkWatched}
            onEdit={setEditing}
            onDelete={handleDelete}
            emptyMessage="Nothing planned for today."
          />
          <Section
            title="Overdue"
            tone="overdue"
            items={buckets.overdue}
            onMarkWatched={handleMarkWatched}
            onEdit={setEditing}
            onDelete={handleDelete}
            hideIfEmpty
          />
          <Section
            title="Upcoming"
            items={buckets.upcoming}
            onMarkWatched={handleMarkWatched}
            onEdit={setEditing}
            onDelete={handleDelete}
            hideIfEmpty
          />
          <Section
            title="Someday"
            items={buckets.someday}
            onMarkWatched={handleMarkWatched}
            onEdit={setEditing}
            onDelete={handleDelete}
            hideIfEmpty
          />
        </>
      )}

      {showAdd && (
        <WishlistEditor
          mode="add"
          onSubmit={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editing && (
        <WishlistEditor
          mode="edit"
          initial={editing}
          onSubmit={(updates) => handleUpdate(editing.id, updates)}
          onClose={() => setEditing(null)}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────────

function Section({ title, tone, items, onMarkWatched, onEdit, onDelete, emptyMessage, hideIfEmpty }) {
  if (hideIfEmpty && items.length === 0) return null;

  return (
    <section className={`wishlist-section ${tone ? `tone-${tone}` : ''}`}>
      <header className="wishlist-section-head">
        <h2 className="wishlist-section-title">{title}</h2>
        <span className="mono wishlist-section-count">{items.length}</span>
      </header>

      {items.length === 0 ? (
        <p className="wishlist-section-empty">{emptyMessage}</p>
      ) : (
        <ul className="wishlist-list">
          {items.map(item => (
            <WishlistCard
              key={item.id}
              item={item}
              tone={tone}
              onMarkWatched={() => onMarkWatched(item)}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item.id, item.title)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function WishlistCard({ item, tone, onMarkWatched, onEdit, onDelete }) {
  const poster = item.posterPath ? getPosterUrl(item.posterPath, 'w185') : null;
  const dDelta = daysFromToday(item.plannedDate);
  let dateLabel = '';
  if (item.plannedDate) {
    if (dDelta === 0) dateLabel = 'Today';
    else if (dDelta === 1) dateLabel = 'Tomorrow';
    else if (dDelta === -1) dateLabel = 'Yesterday';
    else if (dDelta > 1) dateLabel = `In ${dDelta} days · ${formatDate(item.plannedDate)}`;
    else dateLabel = `${Math.abs(dDelta)} days ago · ${formatDate(item.plannedDate)}`;
  }

  return (
    <li className={`wishlist-card ${tone ? `tone-${tone}` : ''}`}>
      <div className="wishlist-card-poster">
        {poster ? (
          <img src={poster} alt={item.title} loading="lazy" />
        ) : (
          <div className="wishlist-card-poster-empty"><Film size={22} /></div>
        )}
      </div>
      <div className="wishlist-card-body">
        <div className="wishlist-card-head">
          <h3 className="wishlist-card-title">{item.title}</h3>
          <span className="mono wishlist-card-year">{item.year}</span>
        </div>

        {dateLabel && (
          <span className={`wishlist-card-date ${tone === 'overdue' ? 'overdue' : ''} ${tone === 'due' ? 'due' : ''}`}>
            {tone === 'overdue' ? <AlertCircle size={13} /> : <Calendar size={13} />}
            {dateLabel}
          </span>
        )}

        {item.note && <p className="wishlist-card-note">{item.note}</p>}
        {item.source && <span className="wishlist-card-source mono">via {item.source}</span>}

        <div className="wishlist-card-actions">
          <button className="btn btn-accent btn-sm" onClick={onMarkWatched}>
            <Check size={14} /> Mark as watched
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onEdit} aria-label="Edit">
            <Pencil size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onDelete} aria-label="Remove">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </li>
  );
}

// ── Editor (add / edit modal) ────────────────────────────────────────────────

function WishlistEditor({ mode, initial, onSubmit, onClose }) {
  const [form, setForm] = useState(() => ({
    title: initial?.title || '',
    type: initial?.type || 'movie',
    year: initial?.year || '',
    tmdbId: initial?.tmdbId || null,
    posterPath: initial?.posterPath || '',
    backdropPath: initial?.backdropPath || '',
    overview: initial?.overview || '',
    industry: initial?.industry || '',
    plannedDate: initial?.plannedDate || '',
    note: initial?.note || '',
    source: initial?.source || '',
  }));
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSelect = async (movie) => {
    setForm(prev => ({
      ...prev,
      title: movie.title,
      type: movie.type || 'movie',
      year: movie.year || '',
      tmdbId: movie.tmdbId,
      posterPath: movie.posterPath || '',
      backdropPath: movie.backdropPath || '',
      overview: movie.overview || '',
    }));
    if (movie.tmdbId) {
      const details = await getMovieDetails(movie.tmdbId, movie.type);
      if (details) {
        setForm(prev => ({
          ...prev,
          industry: detectIndustry(details),
        }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wishlist-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wishlist-modal" onClick={e => e.stopPropagation()}>
        <header className="wishlist-modal-head">
          <h2>{mode === 'add' ? 'Add to wishlist' : 'Edit wishlist item'}</h2>
          <button className="wishlist-modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="wishlist-modal-form">
          {mode === 'add' && hasTMDBKey() && (
            <div className="input-group">
              <label>Search</label>
              <MovieSearch onSelect={handleSelect} id="wishlist-search" />
            </div>
          )}

          <div className="input-group">
            <label>Title *</label>
            <input
              type="text"
              className="input"
              placeholder="Movie or TV series name"
              value={form.title}
              onChange={(e) => update('title', e.target.value)}
              required
            />
          </div>

          <div className="log-row">
            <div className="input-group">
              <label>Year</label>
              <input
                type="text"
                className="input"
                placeholder="2024"
                value={form.year}
                onChange={(e) => update('year', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label>Planned date</label>
              <input
                type="date"
                className="input"
                value={form.plannedDate}
                onChange={(e) => update('plannedDate', e.target.value)}
              />
            </div>
          </div>

          <div className="input-group">
            <label>Recommended by (optional)</label>
            <input
              type="text"
              className="input"
              placeholder="A friend, a critic, a podcast..."
              value={form.source}
              onChange={(e) => update('source', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label>Note (optional)</label>
            <textarea
              className="textarea"
              placeholder="Why do you want to watch this?"
              value={form.note}
              onChange={(e) => update('note', e.target.value)}
              rows={3}
            />
          </div>

          {form.posterPath && (
            <div className="wishlist-modal-preview">
              <img src={getPosterUrl(form.posterPath, 'w185')} alt={form.title} />
              <div>
                <strong>{form.title}</strong>
                {form.year && <span className="mono"> · {form.year}</span>}
                {form.overview && <p>{form.overview.slice(0, 140)}…</p>}
              </div>
            </div>
          )}

          <div className="wishlist-modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !form.title.trim()}>
              {saving ? 'Saving…' : (mode === 'add' ? 'Add to wishlist' : 'Save changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
