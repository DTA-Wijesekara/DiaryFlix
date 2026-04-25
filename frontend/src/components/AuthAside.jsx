import React from 'react';

const QUOTES = [
  { text: "Cinema is a mirror by which we often see ourselves.", author: "Martin Scorsese" },
  { text: "Film is a disease. When it infects your bloodstream, it takes over as the number one hormone.", author: "Frank Capra" },
  { text: "A film is never really good unless the camera is an eye in the head of a poet.", author: "Orson Welles" },
  { text: "Every great film should seem new every time you see it.", author: "Roger Ebert" },
];

export default function AuthAside({ headline, caption }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

  const quote = QUOTES[new Date().getDate() % QUOTES.length];

  return (
    <aside className="auth-aside" aria-hidden="true">
      <div className="auth-aside-brand">
        <div className="auth-aside-brand-mark">
          <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
            <rect x="1" y="3" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M1 7H21" stroke="currentColor" strokeWidth="1.6"/>
            <circle cx="5" cy="5" r="0.8" fill="currentColor"/>
            <circle cx="8" cy="5" r="0.8" fill="currentColor"/>
            <circle cx="11" cy="5" r="0.8" fill="currentColor"/>
            <path d="M6 11L9 13L6 15V11Z" fill="currentColor"/>
          </svg>
        </div>
        <span className="auth-aside-brand-name">DiaryFLIX</span>
      </div>

      <div className="auth-aside-center">
        <h1 className="auth-aside-headline">{headline}</h1>
        <div className="auth-aside-quote">
          <p className="auth-aside-quote-text">"{quote.text}"</p>
          <p className="auth-aside-quote-author">— {quote.author}</p>
        </div>
      </div>

      <div className="auth-aside-meta">
        {today} · {caption}
      </div>
    </aside>
  );
}
