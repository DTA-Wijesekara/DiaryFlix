import React from 'react';
import { Star } from 'lucide-react';
import './StarRating.css';

export default function StarRating({ value = 0, onChange, max = 10, size = 22, readonly = false, id = 'star-rating' }) {
  const handleClick = (rating) => {
    if (readonly) return;
    onChange(rating === value ? 0 : rating);
  };

  return (
    <div className={`star-rating ${readonly ? 'readonly' : ''}`} id={id}>
      <div className="star-rating-stars">
        {Array.from({ length: max }, (_, i) => i + 1).map(rating => (
          <button
            key={rating}
            type="button"
            className={`star-btn ${rating <= value ? 'filled' : ''}`}
            onClick={() => handleClick(rating)}
            onMouseEnter={(e) => {
              if (!readonly) {
                e.currentTarget.parentElement.querySelectorAll('.star-btn').forEach((btn, idx) => {
                  btn.classList.toggle('preview', idx < rating);
                });
              }
            }}
            onMouseLeave={(e) => {
              if (!readonly) {
                e.currentTarget.parentElement.querySelectorAll('.star-btn').forEach(btn => {
                  btn.classList.remove('preview');
                });
              }
            }}
            disabled={readonly}
          >
            <Star size={size} />
          </button>
        ))}
      </div>
      {value > 0 && (
        <span className="star-rating-value">{value}/{max}</span>
      )}
    </div>
  );
}
