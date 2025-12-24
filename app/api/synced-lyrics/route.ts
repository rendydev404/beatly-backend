// app/api/synced-lyrics/route.ts
import { NextResponse } from 'next/server';

// Tipe untuk setiap baris lirik yang sudah diparsing
type LyricLine = {
  time: number; // Waktu dalam detik
  text: string;
};

// Fungsi untuk mem-parsing format lirik LRC
function parseLRC(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split('\n');
  const lyrics: LyricLine[] = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const milliseconds = parseInt(match[3].padEnd(3, '0'), 10);
      const time = minutes * 60 + seconds + milliseconds / 1000;
      const text = match[4].trim();
      
      // Hanya tambahkan jika ada teks liriknya
      if (text) {
        lyrics.push({ time, text });
      }
    }
  }
  return lyrics;
}


export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const artist_name = searchParams.get('artist');
  const track_name = searchParams.get('title');
  const duration = searchParams.get('duration'); // durasi dalam detik

  if (!artist_name || !track_name || !duration) {
    return NextResponse.json({ error: 'Parameter artist, title, dan duration dibutuhkan' }, { status: 400 });
  }

  try {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist_name)}&track_name=${encodeURIComponent(track_name)}&album_name=&duration=${duration}`;
    const response = await fetch(url);

    if (response.status === 404) {
      return NextResponse.json({ lyrics: null, message: "Lirik tidak ditemukan." });
    }
    if (!response.ok) {
        throw new Error(`Gagal fetch dari LRCLIB, status: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.syncedLyrics) {
      const parsedLyrics = parseLRC(data.syncedLyrics);
      return NextResponse.json({ lyrics: parsedLyrics });
    } else {
      // Jika ada lirik biasa tapi tidak sinkron, kita kirim sebagai fallback
      return NextResponse.json({ lyrics: null, message: data.plainLyrics || "Lirik tidak tersedia." });
    }

  } catch (error) {
    console.error("Error di API lirik:", error);
    return NextResponse.json({ lyrics: null, message: "Gagal memuat lirik." }, { status: 500 });
  }
}