import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, Music, ExternalLink, Play, Square, Loader } from 'lucide-react';
import { searchMovieSongs } from '../services/itunes';
import './SongEntry.css';

export default function SongEntry({ songs = [], onChange, movieTitle = '' }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [playingUrl, setPlayingUrl] = useState(null);
  
  const audioRef = useRef(null);
  const containerRef = useRef(null);

  // Fetch suggestions when movie title changes
  useEffect(() => {
    if (!movieTitle) {
      setSuggestions([]);
      return;
    }

    const fetchSongs = async () => {
      setLoading(true);
      const results = await searchMovieSongs(movieTitle);
      setSuggestions(results);
      setLoading(false);
    };

    const debounceTimer = setTimeout(fetchSongs, 1000);
    return () => clearTimeout(debounceTimer);
  }, [movieTitle]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Audio player cleanup
  useEffect(() => {
    if (!playingUrl && audioRef.current) {
      audioRef.current.pause();
    }
  }, [playingUrl]);

  const togglePlay = (e, url) => {
    e.preventDefault();
    e.stopPropagation(); // prevent selecting the song
    
    if (playingUrl === url) {
      setPlayingUrl(null); // Pause current
    } else {
      setPlayingUrl(url); // Play new
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play().catch(err => console.error("Audio play failed:", err));
      }
    }
  };

  const addSong = () => {
    onChange([...songs, { name: '', youtubeUrl: '' }]);
  };

  const updateSong = (index, field, value) => {
    const updated = [...songs];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeSong = (index) => {
    onChange(songs.filter((_, i) => i !== index));
  };

  const handleSelectSuggestion = (index, track) => {
    const updated = [...songs];
    const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + ' ' + movieTitle + ' song')}`;
    
    updated[index] = { 
      ...updated[index], 
      name: track.title,
      youtubeUrl: updated[index].youtubeUrl || youtubeSearchUrl 
    };
    onChange(updated);
    setActiveDropdown(null);
  };

  return (
    <div className="song-entry" ref={containerRef}>
      <audio ref={audioRef} onEnded={() => setPlayingUrl(null)} />
      
      <label className="song-entry-label">
        <Music size={14} />
        Favourite Songs
      </label>

      {songs.map((song, i) => (
        <div key={i} className="song-entry-row-container">
          <div className="song-entry-row">
            <div className="song-name-wrapper">
              <input
                type="text"
                className="input song-name-input"
                placeholder="Song name"
                value={song.name}
                onChange={(e) => updateSong(i, 'name', e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setActiveDropdown(i);
                }}
              />
              
              {/* Dropdown for this specific input */}
              {activeDropdown === i && suggestions.length > 0 && (
                <div className="song-suggestions-dropdown">
                  <div className="song-suggestions-header">
                    Suggestions from iTunes
                    {loading && <Loader size={12} className="spin-animation" />}
                  </div>
                  {suggestions.map((track) => (
                    <div 
                      key={track.id} 
                      className="song-suggestion-item"
                      onClick={() => handleSelectSuggestion(i, track)}
                    >
                      {track.artwork && (
                        <img src={track.artwork} alt="" className="song-suggestion-art" />
                      )}
                      <div className="song-suggestion-info">
                        <span className="song-suggestion-title">{track.title}</span>
                        <span className="song-suggestion-artist">{track.artist}</span>
                      </div>
                      {track.previewUrl && (
                        <button 
                          type="button"
                          className={`btn btn-icon song-preview-btn ${playingUrl === track.previewUrl ? 'playing' : ''}`}
                          onClick={(e) => togglePlay(e, track.previewUrl)}
                          title="Preview Track"
                        >
                          {playingUrl === track.previewUrl ? <Square size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <input
              type="url"
              className="input song-url-input"
              placeholder="YouTube URL (optional)"
              value={song.youtubeUrl}
              onChange={(e) => updateSong(i, 'youtubeUrl', e.target.value)}
            />
            {song.youtubeUrl && (
              <a
                href={song.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost btn-icon song-link-btn"
                title="Open in YouTube"
              >
                <ExternalLink size={14} />
              </a>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-icon song-remove-btn"
              onClick={() => removeSong(i)}
              title="Remove song"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-secondary song-add-btn" onClick={addSong}>
        <Plus size={16} />
        Add Song
      </button>
    </div>
  );
}
