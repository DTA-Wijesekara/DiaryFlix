import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, PlusCircle, Star, Film, Tv } from 'lucide-react';
import { getAllLogs } from '../services/storage';
import { getPosterUrl } from '../services/tmdb';
import './Diary.css';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MOOD_GLYPH = {
  stressed: 'Stressed', relaxed: 'Relaxed', happy: 'Happy', sad: 'Sad',
  bored: 'Bored', excited: 'Excited', nostalgic: 'Nostalgic', angry: 'Angry',
};

function formatDayKey(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupLogsByDay(logs) {
  const buckets = new Map();
  for (const log of logs) {
    const key = formatDayKey(log.dateWatched || log.createdAt);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(log);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({ key, date: new Date(key + 'T00:00:00'), items }));
}

export default function Diary() {
  const navigate = useNavigate();
  const logs = useMemo(() => getAllLogs(), []);
  const groups = useMemo(() => groupLogsByDay(logs), [logs]);

  const today = new Date();
  const [viewMonth, setViewMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  const years = useMemo(() => {
    const set = new Set();
    groups.forEach(g => set.add(g.date.getFullYear()));
    set.add(today.getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [groups, today]);

  const filteredGroups = useMemo(() => {
    if (!viewMonth) return groups;
    return groups.filter(g =>
      g.date.getFullYear() === viewMonth.year &&
      g.date.getMonth() === viewMonth.month
    );
  }, [groups, viewMonth]);

  const entriesThisMonth = filteredGroups.reduce((sum, g) => sum + g.items.length, 0);
  const daysWithEntry = filteredGroups.length;

  const stepMonth = (delta) => {
    setViewMonth(prev => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToMonth = (year, month) => setViewMonth({ year, month });

  return (
    <div className="diary fade-in" id="diary-page">
      <div className="page-header diary-header">
        <div>
          <span className="eyebrow">The Diary</span>
          <h1>
            <span className="diary-month-label">{MONTHS[viewMonth.month]}</span>
            <span className="diary-year-label">{viewMonth.year}</span>
          </h1>
          <p>
            {entriesThisMonth > 0
              ? <>{entriesThisMonth} {entriesThisMonth === 1 ? 'film' : 'films'} across {daysWithEntry} {daysWithEntry === 1 ? 'day' : 'days'} this month.</>
              : <>No entries yet this month. Log a watch to begin writing the page.</>}
          </p>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/log')}>
          <PlusCircle size={18} />
          New entry
        </button>
      </div>

      <div className="diary-monthbar">
        <button className="diary-nav-btn" onClick={() => stepMonth(-1)} aria-label="Previous month">
          <ChevronLeft size={18} />
        </button>
        <div className="diary-year-scroll">
          {years.map(y => (
            <button
              key={y}
              className={`diary-year-pill ${y === viewMonth.year ? 'active' : ''}`}
              onClick={() => goToMonth(y, viewMonth.month)}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="diary-month-scroll">
          {MONTHS.map((m, i) => (
            <button
              key={m}
              className={`diary-month-pill ${i === viewMonth.month ? 'active' : ''}`}
              onClick={() => goToMonth(viewMonth.year, i)}
            >
              {m.slice(0, 3)}
            </button>
          ))}
        </div>
        <button className="diary-nav-btn" onClick={() => stepMonth(1)} aria-label="Next month">
          <ChevronRight size={18} />
        </button>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><BookOpen size={22} /></div>
          <h3>A blank page in {MONTHS[viewMonth.month]}</h3>
          <p>Every screening you log in this month will appear here, dated and bound together like pages in a journal.</p>
          <button className="btn btn-accent" onClick={() => navigate('/log')}>
            <PlusCircle size={16} /> Log a film
          </button>
        </div>
      ) : (
        <ol className="diary-timeline">
          {filteredGroups.map((g, gi) => (
            <DiaryDay key={g.key} group={g} index={gi} />
          ))}
        </ol>
      )}
    </div>
  );
}

function DiaryDay({ group, index }) {
  const { date, items } = group;
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  return (
    <li className="diary-day slide-up" style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}>
      <div className="diary-day-date">
        <span className="diary-day-dow">{WEEKDAY[date.getDay()].slice(0, 3)}</span>
        <span className="diary-day-num">{date.getDate()}</span>
        <span className="diary-day-mon">{MONTHS[date.getMonth()].slice(0, 3)}</span>
        {isToday && <span className="diary-today-pin">Today</span>}
      </div>

      <div className="diary-day-body">
        <time className="diary-day-full" dateTime={date.toISOString()}>
          {WEEKDAY[date.getDay()]}, {MONTHS[date.getMonth()]} {date.getDate()}, {date.getFullYear()}
        </time>

        <div className="diary-entries">
          {items.map((log) => (
            <DiaryEntry key={log.id} log={log} />
          ))}
        </div>
      </div>
    </li>
  );
}

function DiaryEntry({ log }) {
  const poster = log.posterUrl || (log.posterPath ? getPosterUrl(log.posterPath, 'w185') : null);
  const isTv = log.type === 'tv_series';
  const snippet = (log.notes || log.overview || '').trim();
  const trimmed = snippet.length > 180 ? snippet.slice(0, 180).trimEnd() + '…' : snippet;

  return (
    <Link to={`/movie/${log.id}`} className="diary-entry unstyled-link">
      {poster ? (
        <img src={poster} alt={log.title} className="diary-entry-poster" loading="lazy" />
      ) : (
        <div className="diary-entry-poster diary-entry-poster-empty">
          {isTv ? <Tv size={20} /> : <Film size={20} />}
        </div>
      )}

      <div className="diary-entry-body">
        <div className="diary-entry-head">
          <h3 className="diary-entry-title">
            {log.title}
            {log.year && <span className="diary-entry-year">{log.year}</span>}
          </h3>
          {log.rating > 0 && (
            <span className="diary-entry-rating" title={`${log.rating} out of 10`}>
              <Star size={12} strokeWidth={2.4} /> {log.rating}
            </span>
          )}
        </div>

        <div className="diary-entry-meta">
          {log.director && <span>dir. {log.director}</span>}
          {log.runtime > 0 && <span>{log.runtime} min</span>}
          {log.platform && <span>on {log.platform}</span>}
          {log.watchedWith && <span>with {log.watchedWith}</span>}
          {log.industry && <span className="diary-entry-ind">{log.industry}</span>}
          {log.rewatchCount > 0 && <span>rewatch #{log.rewatchCount}</span>}
        </div>

        {log.moodBefore && (
          <div className="diary-entry-mood">
            <span className="mood-dot" data-mood={log.moodBefore} style={{ background: `var(--mood-${log.moodBefore})` }} />
            Watched while {MOOD_GLYPH[log.moodBefore]?.toLowerCase() || log.moodBefore}
            {log.moodAfter && log.moodAfter !== log.moodBefore && <> · left feeling {MOOD_GLYPH[log.moodAfter]?.toLowerCase() || log.moodAfter}</>}
          </div>
        )}

        {trimmed && (
          <p className="diary-entry-snippet">{trimmed}</p>
        )}

        {log.favouriteQuotes?.length > 0 && (
          <blockquote className="diary-entry-quote">
            “{log.favouriteQuotes[0].length > 140 ? log.favouriteQuotes[0].slice(0, 140) + '…' : log.favouriteQuotes[0]}”
          </blockquote>
        )}
      </div>
    </Link>
  );
}
