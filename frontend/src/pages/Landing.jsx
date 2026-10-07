import { Link } from 'react-router-dom';
import { BookOpen, Heart, CalendarDays, ArrowRight, Bookmark, Sparkles } from 'lucide-react';
import SampleJournal from '../components/SampleJournal';
import FilmArtwork from '../components/FilmArtwork';
import './Landing.css';

export default function Landing() {
  return <div className="landing cinema-landing">
    <nav className="cinema-nav" aria-label="Main navigation"><Link to="/" className="cinema-brand"><BookOpen size={23} /> DiaryFLIX<span>A FILM DIARY</span></Link><div><Link to="/login" className="btn btn-ghost">Sign in</Link><Link to="/register" className="btn btn-primary">Start a diary <ArrowRight size={15} /></Link></div></nav>
    <main>
      <section className="cinema-hero">
        <div className="cinema-hero-copy"><span className="eyebrow">FOR THE FILMS THAT STAY WITH YOU</span><h1>Loved the film.<br /><em>Forgotten the name?</em></h1><p>Keep a little record of what you watched, when you watched it, and why it mattered. Your next favourite memory starts here.</p><div className="cinema-actions"><Link to="/register" className="btn btn-primary btn-lg">Start my film diary <ArrowRight size={17} /></Link><a href="#sample-diary" className="cinema-text-link">Explore a sample diary ↓</a></div><span className="cinema-hero-foot"><BookOpen size={15} /> Films, series, and the stories you keep.</span></div>
        <div className="cinema-poster-scene" aria-label="Original illustrated film posters"><div className="cinema-poster poster-one"><FilmArtwork title="After the Rain" /></div><div className="cinema-poster poster-two"><FilmArtwork title="The Last Light" variant={1} /></div><div className="cinema-poster poster-three"><FilmArtwork title="Somewhere, Again" variant={2} /></div><div className="cinema-memory-note"><Heart size={17} fill="currentColor" /><span>“One of my favourites.<br />I never want to forget this one.”</span></div><span className="cinema-scene-caption">A collection of feelings. One film at a time.</span></div>
      </section>
      <section className="cinema-questions"><div><Heart /><h2>“Your favourite film?”</h2><p>Keep the ones you love in a collection that feels like you.</p></div><div><CalendarDays /><h2>“What did you watch in 2015?”</h2><p>Turn back to a year in your diary and find the films you recorded.</p></div><div><Sparkles /><h2>“What should I watch tonight?”</h2><p>Pick from your watchlist, discover something new, or revisit an old favourite.</p></div></section>
      <section className="cinema-demo" id="sample-diary"><div><span className="eyebrow">YOUR LIFE, THROUGH FILMS</span><h2>A title brings back<br /><em>more than a story.</em></h2><p>The rainy afternoon. The friend beside you. The ending you talked about for days. Give those little details a place to live.</p><p className="cinema-demo-hint">Try the year and favourites filters in this sample.</p></div><SampleJournal /></section>
      <section className="cinema-manifesto"><Bookmark size={29} /><span className="eyebrow">KEEP THE MEMORY</span><h2>Your collection<br />can be a diary.</h2><p>You don’t need to keep a copy of every movie to keep track of the ones you loved. Save the names, the dates, and your own words. Find them again when you need them.</p><Link to="/register" className="btn btn-lg">Begin your collection <ArrowRight size={17} /></Link><span className="cinema-small-print">A diary of your viewing history. Movies are not hosted or streamed here.</span></section>
      <section className="cinema-steps"><span className="eyebrow">A SMALL HABIT. A PERSONAL HISTORY.</span><div>{[['01','Find your film','Search for a title, or add it yourself.'],['02','Keep a few details','Add a date, a rating, or one line about how it felt.'],['03','Come back to it','Browse your years, find a favourite, and remember.']].map(([number,title,copy])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="cinema-start" aria-labelledby="cinema-start-heading">
        <span className="eyebrow">THERE’S STILL SO MUCH TO REMEMBER</span>
        <h2 id="cinema-start-heading">You’re not too late.<br /><em>Start with the next film.</em></h2>
        <p>You might not remember every film from the years gone by. That’s okay. Start with the ones you love, add old favourites as they come back to you, and keep a little memory of whatever you watch next.</p>
        <Link to="/register" className="btn btn-primary btn-lg">Start my film diary <ArrowRight size={17} /></Link>
      </section>
    </main>
    <footer className="cinema-footer"><span className="cinema-brand"><BookOpen size={18} /> DiaryFLIX</span><p>Remember what you watched. Keep what it meant.</p><Link to="/login">Sign in</Link><span>© {new Date().getFullYear()} DiaryFLIX</span></footer>
  </div>;
}
