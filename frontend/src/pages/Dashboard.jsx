import { episodeLabel } from '../services/series';
import useLogRevision from '../hooks/useLogRevision';
import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle, ArrowRight, Calendar, Film, BookOpen, Sparkles, Bookmark
} from 'lucide-react';
import { getAllLogs } from '../services/storage';
import { getAllWishlist, bucketWishlist } from '../services/wishlist';
import { getAnniversaryWatches } from '../services/rewatchEngine';
import { fetchRecommendations } from '../services/recommendations';
import { getPosterUrl } from '../services/tmdb';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function longDate(d) {
  return `${WEEKDAY_FULL[d.getDay()]}, ${MONTH_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function daysBetween(a, b) {
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  const revision = useLogRevision();
  const navigate = useNavigate();
  const { user } = useAuth();

  const logs = useMemo(() => { void revision; return getAllLogs(); }, [revision]);

  const today = new Date();

  const latestWatch = logs[0];
  const daysSinceLast = latestWatch?.dateWatched
    ? daysBetween(today, new Date(latestWatch.dateWatched))
    : null;

  const recentLogs = logs.slice(0, 5);

  const [topPick, setTopPick] = useState(null);
  const [topPickFallback, setTopPickFallback] = useState(false);

  useEffect(() => {
    let active = true;
    fetchRecommendations().then(res => {
      if (!active) return;
      setTopPick(res.recommendations?.[0] || null);
      setTopPickFallback(!!res.fallback);
    });
    return () => { active = false; };
  }, []);

  const anniversaries = useMemo(() => { void revision; return getAnniversaryWatches(); }, [revision]);
  const hasAnniversary = anniversaries.length > 0;


  const firstName = (user?.displayName || 'there').split(' ')[0];

  return (
    <div className="dashboard fade-in">
      {/* Masthead */}
      <header className="dash-masthead">
        <div>
          <time className="dash-date mono">{longDate(today)}</time>
          <h1 className="dash-hello">
            Good {timeGreeting()}, <span className="dash-name">{firstName}</span>.
          </h1>
          <p className="dash-subtitle">
            {logs.length === 0
              ? 'Your cinema diary is a blank page. Every film you log is a dated entry.'
              : daysSinceLast === 0
                ? 'You logged a watch today. Keep writing.'
                : daysSinceLast === 1
                  ? 'You logged yesterday. What did you watch today?'
                  : 'Welcome back. What have you watched lately?'}
          </p>
        </div>

        <div className="dash-masthead-actions">
          <Link to="/diary" className="btn btn-secondary">
            <BookOpen size={16} /> My diary
          </Link>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/log')}>
            <PlusCircle size={18} /> Log a watch
          </button>
        </div>
      </header>

      {/* Wishlist due / overdue */}
      <WishlistDueBanner />

      {/* On this day — prominent when it triggers */}
      {hasAnniversary && (
        <section className="dash-anniversary">
          <div className="dash-anniversary-label">
            <Calendar size={14} /> On this day
          </div>
          <div className="dash-anniversary-items">
            {anniversaries.slice(0, 3).map(a => (
              <Link key={a.id} to={`/movie/${a.id}`} className="dash-anniversary-item unstyled-link">
                <span className="mono dash-anniversary-years">{a.yearsAgo}y ago</span>
                <span className="dash-anniversary-title">{a.title}</span>
                {a.rating > 0 && <span className="mono dash-anniversary-rating">{a.rating}/10</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="dash-grid">
        <div className="dash-recent">
          <header className="dash-section-head">
            <div>

              <h2 className="dash-section-title">Recently watched</h2>
            </div>
            {logs.length > 5 && (
              <Link to="/diary" className="dash-section-link">
                View diary <ArrowRight size={14} />
              </Link>
            )}
          </header>

          {recentLogs.length > 0 ? (
            <ol className="dash-recent-list">
              {recentLogs.map(log => (
                <li key={log.id}>
                  <Link to={`/movie/${log.id}`} className="dash-recent-item unstyled-link">
                    <DateStamp dateString={log.dateWatched} />
                    <div className="dash-recent-body">
                      <span className="dash-recent-title">{log.title}{log.type === 'tv_series' && <small style={{display:'block'}}>{episodeLabel(log)}</small>}</span>
                      <span className="dash-recent-meta">
                        {log.year && <span>{log.year}</span>}
                        {log.director && <span>· {log.director}</span>}
                        {log.rating > 0 && <span className="dash-recent-rating">· {log.rating}/10</span>}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon"><Film size={20} /></div>
              <h3>No entries yet</h3>
              <p>Log the first film you remember watching — or the one you finished last night.</p>
              <button className="btn btn-accent" onClick={() => navigate('/log')}>
                <PlusCircle size={16} /> Log your first entry
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Bottom band — top recommendation from the Discover graph */}
      {topPick && (
        <section className="dash-rewatch">
          <div className="dash-rewatch-poster-wrap">
            {topPick.posterPath ? (
              <img
                src={getPosterUrl(topPick.posterPath, 'w342')}
                alt={topPick.title}
                className="dash-rewatch-poster"
              />
            ) : (
              <div className="dash-rewatch-poster dash-rewatch-poster-empty">
                <Film size={28} />
              </div>
            )}
          </div>
          <div className="dash-rewatch-body">
            <span className="eyebrow"><Sparkles size={12} /> Recommended for you</span>
            <h3 className="dash-rewatch-title">{topPick.title}</h3>
            <p className="dash-rewatch-reason">
              {topPickFallback
                ? 'A popular pick across DiaryFLIX.'
                : topPick.becauseTitle
                  ? `Because you watched ${topPick.becauseTitle}.`
                  : 'Picked from your watch history.'}
            </p>
            <div className="dash-rewatch-actions">
              <Link to="/discover" className="btn btn-accent">
                See all picks
              </Link>
              <span className="mono dash-rewatch-meta">
                {topPick.year || 'Selected for you'}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function WishlistDueBanner() {
  const { today: dueToday, overdue } = bucketWishlist(getAllWishlist());
  const total = dueToday.length + overdue.length;
  if (total === 0) return null;

  let label;
  if (dueToday.length > 0 && overdue.length > 0) {
    label = `On your watchlist for today + ${overdue.length} previously planned`;
  } else if (dueToday.length > 0) {
    label = 'On your watchlist for today';
  } else {
    label = `${overdue.length} previously planned films`;
  }

  const items = [...dueToday, ...overdue].slice(0, 4);

  return (
    <section className="dash-wishlist-due">
      <div className="dash-wishlist-due-label">
        <Bookmark size={14} /> {label}
      </div>
      <ul className="dash-wishlist-due-list">
        {items.map(item => (
          <li key={item.id}>
            <Link to={`/log?wishlistId=${encodeURIComponent(item.id)}`} className="dash-wishlist-due-item unstyled-link">
              <span className="dash-wishlist-due-title">{item.title}</span>
              {item.year && <span className="mono dash-wishlist-due-year">{item.year}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/wishlist" className="dash-section-link">
        Open watchlist <ArrowRight size={14} />
      </Link>
    </section>
  );
}

function DateStamp({ dateString }) {
  if (!dateString) {
    return (
      <div className="date-stamp date-stamp-empty" aria-hidden="true">
        <span className="mono">—</span>
      </div>
    );
  }
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  return (
    <div className="date-stamp" aria-hidden="true">
      <span className="date-stamp-day">{d.getDate()}</span>
      <span className="date-stamp-mon mono">{MONTH_FULL[d.getMonth()].slice(0, 3).toUpperCase()}</span>
      <span className="date-stamp-year mono">{d.getFullYear()}</span>
    </div>
  );
}

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}
