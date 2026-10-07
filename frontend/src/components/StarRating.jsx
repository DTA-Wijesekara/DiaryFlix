import './StarRating.css';
export default function StarRating({ value = 0, onChange, max = 10, readonly = false, id = 'star-rating' }) {
  if (readonly) return <span className="rating-readout">{value > 0 ? `${value} / ${max}` : 'Not rated'}</span>;
  return <div className="rating-picker" id={id}>
    <div className="rating-options" role="group" aria-label={`Your rating out of ${max}`}>
      {Array.from({ length: max }, (_, i) => i + 1).map(rating => <button key={rating} type="button" aria-label={`${rating} out of ${max}`} aria-pressed={value === rating} className={value === rating ? 'selected' : ''} onClick={() => onChange(value === rating ? 0 : rating)}>{rating}</button>)}
    </div>
    <span className="text-muted" aria-live="polite">{value ? `${value} / ${max}` : 'Not rated'}</span>
    {value > 0 && <button type="button" className="btn btn-link" onClick={() => onChange(0)}>Clear rating</button>}
  </div>;
}
