import { fetchSpotifyAPI } from './spotify-final';
import { searchYouTubeForSong } from './youtube';

interface UnifiedTrackData {
    spotify: {
        id: string;
        name: string;
        artist: string;
        album: string;
        image: string;
        duration_ms: number;
        url: string;
    };
    youtube: {
        videoId: string | null;
        url: string | null;
    };
    lyrics: {
        synced: string | null;
        plain: string | null;
    };
}

async function fetchLyrics(artist: string, title: string, duration: number) {
    try {
        const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}&duration=${duration}`;
        const response = await fetch(url);

        if (!response.ok) {
            return { synced: null, plain: null };
        }

        const data = await response.json();
        return {
            synced: data.syncedLyrics || null,
            plain: data.plainLyrics || null
        };
    } catch (error) {
        console.error('Error fetching lyrics:', error);
        return { synced: null, plain: null };
    }
}

export async function getUnifiedMusicData(query: string): Promise<UnifiedTrackData | null> {
    try {
        // 1. Search Spotify
        const spotifySearch = await fetchSpotifyAPI(`search?q=${encodeURIComponent(query)}&type=track&limit=1`);

        if (!spotifySearch.tracks || spotifySearch.tracks.items.length === 0) {
            return null;
        }

        const track = spotifySearch.tracks.items[0];
        const artistName = track.artists[0].name;
        const trackName = track.name;
        const durationSec = Math.round(track.duration_ms / 1000);

        // 2. Search YouTube (Parallel with Lyrics if possible, but YouTube might be needed for playback)
        // 3. Fetch Lyrics
        const [videoId, lyrics] = await Promise.all([
            searchYouTubeForSong(trackName, artistName),
            fetchLyrics(artistName, trackName, durationSec)
        ]);

        return {
            spotify: {
                id: track.id,
                name: trackName,
                artist: artistName,
                album: track.album.name,
                image: track.album.images[0]?.url || '',
                duration_ms: track.duration_ms,
                url: track.external_urls.spotify,
            },
            youtube: {
                videoId: videoId,
                url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
            },
            lyrics: lyrics,
        };

    } catch (error) {
        console.error('Error in unified music data fetch:', error);
        throw error;
    }
}
