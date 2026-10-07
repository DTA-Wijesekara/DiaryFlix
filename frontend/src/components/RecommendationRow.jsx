import { Sparkles } from 'lucide-react';
import { getPosterUrl } from '../services/tmdb';
import './RecommendationRow.css';

// A horizontally-scrolling row of recommended movies.
// `items` come from the backend recommendation graph (read-only — these are
// not the user's own logs, so they don't link to a diary entry).
export default function RecommendationRow({ title, subtitle, items = [] }) {
  if (items.length === 0) return null;

  return (
    <section className="rec-row">
      <div className="rec-row-head">
        <h3 className="rec-row-title">{title}</h3>
        {subtitle && <p className="rec-row-subtitle">{subtitle}</p>}
      </div>

      <div className="rec-row-track">
        {items.map((item) => {
          const poster = item.posterPath ? getPosterUrl(item.posterPath) : null;
          const pct = item.score != null
            ? Math.min(100, Math.round(item.score * 100))
            : item.weight != null
              ? Math.round(item.weight * 100)
              : null;

          return (
            <article className="rec-card" key={item.id} title={item.title}>
              <div className="rec-card-poster-wrap">
                {poster ? (
                  <img src={poster} alt="" className="rec-card-poster" loading="lazy" />
                ) : (
                  <div className="rec-card-poster rec-card-poster-empty">
                    <span>{item.title?.charAt(0) || '?'}</span>
                  </div>
                )}
                {pct != null && (
                  <span className="rec-card-match" aria-label={`${pct}% match`}>
                    {pct}%
                  </span>
                )}
              </div>

              <div className="rec-card-body">
                <h4 className="rec-card-title">{item.title}</h4>
                <div className="rec-card-meta">
                  {item.year && <span className="mono">{item.year}</span>}
                  {item.year && item.industry && <span className="rec-card-dot">·</span>}
                  {item.industry && <span className="rec-card-industry">{item.industry}</span>}
                </div>
                {item.becauseTitle && (
                  <p className="rec-card-because" title={`Because you watched ${item.becauseTitle}`}>
                    <Sparkles size={11} strokeWidth={2} />
                    <span>{item.becauseTitle}</span>
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
