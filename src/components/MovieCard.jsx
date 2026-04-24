import React from 'react';
import { Link } from 'react-router-dom';
import { Star, RefreshCw } from 'lucide-react';
import { getPosterUrl } from '../services/tmdb';
import './MovieCard.css';

const MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default function MovieCard({ log, index = 0 }) {
  const poster = log.posterUrl || (log.posterPath ? getPosterUrl(log.posterPath) : null);

  const watched = log.dateWatched ? new Date(log.dateWatched) : null;
  const validDate = watched && !Number.isNaN(watched.getTime()) ? watched : null;

  return (
    <Link
      to={`/movie/${log.id}`}
      className={`movie-card slide-up stagger-${Math.min(index % 6 + 1, 6)}`}
      id={`movie-card-${log.id}`}
      aria-label={`${log.title}${validDate ? ', watched ' + validDate.toLocaleDateString() : ''}`}
    >
      <div className="movie-card-poster-wrap">
        {poster ? (
          <img
            src={poster}
            alt=""
            className="movie-card-poster"
            loading="lazy"
          />
        ) : (
          <div className="movie-card-poster movie-card-poster-empty">
            <span>{log.title?.charAt(0) || '?'}</span>
          </div>
        )}

        {validDate && (
          <div className="movie-card-datetag" aria-hidden="true">
            <span className="movie-card-datetag-day">{validDate.getDate()}</span>
            <span className="movie-card-datetag-mon mono">{MONTH_ABBR[validDate.getMonth()]}</span>
            <span className="movie-card-datetag-year mono">{validDate.getFullYear()}</span>
          </div>
        )}

        {log.rating > 0 && (
          <span className="movie-card-rating" aria-label={`Rated ${log.rating} out of 10`}>
            <Star size={11} strokeWidth={2.4} /> {log.rating}
          </span>
        )}

        {log.rewatchCount > 0 && (
          <span className="movie-card-rewatch" title={`Rewatched ${log.rewatchCount} time${log.rewatchCount > 1 ? 's' : ''}`}>
            <RefreshCw size={10} strokeWidth={2.2} /> {log.rewatchCount}
          </span>
        )}
      </div>

      <div className="movie-card-body">
        <h4 className="movie-card-title" title={log.title}>{log.title}</h4>
        <div className="movie-card-meta">
          {log.year && <span className="mono">{log.year}</span>}
          {log.director && <span className="movie-card-dir">{log.director}</span>}
        </div>
      </div>
    </Link>
  );
}
