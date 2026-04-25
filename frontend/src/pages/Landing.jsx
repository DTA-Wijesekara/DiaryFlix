import React from 'react';
import { Link } from 'react-router-dom';
import { Film, BookOpen, BarChart2, Star, ArrowRight } from 'lucide-react';
import './Landing.css';

const FEATURES = [
  {
    icon: <BookOpen size={20} />,
    title: 'Dated Diary',
    desc: 'Every film you watch, logged with a date, mood, and personal note.',
  },
  {
    icon: <Star size={20} />,
    title: 'Your Ratings',
    desc: 'Rate and revisit. Build a library that reflects your taste over time.',
  },
  {
    icon: <BarChart2 size={20} />,
    title: 'Rich Statistics',
    desc: 'Discover patterns — genres, directors, moods across months and years.',
  },
];

export default function Landing() {
  return (
    <div className="landing">
      {/* Nav */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <div className="landing-nav-mark">
            <Film size={16} />
          </div>
          <span className="landing-nav-name">DiaryFLIX</span>
        </div>
        <div className="landing-nav-actions">
          <Link to="/register" className="btn btn-ghost landing-nav-register">
            Create account
          </Link>
          <Link to="/login" className="btn btn-primary landing-nav-login">
            Sign in <ArrowRight size={14} />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="landing-hero">
        <div className="landing-hero-inner">
          <span className="eyebrow landing-eyebrow">Your personal cinema diary</span>
          <h1 className="landing-headline">
            Every film you watch,<br />
            <em>dated</em> and kept.
          </h1>
          <p className="landing-sub">
            DiaryFLIX is a quiet record of your screening life — log films, track moods,
            and rediscover your history one entry at a time.
          </p>
          <div className="landing-cta">
            <Link to="/register" className="btn btn-accent btn-lg">
              Start your diary — it's free
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg">
              Sign in
            </Link>
          </div>
        </div>
        <div className="landing-hero-film-strip" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="landing-film-frame" />
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="landing-features">
        <div className="landing-features-inner">
          {FEATURES.map((f) => (
            <div key={f.title} className="landing-feature-card card">
              <div className="landing-feature-icon">{f.icon}</div>
              <h3 className="landing-feature-title">{f.title}</h3>
              <p className="landing-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <span className="landing-footer-brand">DiaryFLIX</span>
        <span className="landing-footer-sep" aria-hidden="true">·</span>
        <span className="landing-footer-copy">© {new Date().getFullYear()} diaryflix.com</span>
        <span className="landing-footer-sep" aria-hidden="true">·</span>
        <Link to="/login" className="landing-footer-link">Sign in</Link>
        <span className="landing-footer-sep" aria-hidden="true">·</span>
        <Link to="/register" className="landing-footer-link">Register</Link>
      </footer>
    </div>
  );
}
