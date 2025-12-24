// app/api/gemini/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

import { NextRequest } from 'next/server';

export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    // Validate request method
    if (req.method !== 'POST') {
      return NextResponse.json(
        { error: `Method ${req.method} Not Allowed` },
        { status: 405, headers: { 'Allow': 'POST' } }
      );
    }
    // Set headers
    const headers = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    });

    // Debug: Log environment variables (without exposing actual keys)
    // Enhanced environment debugging
    const envDebug = {
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      geminiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
      keyPrefix: process.env.GEMINI_API_KEY?.substring(0, 5) || 'none',
      nodeEnv: process.env.NODE_ENV,
      hasSpotifyId: !!process.env.SPOTIFY_CLIENT_ID,
      hasSpotifySecret: !!process.env.SPOTIFY_CLIENT_SECRET
    };
    console.log('Detailed Environment check:', envDebug);

    // Validasi environment
    if (!process.env.GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY tidak ditemukan');
      return NextResponse.json(
        { error: 'Konfigurasi AI tidak lengkap. Mohon periksa pengaturan environment.' },
        { status: 503, headers }
      );
    }

    // Validasi format API key
    if (process.env.GEMINI_API_KEY.length < 10) {
      console.error('GEMINI_API_KEY terlalu pendek atau tidak valid');
      return NextResponse.json(
        { error: 'Konfigurasi AI tidak valid. Mohon periksa API key.' },
        { status: 503 }
      );
    }

    // Parse dan validasi input dengan error handling yang lebih baik
    let body;
    try {
      body = await req.json();
    } catch (error) {
      console.error('Error parsing request body:', error);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400, headers }
      );
    }

    const { prompt: userPrompt } = body || {};
    
    if (!userPrompt || typeof userPrompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt harus berupa teks' },
        { status: 400 }
      );
    }

    if (userPrompt.length > 1000) {
      return NextResponse.json(
        { error: 'Prompt terlalu panjang (max 1000 karakter)' },
        { status: 400 }
      );
    }

    console.log('Processing prompt:', userPrompt);

    // Inisialisasi Gemini AI dengan error handling
    let genAI;
    try {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      console.log('Gemini AI initialized successfully');
    } catch (error) {
      console.error('Error initializing Gemini:', error);
      return NextResponse.json(
        { error: 'Gagal menginisialisasi AI service' },
        { status: 500 }
      );
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-pro',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      }
    });

    // Simplified prompt for testing
    const testPrompt = `Convert this music description to a Spotify search query. Only return the search query, nothing else.
    
    Description: "${userPrompt}"
    Search query:`;

    try {
      console.log('Generating content with Gemini...');
      
      // Generate content dengan proper error handling dan timeout
      const result = await Promise.race([
        model.generateContent(testPrompt),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 60000)
        )
      ]);

      if (!result) {
        throw new Error('Empty response from Gemini API');
      }

      console.log('Gemini response received:', result);

      const response = await (result as any).response;
      if (!response) {
        throw new Error('Invalid response structure from Gemini API');
      }

      const query = response.text?.().trim();
      console.log('Processed query:', query);

      console.log('Raw AI response:', query);

      if (!query) {
        throw new Error('AI returned empty response');
      }

      // Validasi hasil query
      if (query.length < 2 || query.length > 200) {
        throw new Error('Invalid query length');
      }

      console.log('Final generated query:', query);
      return NextResponse.json({ query });
      
    } catch (error) {
      console.error('Generation error:', error);

      if (error instanceof Error) {
        if (error.message === 'Request timeout') {
          return NextResponse.json(
            { error: 'Waktu pemrosesan terlalu lama. Silakan coba lagi.' },
            { status: 408 }
          );
        }
        if (error.message.includes('Empty')) {
          return NextResponse.json(
            { error: 'AI tidak dapat memproses permintaan Anda. Coba dengan kata kunci yang berbeda.' },
            { status: 422 }
          );
        }
        if (error.message.includes('API key') || error.message.includes('authentication')) {
          return NextResponse.json(
            { error: 'Konfigurasi AI tidak valid. Mohon periksa pengaturan.' },
            { status: 401 }
          );
        }
        if (error.message.includes('quota')) {
          return NextResponse.json(
            { error: 'Quota AI telah habis. Silakan coba lagi nanti.' },
            { status: 429 }
          );
        }
        if (error.message.includes('permission')) {
          return NextResponse.json(
            { error: 'Tidak memiliki izin untuk mengakses AI service.' },
            { status: 403 }
          );
        }
      }

      // Log error details untuk debugging
      console.error('Unknown error details:', {
        error: error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });

      return NextResponse.json(
        { error: 'Fitur AI sedang dalam maintenance. Silakan coba lagi nanti.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Request error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan sistem. Silakan coba beberapa saat lagi.' },
      { status: 500 }
    );
  }
}