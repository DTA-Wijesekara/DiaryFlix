import React, { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusCircle, ArrowRight, Calendar, Clock, Film, BookOpen, Flame, Sparkles
} from 'lucide-react';
import { getAllLogs, getStats } from '../services/storage';
import { getRewatchSuggestions, getAnniversaryWatches } from '../services/rewatchEngine';
import { getPosterUrl } from '../services/tmdb';
import { useAuth } from '../context/AuthContext';
import CalendarHeatmap from '../components/CalendarHeatmap';
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
  const navigate = useNavigate();
  const { user } = useAuth();

  const logs = useMemo(() => getAllLogs(), []);
  const stats = useMemo(() => getStats(), []);

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const latestWatch = logs[0];
  const daysSinceLast = latestWatch?.dateWatched
    ? daysBetween(today, new Date(latestWatch.dateWatched))
    : null;

  const recentLogs = logs.slice(0, 5);

  const rewatch = useMemo(() => {
    const s = getRewatchSuggestions(null, 1);
    return s[0] || null;
  }, []);

  const anniversaries = useMemo(() => getAnniversaryWatches(), []);
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
                ? 'You logged a film today. Keep writing.'
                : daysSinceLast === 1
                  ? 'You logged yesterday. What did you watch today?'
                  : `It has been ${daysSinceLast} days since your last entry.`}
          </p>
        </div>

        <div className="dash-masthead-actions">
          <Link to="/diary" className="btn btn-secondary">
            <BookOpen size={16} /> Open diary
          </Link>
          <button className="btn btn-primary btn-lg" onClick={() => navigate('/log')}>
            <PlusCircle size={18} /> New entry
          </button>
        </div>
      </header>

      {/* On this day — prominent when it triggers */}
      {hasAnniversary && (
        <section className="dash-anniversary">
          <div className="dash-anniversary-label">
            <Calendar size={14} /> On this day in cinema
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

      {/* Top row — stat strip (restrained, editorial) */}
      <section className="dash-stats">
        <StatBlock
          label="Entries"
          value={stats?.totalWatched || 0}
          hint="films in diary"
        />
        <StatBlock
          label="Hours"
          value={Number(stats?.totalHoursWatched || 0).toFixed(0)}
          hint="of cinema"
        />
        <StatBlock
          label="Avg rating"
          value={stats?.avgRating || '—'}
          hint="out of 10"
        />
        <StatBlock
          label="Longest streak"
          value={stats?.maxStreak || 0}
          hint={stats?.maxStreak === 1 ? 'day' : 'days'}
        />
      </section>

      {/* Calendar + recent entries side-by-side */}
      <section className="dash-grid">
        <div className="dash-heatmap">
          <header className="dash-section-head">
            <div>
              <span className="eyebrow">Watch activity</span>
              <h2 className="dash-section-title">The last 12 months</h2>
            </div>
          </header>
          <CalendarHeatmap logs={logs} />
        </div>

        <div className="dash-recent">
          <header className="dash-section-head">
            <div>
              <span className="eyebrow">Recent pages</span>
              <h2 className="dash-section-title">Last five entries</h2>
            </div>
            {logs.length > 5 && (
              <Link to="/diary" className="dash-section-link">
                Full diary <ArrowRight size={14} />
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
                      <span className="dash-recent-title">{log.title}</span>
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

      {/* Bottom band — rewatch suggestion */}
      {rewatch && (
        <section className="dash-rewatch">
          <div className="dash-rewatch-poster-wrap">
            {(rewatch.posterUrl || rewatch.posterPath) ? (
              <img
                src={rewatch.posterUrl || getPosterUrl(rewatch.posterPath, 'w342')}
                alt={rewatch.title}
                className="dash-rewatch-poster"
              />
            ) : (
              <div className="dash-rewatch-poster dash-rewatch-poster-empty">
                <Film size={28} />
              </div>
            )}
          </div>
          <div className="dash-rewatch-body">
            <span className="eyebrow"><Sparkles size={12} /> Perhaps tonight</span>
            <h3 className="dash-rewatch-title">{rewatch.title}</h3>
            <p className="dash-rewatch-reason">{rewatch.reason}</p>
            <div className="dash-rewatch-actions">
              <button className="btn btn-accent" onClick={() => navigate(`/movie/${rewatch.id}`)}>
                Open entry
              </button>
              <span className="mono dash-rewatch-meta">
                {rewatch.rating}/10 · {rewatch.daysSinceWatch} days ago
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function StatBlock({ label, value, hint }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat-label">{label}</span>
      <span className="dash-stat-value mono">{value}</span>
      <span className="dash-stat-hint">{hint}</span>
    </div>
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
