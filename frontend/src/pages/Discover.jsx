import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Sparkles } from 'lucide-react';
import { fetchRecommendations } from '../services/recommendations';
import RecommendationRow from '../components/RecommendationRow';
import './Discover.css';

// A "because you watched X" row is only worth showing if it has enough items;
// otherwise the picks live in the blended "Recommended for You" row.
const MIN_GROUP_SIZE = 3;
const MAX_GROUPS = 3;

export default function Discover() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ recommendations: [], fallback: false, stats: null });

  useEffect(() => {
    let active = true;
    fetchRecommendations()
      .then((res) => { if (active) setData(res); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const { recommendations, fallback, stats } = data;

  // Build optional "Because you watched X" rows from the strongest source movies.
  const groups = useMemo(() => {
    if (fallback) return [];
    const bySource = new Map();
    for (const rec of recommendations) {
      if (!rec.becauseTitle) continue;
      if (!bySource.has(rec.becauseTitle)) bySource.set(rec.becauseTitle, []);
      bySource.get(rec.becauseTitle).push(rec);
    }
    return [...bySource.entries()]
      .filter(([, items]) => items.length >= MIN_GROUP_SIZE)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_GROUPS)
      .map(([source, items]) => ({ source, items }));
  }, [recommendations, fallback]);

  if (loading) {
    return (
      <div className="discover fade-in">
        <DiscoverHeader subtitle="Finding movies picked from your taste…" />
        <div className="rec-row">
          <div className="discover-skeleton">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="discover-skeleton-card" />)}
          </div>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="discover fade-in">
        <DiscoverHeader subtitle="Movies picked from your taste." />
        <div className="discover-empty">
          <div className="discover-empty-icon"><Sparkles size={28} strokeWidth={1.6} /></div>
          <h3>No recommendations yet</h3>
          <p>Log a few films in your diary and we'll start suggesting what to watch next.</p>
          <Link to="/log" className="discover-empty-cta">Log a watch</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="discover fade-in">
      <DiscoverHeader
        subtitle={fallback
          ? 'Popular across DiaryFLIX — log some films to personalize these.'
          : 'Movies picked from your watch history.'}
        stats={stats}
      />

      <RecommendationRow
        title={fallback ? 'Popular on DiaryFLIX' : 'Recommended for You'}
        subtitle={fallback ? 'Trending across all members' : 'Your top blended picks'}
        items={recommendations}
      />

      {groups.map(({ source, items }) => (
        <RecommendationRow
          key={source}
          title={`More like ${source}`}
          items={items}
        />
      ))}
    </div>
  );
}

function DiscoverHeader({ subtitle, stats }) {
  return (
    <div className="discover-header">
      <div className="discover-header-main">
        <Link to="/rewatch" className="btn btn-secondary">Find a film to watch again</Link>
        <h1 className="discover-title">
          <Compass size={24} strokeWidth={2} />
          Discover
        </h1>
        <p className="discover-subtitle">{subtitle}</p>
      </div>
      {stats && stats.nodeCount > 0 && (
        <span className="discover-graph-badge" title="Built from a recommendation graph of all watch logs">
          {stats.nodeCount} films · {stats.edgeCount} links
        </span>
      )}
    </div>
  );
}
