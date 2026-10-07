import { useState } from 'react';
import { Heart } from 'lucide-react';
import { setTitleFavourite } from '../services/storage';
import useLogRevision from '../hooks/useLogRevision';
import { getAllLogs } from '../services/storage';

export default function FavouriteButton({ movieId }) {
  useLogRevision();
  const favourite = getAllLogs().find(log => log.movieId === movieId)?.isFavourite || false;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    if (saving) return;
    setSaving(true); setError('');
    try { await setTitleFavourite(movieId, !favourite); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  return <div className="favourite-control"><button className="btn btn-secondary" aria-pressed={favourite} onClick={toggle} disabled={saving}>
    <Heart size={16} fill={favourite ? 'currentColor' : 'none'} /> {favourite ? 'Favourite' : 'Add to favourites'}
  </button>{error && <p role="alert">{error}</p>}</div>;
}
