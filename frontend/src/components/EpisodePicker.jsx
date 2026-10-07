import './Series.css';
import { useRef, useState } from 'react';
import { getSeasonEpisodes } from '../services/series';

export default function EpisodePicker({ value, onChange, tmdbId }) {
  const pending = useRef(0);
  const [episodes, setEpisodes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const update = (field, next) => onChange({ ...value, [field]: next });
  async function load() {
    const request = ++pending.current;
    setLoading(true); setError('');
    try { const result = await getSeasonEpisodes(tmdbId, value.seasonNumber); if (request === pending.current) setEpisodes(result); }
    catch (err) { if (request === pending.current) setError(err.message); }
    finally { if (request === pending.current) setLoading(false); }
  }
  return <section className="tv-panel">
    <h2>Series entry</h2>
    <label className="form-label" htmlFor="tv-entry-kind">Entry type</label>
    <select id="tv-entry-kind" className="input" value={value ? 'episode' : 'series'} onChange={e => onChange(e.target.value === 'episode' ? { seasonNumber: 1, episodeNumber: 1, title: '', runtime: null, airDate: null } : null)}>
      <option value="series">General series entry</option><option value="episode">A specific episode</option>
    </select>
    {!value ? <p className="text-muted">A general entry records your thoughts about the series. It does not mark episodes as watched.</p> : <>
      <div className="form-row">
        <label>Season<input className="input" aria-label="Season number" type="number" min="0" max="1000" required value={value.seasonNumber} onChange={e => { pending.current++; setLoading(false); setEpisodes([]); onChange({ seasonNumber: Number(e.target.value), episodeNumber: 1, title: '', runtime: null, airDate: null }); }} /></label>
        <label>Episode<input className="input" aria-label="Episode number" type="number" min="1" max="10000" required value={value.episodeNumber} onChange={e => onChange({ seasonNumber: value.seasonNumber, episodeNumber: Number(e.target.value), title: '', runtime: null, airDate: null })} /></label>
      </div>
      <p className="text-muted">Season 0 is for specials.</p>
      {tmdbId && <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Find episodes in this season'}</button>}
      {error && <p role="alert">{error}</p>}
      {episodes.length > 0 && <label>Choose episode<select className="input" value="" onChange={e => onChange(episodes[Number(e.target.value)])}><option value="" disabled>Select an episode</option>{episodes.map((ep, i) => <option key={ep.episodeNumber} value={i}>E{ep.episodeNumber} — {ep.title}</option>)}</select></label>}
      <label>Episode title (optional)<input className="input" value={value.title} onChange={e => update('title', e.target.value)} maxLength="500" /></label>
      <div className="form-row">
        <label>Episode duration (minutes)<input className="input" type="number" min="1" max="10000" value={value.runtime ?? ''} onChange={e => update('runtime', e.target.value ? Number(e.target.value) : null)} /></label>
        <label>Air date (optional)<input className="input" type="date" value={value.airDate || ''} onChange={e => update('airDate', e.target.value || null)} /></label>
      </div>
      <p className="text-muted">Leave duration blank if unknown. It will not add estimated watch time.</p>
    </>}
  </section>;
}
