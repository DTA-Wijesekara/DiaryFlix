import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import './CalendarHeatmap.css';

const DOW = ['Mon', 'Wed', 'Fri'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function longDate(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * A GitHub-style heatmap of your last 52 weeks of watching.
 * @param {Array} logs - watch logs with dateWatched
 */
export default function CalendarHeatmap({ logs = [] }) {
  const [hover, setHover] = useState(null);

  const { weeks, monthMarkers, byDate, max } = useMemo(() => {
    const byDate = new Map();
    for (const log of logs) {
      if (!log.dateWatched) continue;
      const k = fmtKey(new Date(log.dateWatched));
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(log);
    }

    // 53 columns of weeks, ending this week
    const today = new Date();
    const end = new Date(today);
    // Align end to Saturday so each column is a full week
    const dayOfWeek = end.getDay(); // 0 Sun .. 6 Sat
    end.setDate(end.getDate() + (6 - dayOfWeek));
    const start = new Date(end);
    start.setDate(end.getDate() - (53 * 7 - 1));
    // Align start to Sunday
    start.setDate(start.getDate() - start.getDay());

    const weeks = [];
    const cursor = new Date(start);
    let max = 0;
    const monthMarkers = [];
    let lastMonth = -1;

    while (cursor <= end) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const dayCopy = new Date(cursor);
        const key = fmtKey(dayCopy);
        const count = byDate.get(key)?.length || 0;
        if (count > max) max = count;
        week.push({ key, date: dayCopy, count, items: byDate.get(key) || [] });
        cursor.setDate(cursor.getDate() + 1);
      }
      // Use the month of the first day of this week for the label
      const m = week[0].date.getMonth();
      if (m !== lastMonth && week[0].date.getDate() <= 7) {
        monthMarkers.push({ month: m, col: weeks.length });
        lastMonth = m;
      }
      weeks.push(week);
    }

    return { weeks, monthMarkers, byDate, max };
  }, [logs]);

  const intensity = (count) => {
    if (count === 0) return 0;
    if (max <= 1) return 4;
    const ratio = count / max;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.5) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
  };

  const totalWatched = Array.from(byDate.values()).reduce((s, arr) => s + arr.length, 0);
  const totalActiveDays = byDate.size;

  return (
    <div className="heatmap">
      <div className="heatmap-scroll">
        <div className="heatmap-grid" role="grid" aria-label="Watch activity heatmap">
          <div className="heatmap-months" aria-hidden="true">
            {monthMarkers.map(m => (
              <span key={m.col} style={{ gridColumnStart: m.col + 1 }}>{MONTHS[m.month]}</span>
            ))}
          </div>

          <div className="heatmap-dow" aria-hidden="true">
            {DOW.map(d => <span key={d}>{d}</span>)}
          </div>

          <div className="heatmap-cells">
            {weeks.map((week, wi) => (
              <div key={wi} className="heatmap-week">
                {week.map((cell) => {
                  const i = intensity(cell.count);
                  const isToday = fmtKey(new Date()) === cell.key;
                  const isFuture = cell.date > new Date();
                  return (
                    <div
                      key={cell.key}
                      className={`heatmap-cell i-${i} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}`}
                      role="gridcell"
                      onMouseEnter={() => setHover(cell)}
                      onFocus={() => setHover(cell)}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                      tabIndex={cell.count > 0 ? 0 : -1}
                      aria-label={`${cell.count} films on ${longDate(cell.date)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-foot">
        <span className="heatmap-summary mono">
          {totalWatched} films · {totalActiveDays} days in the last year
        </span>
        <div className="heatmap-legend" aria-hidden="true">
          <span className="legend-label">Less</span>
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className={`heatmap-cell i-${i}`} />
          ))}
          <span className="legend-label">More</span>
        </div>
      </div>

      {hover && hover.count > 0 && (
        <div className="heatmap-tooltip">
          <strong>{hover.count} {hover.count === 1 ? 'film' : 'films'}</strong>
          <span className="mono">{longDate(hover.date)}</span>
          <ul>
            {hover.items.slice(0, 3).map(it => (
              <li key={it.id}>
                <Link to={`/movie/${it.id}`} className="unstyled-link">{it.title}</Link>
              </li>
            ))}
            {hover.items.length > 3 && <li className="mono">+{hover.items.length - 3} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
