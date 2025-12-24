// app/api/debug-env/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const envStatus = {
      gemini: {
        hasKey: !!process.env.GEMINI_API_KEY,
        keyLength: process.env.GEMINI_API_KEY?.length || 0,
        isValid: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length >= 10),
        keyPreview: process.env.GEMINI_API_KEY ? 
          `${process.env.GEMINI_API_KEY.substring(0, 8)}...${process.env.GEMINI_API_KEY.substring(process.env.GEMINI_API_KEY.length - 4)}` : 
          'Not set'
      },
      spotify: {
        hasClientId: !!process.env.SPOTIFY_CLIENT_ID,
        hasClientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
        isValid: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
        clientIdPreview: process.env.SPOTIFY_CLIENT_ID ? 
          `${process.env.SPOTIFY_CLIENT_ID.substring(0, 8)}...` : 
          'Not set'
      },
      youtube: {
        hasKey: !!process.env.YOUTUBE_API_KEY,
        isValid: !!process.env.YOUTUBE_API_KEY
      }
    };

    const allValid = envStatus.gemini.isValid && envStatus.spotify.isValid;

    return NextResponse.json({
      status: allValid ? 'ready' : 'incomplete',
      environment: envStatus,
      message: allValid 
        ? 'Semua environment variables sudah dikonfigurasi dengan benar' 
        : 'Beberapa environment variables masih belum dikonfigurasi',
      recommendations: allValid ? [] : [
        !envStatus.gemini.isValid && 'Tambahkan GEMINI_API_KEY yang valid',
        !envStatus.spotify.isValid && 'Tambahkan SPOTIFY_CLIENT_ID dan SPOTIFY_CLIENT_SECRET yang valid'
      ].filter(Boolean)
    });

  } catch (error) {
    console.error('Error checking environment:', error);
    return NextResponse.json(
      { error: 'Gagal memeriksa environment variables' },
      { status: 500 }
    );
  }
} 