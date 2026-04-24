import React from 'react';
import './IndustryTabs.css';

const INDUSTRIES = [
  { key: 'all',         label: 'All' },
  { key: 'bollywood',   label: 'Bollywood' },
  { key: 'tollywood',   label: 'Tollywood' },
  { key: 'kollywood',   label: 'Kollywood' },
  { key: 'mollywood',   label: 'Mollywood' },
  { key: 'hollywood',   label: 'Hollywood' },
  { key: 'sandalwood',  label: 'Sandalwood' },
  { key: 'sinhala',     label: 'Sinhala' },
  { key: 'other',       label: 'Other' },
];

export default function IndustryTabs({ value = 'all', onChange, counts = {}, id = 'industry-tabs' }) {
  return (
    <div className="industry-tabs" id={id} role="tablist">
      {INDUSTRIES.map(ind => {
        const count = ind.key === 'all'
          ? Object.values(counts).reduce((a, b) => a + b, 0)
          : (counts[ind.key] || 0);
        if (ind.key !== 'all' && count === 0) return null; // only show industries with entries
        return (
          <button
            key={ind.key}
            type="button"
            role="tab"
            aria-selected={value === ind.key}
            className={`chip industry-chip ${value === ind.key ? 'active' : ''}`}
            data-industry={ind.key}
            onClick={() => onChange(ind.key)}
          >
            <span className={`industry-dot dot-${ind.key}`} aria-hidden="true" />
            <span>{ind.label}</span>
            {count > 0 && <span className="industry-count mono">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export { INDUSTRIES };
