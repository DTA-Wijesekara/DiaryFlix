import React from 'react';

export default function AuthAside({ headline, caption }) {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });

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
        <span className="auth-aside-brand-name">CineLog</span>
      </div>

      <h1 className="auth-aside-headline">{headline}</h1>

      <div className="auth-aside-meta">
        {today} · {caption}
      </div>
    </aside>
  );
}
