// app/api/spotify/route.ts
import { NextResponse } from "next/server";

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const TOKEN_ENDPOINT = `https://accounts.spotify.com/api/token`;
const API_BASE_URL = `https://api.spotify.com/v1`;

// Fungsi untuk mendapatkan Access Token dengan error handling yang lebih baik
async function getAccessToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('Spotify credentials tidak ditemukan');
    throw new Error('Spotify credentials are not set in environment variables');
  }

  try {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gagal mendapatkan access token Spotify:", errorText);
      throw new Error(`Spotify token error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.access_token) {
      throw new Error('Invalid token response from Spotify');
    }

    return data.access_token;
  } catch (error) {
    console.error('Error getting Spotify token:', error);
    throw error;
  }
}

// Fungsi utama route handler dengan error handling yang lebih baik
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // Tipe request

  if (!type) {
    return NextResponse.json({ error: "Parameter 'type' dibutuhkan" }, { status: 400 });
  }

  try {
    // Validasi environment variables
    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error('Spotify credentials tidak dikonfigurasi');
      return NextResponse.json(
        { error: "Konfigurasi Spotify tidak lengkap" },
        { status: 503 }
      );
    }

    const token = await getAccessToken();
    let apiRes;

    // === NEW RELEASES (Real Trending) ===
    if (type === 'new-releases') {
      const limit = searchParams.get('limit') || '20';
      const offset = searchParams.get('offset') || '0';

      const url = new URL(`${API_BASE_URL}/browse/new-releases`);
      url.searchParams.append('limit', limit);
      url.searchParams.append('offset', offset);
      url.searchParams.append('country', 'ID'); // Indonesia

      apiRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === FEATURED PLAYLISTS ===
    else if (type === 'featured-playlists') {
      const limit = searchParams.get('limit') || '10';

      const url = new URL(`${API_BASE_URL}/browse/featured-playlists`);
      url.searchParams.append('limit', limit);
      url.searchParams.append('country', 'ID');

      apiRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === PLAYLIST TRACKS ===
    else if (type === 'playlist-tracks') {
      const playlistId = searchParams.get('playlist_id');
      const limit = searchParams.get('limit') || '50';

      if (!playlistId) {
        return NextResponse.json({ error: "Parameter 'playlist_id' dibutuhkan" }, { status: 400 });
      }

      const url = new URL(`${API_BASE_URL}/playlists/${playlistId}/tracks`);
      url.searchParams.append('limit', limit);
      url.searchParams.append('fields', 'items(track(id,name,artists,album,preview_url))');

      apiRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === ARTIST DETAILS (with images) ===
    else if (type === 'artist') {
      const artistId = searchParams.get('id');

      if (!artistId) {
        return NextResponse.json({ error: "Parameter 'id' dibutuhkan" }, { status: 400 });
      }

      apiRes = await fetch(`${API_BASE_URL}/artists/${artistId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === MULTIPLE ARTISTS ===
    else if (type === 'artists') {
      const ids = searchParams.get('ids');

      if (!ids) {
        return NextResponse.json({ error: "Parameter 'ids' dibutuhkan" }, { status: 400 });
      }

      const url = new URL(`${API_BASE_URL}/artists`);
      url.searchParams.append('ids', ids);

      apiRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === ARTIST TOP TRACKS ===
    else if (type === 'artist-top-tracks') {
      const artistId = searchParams.get('id');

      if (!artistId) {
        return NextResponse.json({ error: "Parameter 'id' dibutuhkan" }, { status: 400 });
      }

      const url = new URL(`${API_BASE_URL}/artists/${artistId}/top-tracks`);
      url.searchParams.append('market', 'ID');

      apiRes = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === SEARCH BY GENRE ===
    else if (type === 'genre') {
      const genre = searchParams.get('genre');
      const limit = searchParams.get('limit') || '20';

      if (!genre) {
        return NextResponse.json({ error: "Parameter 'genre' dibutuhkan" }, { status: 400 });
      }

      const searchUrl = new URL(`${API_BASE_URL}/search`);
      searchUrl.searchParams.append('q', `genre:${genre}`);
      searchUrl.searchParams.append('type', 'track');
      searchUrl.searchParams.append('limit', limit);
      searchUrl.searchParams.append('market', 'ID');

      apiRes = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === RECOMMENDATIONS ===
    else if (type === 'recommendations') {
      const seed_artists = searchParams.get('seed_artists');
      const seed_tracks = searchParams.get('seed_tracks');
      const seed_genres = searchParams.get('seed_genres');
      const limit = searchParams.get('limit') || '20';

      if (!seed_artists && !seed_tracks && !seed_genres) {
        return NextResponse.json({ error: "Minimal satu seed (artists/tracks/genres) dibutuhkan" }, { status: 400 });
      }

      const recommendationUrl = new URL(`${API_BASE_URL}/recommendations`);
      if (seed_artists) recommendationUrl.searchParams.append('seed_artists', seed_artists);
      if (seed_tracks) recommendationUrl.searchParams.append('seed_tracks', seed_tracks);
      if (seed_genres) recommendationUrl.searchParams.append('seed_genres', seed_genres);
      recommendationUrl.searchParams.append('limit', limit);
      recommendationUrl.searchParams.append('market', 'ID');

      apiRes = await fetch(recommendationUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    // === SEARCH (default) ===
    else {
      const query = searchParams.get("q");
      if (!query) {
        return NextResponse.json({ error: "Parameter 'q' dibutuhkan untuk pencarian" }, { status: 400 });
      }

      const searchUrl = new URL(`${API_BASE_URL}/search`);
      searchUrl.searchParams.append('q', query);
      searchUrl.searchParams.append('type', 'track,artist');
      searchUrl.searchParams.append('limit', searchParams.get('limit') || '20');
      searchUrl.searchParams.append('market', 'ID');

      console.log('Searching Spotify with query:', query);
      apiRes = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    if (!apiRes.ok) {
      const errorText = await apiRes.text();
      console.error("Error dari Spotify API:", errorText);

      if (apiRes.status === 401) {
        return NextResponse.json({ error: "Token Spotify tidak valid" }, { status: 401 });
      } else if (apiRes.status === 429) {
        return NextResponse.json({ error: "Terlalu banyak request ke Spotify. Silakan tunggu sebentar sebelum mencoba lagi." }, { status: 429 });
      } else {
        return NextResponse.json({ error: "Gagal mengambil data dari Spotify API" }, { status: apiRes.status });
      }
    }

    const data = await apiRes.json();
    console.log('Spotify response received successfully');
    return NextResponse.json(data);

  } catch (error) {
    console.error("Internal Server Error:", error);

    if (error instanceof Error) {
      if (error.message.includes('credentials')) {
        return NextResponse.json({ error: "Konfigurasi Spotify tidak valid" }, { status: 503 });
      } else if (error.message.includes('token')) {
        return NextResponse.json({ error: "Gagal mendapatkan akses ke Spotify" }, { status: 503 });
      }
    }

    return NextResponse.json({ error: "Terjadi kesalahan pada server" }, { status: 500 });
  }
}