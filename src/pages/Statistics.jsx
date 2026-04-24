import React, { useMemo, useEffect, useRef } from 'react';
import { BarChart3, TrendingUp, Star, Film, Users, Flame, Clock } from 'lucide-react';
import { getStats, getAllLogs } from '../services/storage';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import './Statistics.css';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, ArcElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler
);

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(12, 12, 20, 0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      titleFont: { family: 'Outfit', size: 13, weight: '600' },
      bodyFont: { family: 'Inter', size: 12 },
      padding: 12,
      cornerRadius: 8,
    },
  },
  scales: {
    x: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#8a8a9a', font: { family: 'Inter', size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: 'rgba(255,255,255,0.04)' },
      ticks: { color: '#8a8a9a', font: { family: 'Inter', size: 11 } },
      border: { display: false },
    },
  },
};

export default function Statistics() {
  const stats = useMemo(() => getStats(), []);
  const logs = useMemo(() => getAllLogs(), []);

  if (logs.length === 0) {
    return (
      <div className="statistics fade-in" id="statistics-page">
        <div className="page-header">
          <h1>Statistics 📊</h1>
          <p>Your cinema journey, visualized.</p>
        </div>
        <div className="empty-state">
          <BarChart3 size={48} />
          <h3>No data yet</h3>
          <p>Start logging movies to see beautiful statistics about your cinema journey!</p>
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
  const hoursMonthValues = Object.values(stats.hoursByMonth || {});

  const monthlyData = {
    labels: monthLabels,
    datasets: [{
      data: monthValues,
      backgroundColor: 'rgba(37, 99, 235, 0.3)',
      borderColor: '#f59e0b',
      borderWidth: 2,
      borderRadius: 6,
      hoverBackgroundColor: 'rgba(37, 99, 235, 0.5)',
    }],
  };

  const hoursMonthlyData = {
    labels: monthLabels,
    datasets: [{
      data: hoursMonthValues,
      backgroundColor: 'rgba(16, 185, 129, 0.3)',
      borderColor: '#10b981',
      borderWidth: 2,
      borderRadius: 6,
      hoverBackgroundColor: 'rgba(16, 185, 129, 0.5)',
    }],
  };

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
      borderColor: '#0c0c14',
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
        if (v >= 9) return 'rgba(16, 185, 129, 0.5)';
        if (v >= 7) return 'rgba(37, 99, 235, 0.5)';
        if (v >= 5) return 'rgba(14, 165, 233, 0.4)';
        return 'rgba(107, 114, 128, 0.4)';
      }),
      borderColor: Object.keys(stats.ratingDist).map(r => {
        const v = parseInt(r);
        if (v >= 9) return '#10b981';
        if (v >= 7) return '#f59e0b';
        if (v >= 5) return '#8b5cf6';
        return '#6b7280';
      }),
      borderWidth: 1,
      borderRadius: 4,
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
        <h1>Statistics 📊</h1>
        <p>Your cinema journey across {stats.totalWatched} movies, visualized.</p>
      </div>

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

      {/* Charts Grid */}
      <div className="stats-grid">
        {/* Monthly Trend */}
        <div className="stats-chart-card glass-card-static">
          <h3><TrendingUp size={16} /> Movies Per Month</h3>
          <div className="stats-chart-container">
            <Bar data={monthlyData} options={{
              ...CHART_DEFAULTS,
              plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
            }} />
          </div>
        </div>

        {/* Hours Watched Monthly */}
        <div className="stats-chart-card glass-card-static">
          <h3><Clock size={16} /> Hours Watched Per Month</h3>
          <div className="stats-chart-container">
            <Bar data={hoursMonthlyData} options={{
              ...CHART_DEFAULTS,
              plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
            }} />
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
                    color: '#8a8a9a',
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
