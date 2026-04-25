import React, { useState, useEffect, useRef } from 'react';
import { Search, Film, Tv, X } from 'lucide-react';
import { searchMovies, getPosterUrl, hasTMDBKey } from '../services/tmdb';
import './MovieSearch.css';

export default function MovieSearch({ onSelect, id = 'movie-search' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!query.trim() || !hasTMDBKey()) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const data = await searchMovies(query);
      setResults(data.results);
      setShowDropdown(true);
      setLoading(false);
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (movie) => {
    onSelect(movie);
    setQuery(movie.title);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setShowDropdown(false);
  };

  if (!hasTMDBKey()) {
    return (
      <div className="movie-search-no-key" id={id}>
        <Film size={18} />
        <span>Set your TMDB API key in <strong>Settings</strong> to enable movie search with auto-fill</span>
      </div>
    );
  }

  return (
    <div className="movie-search" ref={containerRef} id={id}>
      <div className="movie-search-input-wrapper">
        <Search size={18} className="movie-search-icon" />
        <input
          type="text"
          className="input movie-search-input"
          placeholder="Search for a movie or TV series..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
        />
        {query && (
          <button type="button" className="movie-search-clear" onClick={handleClear}>
            <X size={16} />
          </button>
        )}
        {loading && <div className="movie-search-spinner" />}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="movie-search-dropdown">
          {results.map(movie => (
            <button
              key={movie.tmdbId}
              type="button"
              className="movie-search-result"
              onClick={() => handleSelect(movie)}
            >
              {movie.posterPath ? (
                <img
                  src={getPosterUrl(movie.posterPath, 'w92')}
                  alt={movie.title}
                  className="movie-search-poster"
                  loading="lazy"
                />
              ) : (
                <div className="movie-search-poster-placeholder">
                  {movie.type === 'tv_series' ? <Tv size={20} /> : <Film size={20} />}
                </div>
              )}
              <div className="movie-search-info">
                <span className="movie-search-title">{movie.title}</span>
                <span className="movie-search-meta">
                  {movie.year && <span>{movie.year}</span>}
                  {movie.type === 'tv_series' && <span className="movie-search-type-badge">TV</span>}
                  {movie.rating > 0 && <span>⭐ {movie.rating.toFixed(1)}</span>}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {showDropdown && query && results.length === 0 && !loading && (
        <div className="movie-search-dropdown">
          <div className="movie-search-empty">No results found for "{query}"</div>
        </div>
      )}
    </div>
  );
}
