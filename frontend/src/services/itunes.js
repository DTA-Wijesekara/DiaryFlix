// CineLog - iTunes API Service for fetching soundtracks

export async function searchMovieSongs(movieTitle) {
  if (!movieTitle || !movieTitle.trim()) return [];

  try {
    const query = encodeURIComponent(`${movieTitle} soundtrack`);
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=10`);
    
    if (!res.ok) throw new Error('iTunes API failed');
    
    const data = await res.json();
    
    return data.results.map(track => ({
      id: track.trackId,
      title: track.trackName,
      artist: track.artistName,
      album: track.collectionName,
      previewUrl: track.previewUrl,
      artwork: track.artworkUrl60 || track.artworkUrl30,
    }));
  } catch (error) {
    console.error('Error fetching songs from iTunes:', error);
    return [];
  }
}
