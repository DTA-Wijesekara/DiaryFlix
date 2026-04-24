import React from 'react';
import { Plus, X, Quote } from 'lucide-react';
import './QuoteEntry.css';

export default function QuoteEntry({ quotes = [], onChange }) {
  const addQuote = () => {
    onChange([...quotes, '']);
  };

  const updateQuote = (index, value) => {
    const updated = [...quotes];
    updated[index] = value;
    onChange(updated);
  };

  const removeQuote = (index) => {
    onChange(quotes.filter((_, i) => i !== index));
  };

  return (
    <div className="quote-entry">
      <label className="quote-entry-label">
        <Quote size={14} />
        Favourite Quotes
      </label>

      {quotes.map((quote, i) => (
        <div key={i} className="quote-entry-row">
          <div className="quote-entry-mark">"</div>
          <textarea
            className="textarea quote-textarea"
            placeholder="Enter a memorable quote..."
            value={quote}
            onChange={(e) => updateQuote(i, e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon quote-remove-btn"
            onClick={() => removeQuote(i)}
            title="Remove quote"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <button type="button" className="btn btn-secondary quote-add-btn" onClick={addQuote}>
        <Plus size={16} />
        Add Quote
      </button>
    </div>
  );
}
