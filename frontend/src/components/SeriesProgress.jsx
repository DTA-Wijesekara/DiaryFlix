import './Series.css';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLogsFromServer } from '../services/storage';
import { apiFetch } from '../services/auth';
import { getSeriesProgress, refreshSeriesCatalog } from '../services/series';

export default function SeriesProgress({ log }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bulkDate, setBulkDate] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    getSeriesProgress(log.movieId).then(value => { if (active) setData(value); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [log.movieId]);
  const record = episode => navigate('/log', { state: { rewatchOf: { ...log, episode, allowRewatch: episode.watchCount > 0 } } });
  async function bulk(season) {
    const episodes = data.episodes.filter(ep => ep.seasonNumber === season && !ep.watchCount && ep.airDate && ep.airDate <= bulkDate);
    if (!episodes.length || episodes.length > 100) { setError('Choose a date with 1–100 unwatched released episodes.'); return; }
    if (!window.confirm(`Record ${episodes.length} episodes as watched on ${bulkDate}? Existing watches will be skipped.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiFetch(`/series/${encodeURIComponent(log.movieId)}/watches`, { method: 'POST', body: { episodeIds: episodes.map(ep => ep.id), dateWatched: bulkDate, requestId: crypto.randomUUID() } });
      await fetchLogsFromServer({ strict: true });
      setData(await getSeriesProgress(log.movieId));
      setNotice(`${result.added} episodes logged; ${result.skipped} already watched episodes skipped.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function refresh() {
    setBusy(true); setError('');
    try { setData(await refreshSeriesCatalog(log.movieId, log.tmdbId)); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function status(value) {
    setBusy(true); setError('');
    try { await apiFetch(`/series/${encodeURIComponent(log.movieId)}/status`, { method: 'PUT', body: { status: value } }); setData(prev => ({ ...prev, status: value })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="tv-panel" aria-label="Series progress">
    <h2>Series progress</h2>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {log.tmdbId && <button className="btn btn-secondary" disabled={busy} onClick={refresh}>{busy ? 'Updating…' : 'Refresh seasons and episodes'}</button>}
    {data && <>
      <p>{data.progress.watched} of {data.progress.total} known released episodes watched{data.progress.finished ? ' · Finished' : data.progress.caughtUp ? ' · Caught up' : ''}</p>
      {!data.catalogComplete && <p className="text-muted">The catalog is incomplete. General series entries and specials do not count toward this progress.</p>}
      <label>My series status<select className="input" value={data.status} disabled={busy} onChange={e => status(e.target.value)}><option value="watching">Watching</option><option value="on_hold">On hold</option><option value="dropped">Dropped</option><option value="completed">Completed</option></select></label>
      {data.progress.nextEpisode && <button className="btn btn-primary" onClick={() => record(data.progress.nextEpisode)}>Log next episode · S{data.progress.nextEpisode.seasonNumber} E{data.progress.nextEpisode.episodeNumber}</button>}
      {[...new Set(data.episodes.map(ep => ep.seasonNumber))].map(season => <details key={season}>
        <summary>{season === 0 ? 'Specials' : `Season ${season}`}</summary>
        <div className="tv-bulk"><label>Watch date for this season<input type="date" className="input" value={bulkDate} onChange={e => setBulkDate(e.target.value)} /></label>
          <p>Records only unwatched episodes released by this date, without ratings or notes.</p>
          <button className="btn btn-secondary" disabled={busy || !bulkDate} onClick={() => bulk(season)}>Log unwatched episodes in this season</button></div>
        <ul>{data.episodes.filter(ep => ep.seasonNumber === season).map(ep => <li key={ep.id} style={{ marginBlock: '12px' }}>
          E{ep.episodeNumber} · {ep.title || 'Untitled episode'} {ep.watchCount > 0 ? ' · Watched' : ''}{' '}
          <button className="btn btn-secondary btn-sm" onClick={() => record(ep)}>{ep.watchCount ? 'Log another watch' : 'Log episode'}</button>
        </li>)}</ul>
      </details>)}
    </>}
  </section>;
}
