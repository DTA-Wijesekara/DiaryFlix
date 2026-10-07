import CalendarHeatmap from '../components/CalendarHeatmap';
import useLogRevision from '../hooks/useLogRevision';
import { useMemo } from 'react';
import { BarChart3, TrendingUp, Star, Film, Users, Flame, Clock, Calendar, Repeat, Award } from 'lucide-react';
import { getStats, getAllLogs } from '../services/storage';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import './Statistics.css';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend
);

// Light editorial palette to match the rest of the app.
const TICK_COLOR = '#64748b';
const GRID_COLOR = 'rgba(15, 23, 42, 0.06)';

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(11, 18, 32, 0.92)',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleFont: { family: 'Inter', size: 13, weight: '600' },
      bodyFont: { family: 'Inter', size: 12 },
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { color: GRID_COLOR },
      ticks: { color: TICK_COLOR, font: { family: 'Inter', size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: GRID_COLOR },
      ticks: { color: TICK_COLOR, font: { family: 'Inter', size: 11 } },
      border: { display: false },
    },
  },
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function formatMonth(key) {
  const [y, m] = key.split('-');
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Statistics() {
  const revision = useLogRevision();
  const stats = useMemo(() => { void revision; return getStats(); }, [revision]);
  const logs = useMemo(() => { void revision; return getAllLogs(); }, [revision]);

  if (logs.length === 0) {
    return (
      <div className="statistics fade-in" id="statistics-page">
        <div className="page-header">
          <h1>Statistics</h1>
          <p>Your cinema journey, visualized.</p>
        </div>
        <div className="empty-state">
          <BarChart3 size={48} />
          <h3>No data yet</h3>
          <p>Start logging films or episodes to see beautiful statistics about your cinema journey!</p>
        </div>
      </div>
    );
  }

  // Monthly trend data
  const monthLabels = Object.keys(stats.byMonth).map(k => {
    const [y, m] = k.split('-');
    return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  });
  const monthValues = Object.values(stats.byMonth);

  const monthlyData = {
    labels: monthLabels,
    datasets: [{
      data: monthValues,
      backgroundColor: 'rgba(37, 99, 235, 0.85)',
      borderRadius: 6,
      hoverBackgroundColor: '#1d4ed8',
      maxBarThickness: 48,
    }],
  };

  // ── Highlights — plain-language takeaways derived from the data ──
  const insights = [];
  const industryEntries = Object.entries(stats.byIndustry).sort((a, b) => b[1] - a[1]);
  if (industryEntries.length) {
    const [name, count] = industryEntries[0];
    insights.push({ icon: Film, label: 'Favorite industry', value: cap(name), sub: `${count} ${count === 1 ? 'entry' : 'entries'}` });
  }
  if (stats.topRated[0]) {
    insights.push({ icon: Star, label: 'Top rated', value: stats.topRated[0].title, sub: `${stats.topRated[0].rating}/10` });
  }
  if (stats.maxStreak > 0) {
    insights.push({ icon: Flame, label: 'Longest streak', value: `${stats.maxStreak} ${stats.maxStreak === 1 ? 'day' : 'days'}`, sub: 'in a row' });
  }
  const monthEntries = Object.entries(stats.byMonth).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (monthEntries.length) {
    const [key, count] = monthEntries[0];
    insights.push({ icon: Calendar, label: 'Busiest month', value: formatMonth(key), sub: `${count} ${count === 1 ? 'entry' : 'entries'}` });
  }
  if (stats.totalRewatches > 0) {
    insights.push({ icon: Repeat, label: 'Rewatches', value: stats.totalRewatches, sub: 'films revisited' });
  }
  if (stats.topDirectors[0]) {
    const [name, count] = stats.topDirectors[0];
    insights.push({ icon: Award, label: 'Most-watched director', value: name, sub: `${count} ${count === 1 ? 'entry' : 'entries'}` });
  }

  // Industry doughnut
  const industryColors = {
    bollywood: '#f59e0b',
    tollywood: '#8b5cf6',
    kollywood: '#10b981',
    mollywood: '#ec4899',
    hollywood: '#3b82f6',
    sandalwood: '#f97316',
    sinhala: '#eab308',
    other: '#6b7280',
  };

  const industryData = {
    labels: Object.keys(stats.byIndustry).map(k => k.charAt(0).toUpperCase() + k.slice(1)),
    datasets: [{
      data: Object.values(stats.byIndustry),
      backgroundColor: Object.keys(stats.byIndustry).map(k => industryColors[k] || '#6b7280'),
      borderColor: '#ffffff',
      borderWidth: 3,
      hoverOffset: 8,
    }],
  };

  // Rating distribution
  const ratingData = {
    labels: Object.keys(stats.ratingDist),
    datasets: [{
      data: Object.values(stats.ratingDist),
      backgroundColor: Object.keys(stats.ratingDist).map(r => {
        const v = parseInt(r);
        if (v >= 9) return '#10b981';
        if (v >= 7) return '#2563eb';
        if (v >= 5) return '#0ea5e9';
        return '#94a3b8';
      }),
      borderRadius: 4,
      maxBarThickness: 40,
    }],
  };

  // Mood-Rating correlation
  const moodColors = {
    stressed: '#ef4444', relaxed: '#22d3ee', happy: '#fbbf24',
    sad: '#6366f1', bored: '#a78bfa', excited: '#f97316',
    nostalgic: '#ec4899', angry: '#dc2626',
  };

  const moodEmojis = {
    stressed: '😰', relaxed: '😌', happy: '😊', sad: '😢',
    bored: '😐', excited: '🤩', nostalgic: '🥹', angry: '😤',
  };

  return (
    <div className="statistics fade-in" id="statistics-page">
      <div className="page-header">
        <h1>Statistics</h1>
        <p>Your cinema journey across {stats.totalFilms} film watches and {stats.totalEpisodes} episode watches, visualized.</p>
      </div>
      <details className="quiet-disclosure stats-activity"><summary>Watch activity over the last year</summary><CalendarHeatmap logs={logs} /></details>

      {/* Top Stats Row */}
      <div className="stats-top-row">
        <div className="stats-highlight glass-card-static">
          <Film size={20} />
          <div>
            <span className="stats-highlight-value">{stats.totalWatched}</span>
            <span className="stats-highlight-label">Total Watched</span>
          </div>
        </div>
        <div className="stats-highlight glass-card-static">
          <Clock size={20} />
          <div>
            <span className="stats-highlight-value">{stats.totalHoursWatched || '0.0'}h</span>
            <small>{stats.unknownDuration} entries have unknown duration</small>
            <span className="stats-highlight-label">Total Time</span>
          </div>
        </div>
        <div className="stats-highlight glass-card-static">
          <TrendingUp size={20} />
          <div>
            <span className="stats-highlight-value">{stats.avgHoursPerDay || '0.0'}h</span>
            <span className="stats-highlight-label">Daily Avg</span>
          </div>
        </div>
        <div className="stats-highlight glass-card-static">
          <Star size={20} />
          <div>
            <span className="stats-highlight-value">{stats.avgRating}</span>
            <span className="stats-highlight-label">Avg Rating</span>
          </div>
        </div>
      </div>

      {/* Highlights — the useful takeaways */}
      {insights.length > 0 && (
        <div className="stats-insights">
          {insights.map((it) => (
            <div key={it.label} className="stats-insight glass-card-static">
              <div className="stats-insight-icon"><it.icon size={16} strokeWidth={2} /></div>
              <div className="stats-insight-body">
                <span className="stats-insight-label">{it.label}</span>
                <span className="stats-insight-value" title={String(it.value)}>{it.value}</span>
                <span className="stats-insight-sub">{it.sub}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts Grid */}
      <div className="stats-grid">
        {/* Monthly Trend */}
        <div className="stats-chart-card glass-card-static">
          <h3><TrendingUp size={16} /> Diary Entries Per Month</h3>
          <div className="stats-chart-container">
            <Bar data={monthlyData} options={CHART_DEFAULTS} />
          </div>
        </div>

        {/* Industry Breakdown */}
        <div className="stats-chart-card glass-card-static">
          <h3><Film size={16} /> By Industry</h3>
          <div className="stats-chart-container stats-doughnut-container">
            <Doughnut data={industryData} options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: '65%',
              plugins: {
                legend: {
                  position: 'right',
                  labels: {
                    color: TICK_COLOR,
                    font: { family: 'Inter', size: 11 },
                    padding: 12,
                    usePointStyle: true,
                    pointStyleWidth: 10,
                  },
                },
                tooltip: CHART_DEFAULTS.plugins.tooltip,
              },
            }} />
          </div>
        </div>

        {/* Rating Distribution */}
        <div className="stats-chart-card glass-card-static">
          <h3><Star size={16} /> Rating Distribution</h3>
          <div className="stats-chart-container">
            <Bar data={ratingData} options={{
              ...CHART_DEFAULTS,
              scales: {
                ...CHART_DEFAULTS.scales,
                x: {
                  ...CHART_DEFAULTS.scales.x,
                  title: { display: true, text: 'Rating', color: '#55556a', font: { size: 11, family: 'Inter' } },
                },
                y: {
                  ...CHART_DEFAULTS.scales.y,
                  title: { display: true, text: 'Count', color: '#55556a', font: { size: 11, family: 'Inter' } },
                },
              },
            }} />
          </div>
        </div>

        {/* Mood vs Rating */}
        {Object.keys(stats.moodAvgRating).length > 0 && (
          <div className="stats-chart-card glass-card-static">
            <h3>🎭 Mood vs Avg Rating</h3>
            <div className="stats-mood-bars">
              {Object.entries(stats.moodAvgRating)
                .sort((a, b) => b[1] - a[1])
                .map(([mood, avg]) => (
                  <div key={mood} className="stats-mood-bar-row">
                    <span className="stats-mood-emoji">{moodEmojis[mood] || '🎭'}</span>
                    <span className="stats-mood-label">{mood}</span>
                    <div className="stats-mood-bar-track">
                      <div
                        className="stats-mood-bar-fill"
                        style={{
                          width: `${(avg / 10) * 100}%`,
                          background: moodColors[mood] || '#6b7280',
                        }}
                      />
                    </div>
                    <span className="stats-mood-value">{avg}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Top Actors/Actresses */}
        {stats.topActors.length > 0 && (
          <div className="stats-chart-card glass-card-static">
            <h3><Users size={16} /> Top Actors & Actresses</h3>
            <div className="stats-leaderboard">
              {stats.topActors.map(([name, count], i) => (
                <div key={name} className="stats-leader-row">
                  <span className="stats-leader-rank">#{i + 1}</span>
                  <span className="stats-leader-name">{name}</span>
                  <span className="stats-leader-count">{count} film{count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Directors */}
        {stats.topDirectors.length > 0 && (
          <div className="stats-chart-card glass-card-static">
            <h3>🎬 Top Directors</h3>
            <div className="stats-leaderboard">
              {stats.topDirectors.map(([name, count], i) => (
                <div key={name} className="stats-leader-row">
                  <span className="stats-leader-rank">#{i + 1}</span>
                  <span className="stats-leader-name">{name}</span>
                  <span className="stats-leader-count">{count} film{count > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Rated */}
        {stats.topRated.length > 0 && (
          <div className="stats-chart-card glass-card-static stats-top-rated">
            <h3><Star size={16} /> Your Top Rated</h3>
            <div className="stats-top-list">
              {stats.topRated.map((log, i) => (
                <div key={log.id} className="stats-top-item">
                  <span className="stats-top-rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                  </span>
                  <span className="stats-top-name">{log.title}</span>
                  <span className="stats-top-rating">⭐ {log.rating}/10</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
