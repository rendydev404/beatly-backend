import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // Declare userPrompt at function level for fallback access
  let userPrompt = '';

  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500, headers }
      );
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400, headers }
      );
    }

    const { prompt } = body;
    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Prompt is required and must be a string' },
        { status: 400, headers }
      );
    }

    userPrompt = prompt;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200,
      }
    });

    const systemPrompt = `Convert this music description into a simple Spotify search query.

Examples:
"pop music from 2023" -> "pop 2023"
"rock songs by The Beatles" -> "rock artist:The Beatles"
"sad love songs" -> "sad love songs"
"classical piano music" -> "classical piano"
"electronic dance tracks" -> "electronic dance"

Description: "${userPrompt}"

Return only the search query, nothing else.`;

    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const query = response.text().trim();

    if (!query || query.length < 2) {
      throw new Error('Empty or invalid response from AI');
    }

    return NextResponse.json({ query }, { headers });

  } catch (error) {
    console.error('Generation error:', error);

    // Provide fallback queries for common cases
    const fallbackQueries = {
      'pop': 'pop music',
      'rock': 'rock music',
      'jazz': 'jazz music',
      'electronic': 'electronic music',
      'hip hop': 'hip hop music',
      'classical': 'classical music',
      'country': 'country music',
      'indie': 'indie music',
      'sad': 'sad songs',
      'happy': 'happy songs',
      'chill': 'chill music',
      'workout': 'workout music',
      'party': 'party music'
    };

    const promptLower = userPrompt.toLowerCase();
    for (const [key, fallbackQuery] of Object.entries(fallbackQueries)) {
      if (promptLower.includes(key)) {
        console.log(`Using fallback query: ${fallbackQuery}`);
        return NextResponse.json({ query: fallbackQuery }, { headers });
      }
    }

    // Default fallback
    const defaultQuery = userPrompt.split(' ').slice(0, 3).join(' ');
    console.log(`Using default fallback query: ${defaultQuery}`);
    return NextResponse.json({ query: defaultQuery }, { headers });
  }
}

export async function OPTIONS() {
  return NextResponse.json({}, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
