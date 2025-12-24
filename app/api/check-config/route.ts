// app/api/check-config/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const config = {
      spotify: {
        clientId: !!process.env.SPOTIFY_CLIENT_ID,
        clientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
        valid: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET)
      },
      gemini: {
        apiKey: !!process.env.GEMINI_API_KEY,
        valid: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length >= 10
      },
      youtube: {
        apiKey: !!process.env.YOUTUBE_API_KEY,
        valid: !!process.env.YOUTUBE_API_KEY
      }
    };

    const allValid = config.spotify.valid && config.gemini.valid;

    return NextResponse.json({
      status: allValid ? 'ready' : 'incomplete',
      config,
      message: allValid 
        ? 'Semua konfigurasi sudah lengkap' 
        : 'Beberapa konfigurasi masih belum lengkap'
    });

  } catch (error) {
    console.error('Error checking config:', error);
    return NextResponse.json(
      { error: 'Gagal memeriksa konfigurasi' },
      { status: 500 }
    );
  }
} 