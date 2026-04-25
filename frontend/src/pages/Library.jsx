import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, LayoutGrid, List as ListIcon, Star, RefreshCw } from 'lucide-react';
import { getAllLogs, getLogsByIndustry, searchLogs, getStats } from '../services/storage';
import { getPosterUrl } from '../services/tmdb';
import IndustryTabs from '../components/IndustryTabs';
import MovieCard from '../components/MovieCard';
import './Library.css';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function Library() {
  const [industry, setIndustry] = useState('all');
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [sortBy, setSortBy] = useState('date-desc');

  const stats = useMemo(() => getStats(), []);

  const logs = useMemo(() => {
    const base = query.trim() ? searchLogs(query) : getLogsByIndustry(industry);
    const arr = [...base];
    const cmp = {
      'date-desc':   (a, b) => new Date(b.dateWatched || b.createdAt) - new Date(a.dateWatched || a.createdAt),
      'date-asc':    (a, b) => new Date(a.dateWatched || a.createdAt) - new Date(b.dateWatched || b.createdAt),
      'rating-desc': (a, b) => (b.rating || 0) - (a.rating || 0),
      'rating-asc':  (a, b) => (a.rating || 0) - (b.rating || 0),
      'title-asc':   (a, b) => (a.title || '').localeCompare(b.title || ''),
    }[sortBy];
    if (cmp) arr.sort(cmp);
    return arr;
  }, [industry, query, sortBy]);

  return (
    <div className="library fade-in" id="library-page">
      <header className="page-header">
        <span className="eyebrow">The Library</span>
        <h1>Every film you've logged</h1>
        <p>{logs.length} {logs.length === 1 ? 'entry' : 'entries'}{query ? ` matching "${query}"` : ''}.</p>
      </header>

      <div className="library-controls">
        <div className="library-search">
          <Search size={15} className="library-search-icon" aria-hidden="true" />
          <input
            type="text"
            className="input library-search-input"
            placeholder="Search by title, cast, or director"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search library"
          />
        </div>

        <div className="library-actions">
          <select
            className="select library-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort entries"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="rating-desc">Highest rated</option>
            <option value="rating-asc">Lowest rated</option>
            <option value="title-asc">Title A–Z</option>
          </select>

          <div className="library-view-toggle" role="group" aria-label="View mode">
            <button
              className={`btn btn-icon ${viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              title="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={`btn btn-icon ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title="List view"
            >
              <ListIcon size={16} />
            </button>
          </div>
        </div>
      </div>

      {!query && (
        <div className="library-industry-tabs">
          <IndustryTabs
            value={industry}
            onChange={setIndustry}
            counts={stats.byIndustry}
          />
        </div>
      )}

      {logs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Search size={20} /></div>
          <h3>Nothing on this shelf</h3>
          <p>
            {query
              ? `No entries match "${query}". Try a looser search.`
              : 'Your library is still empty. Log a film to start shelving entries.'}
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="library-grid grid-auto">
          {logs.map((log, i) => <MovieCard key={log.id} log={log} index={i} />)}
        </div>
      ) : (
        <LibraryTable logs={logs} />
      )}
    </div>
  );
}

function LibraryTable({ logs }) {
  return (
    <div className="library-table-wrap">
      <table className="library-table">
        <thead>
          <tr>
            <th className="col-date">Date</th>
            <th className="col-title">Title</th>
            <th className="col-director">Director</th>
            <th className="col-industry">Industry</th>
            <th className="col-rating">Rating</th>
            <th className="col-rewatch">Rewatch</th>
          </tr>
        </thead>
        <tbody>
          {logs.map(log => {
            const poster = log.posterUrl || (log.posterPath ? getPosterUrl(log.posterPath, 'w92') : null);
            return (
              <tr key={log.id}>
                <td className="col-date">
                  <span className="mono">{formatDate(log.dateWatched) || '—'}</span>
                </td>
                <td className="col-title">
                  <Link to={`/movie/${log.id}`} className="library-table-titlelink unstyled-link">
                    {poster
                      ? <img src={poster} alt="" className="library-table-poster" loading="lazy" />
                      : <div className="library-table-poster library-table-poster-empty">{log.title?.[0] || '?'}</div>
                    }
                    <div>
                      <span className="library-table-title">{log.title}</span>
                      {log.year && <span className="library-table-year mono"> · {log.year}</span>}
                    </div>
                  </Link>
                </td>
                <td className="col-director">{log.director || <span className="text-subtle">—</span>}</td>
                <td className="col-industry">
                  {log.industry ? <span className="chip">{log.industry}</span> : <span className="text-subtle">—</span>}
                </td>
                <td className="col-rating">
                  {log.rating > 0
                    ? <span className="library-table-rating mono"><Star size={12} strokeWidth={2.4} /> {log.rating}</span>
                    : <span className="text-subtle">—</span>}
                </td>
                <td className="col-rewatch">
                  {log.rewatchCount > 0
                    ? <span className="mono text-accent"><RefreshCw size={11} strokeWidth={2.2} /> {log.rewatchCount}</span>
                    : <span className="text-subtle">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
