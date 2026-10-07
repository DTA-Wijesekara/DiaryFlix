import { useState } from 'react';
import { Heart, Star, BookOpen } from 'lucide-react';
import FilmArtwork from './FilmArtwork';

const entries = [
  { title: 'After the Rain', year: 2015, date: '12 JUL', note: 'A rainy Sunday. Still thinking about that ending.', rating: 9, favourite: true },
  { title: 'The Last Light', year: 2024, date: '08 NOV', note: 'One to watch again with someone I love.', rating: 8, favourite: false },
  { title: 'Somewhere, Again', year: 2015, date: '23 DEC', note: 'The soundtrack took me right back.', rating: 9, favourite: true },
];
export default function SampleJournal({ compact = false }) {
  const [filter, setFilter] = useState('all');
  const visible = entries.filter(entry => filter === 'all' || (filter === 'favourites' ? entry.favourite : entry.year === 2015));
  return <section className={`sample-journal ${compact ? 'sample-journal-compact' : ''}`} aria-label="Sample film diary">
    <div className="sample-journal-heading"><BookOpen size={19} /><span>A little collection of memories</span><span className="sample-tag">Sample diary</span></div>
    {!compact && <div className="sample-tabs" role="group" aria-label="Explore the sample diary">{[['all', 'All memories'], ['2015', 'Watched in 2015'], ['favourites', 'Favourites']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>}
    <div className="sample-entries" aria-live="polite">{visible.slice(0, compact ? 2 : 3).map(entry => <article key={entry.title} className="sample-entry">
      <FilmArtwork title={entry.title} variant={entries.indexOf(entry)} />
      <div><span className="sample-date">{entry.date} {entry.year}</span><h3>{entry.title}</h3><p>{entry.note}</p><span className="sample-rating"><Star size={13} fill="currentColor" /> {entry.rating}/10 {entry.favourite && <><Heart size={13} fill="currentColor" /> A favourite</>}</span></div>
    </article>)}</div>
    <p className="sample-disclaimer">Illustrative entries with fictional film titles.</p>
  </section>;
}
