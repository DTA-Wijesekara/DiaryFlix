import React from 'react';
import './MoodPicker.css';

const MOODS = [
  { key: 'stressed', emoji: '😰', label: 'Stressed' },
  { key: 'relaxed', emoji: '😌', label: 'Relaxed' },
  { key: 'happy', emoji: '😊', label: 'Happy' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
  { key: 'bored', emoji: '😐', label: 'Bored' },
  { key: 'excited', emoji: '🤩', label: 'Excited' },
  { key: 'nostalgic', emoji: '🥹', label: 'Nostalgic' },
  { key: 'angry', emoji: '😤', label: 'Angry' },
];

export default function MoodPicker({ value, onChange, label = 'How are you feeling?', id = 'mood-picker' }) {
  return (
    <div className="mood-picker" id={id}>
      {label && <label className="mood-picker-label">{label}</label>}
      <div className="mood-picker-grid">
        {MOODS.map(mood => (
          <button
            key={mood.key}
            type="button"
            className={`mood-btn mood-chip ${value === mood.key ? 'active' : ''}`}
            data-mood={mood.key}
            onClick={() => onChange(value === mood.key ? '' : mood.key)}
            title={mood.label}
          >
            <span className="mood-emoji">{mood.emoji}</span>
            <span className="mood-label">{mood.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { MOODS };
