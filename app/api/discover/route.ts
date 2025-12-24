import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface HistoryItem {
    genre: string | null
    track_id: string
}

// Default genre mix for users without history
const DEFAULT_GENRES = ['pop', 'hip-hop', 'electronic', 'r-n-b', 'rock']

// Spotify valid genre seeds (subset that works well)
const VALID_SPOTIFY_GENRES = [
    'pop', 'hip-hop', 'electronic', 'rock', 'r-n-b', 'jazz', 'classical',
    'country', 'reggae', 'metal', 'blues', 'funk', 'soul', 'disco',
    'house', 'techno', 'ambient', 'folk', 'indie', 'punk', 'latin',
    'k-pop', 'j-pop', 'edm', 'dance', 'chill', 'acoustic', 'alternative'
]

// Normalize genre name to Spotify format
function normalizeGenre(genre: string): string {
    const normalized = genre.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()

    // Map common variations
    const genreMap: Record<string, string> = {
        'rnb': 'r-n-b',
        'r&b': 'r-n-b',
        'hiphop': 'hip-hop',
        'hip hop': 'hip-hop',
        'edm': 'electronic',
        'phonk': 'hip-hop', // Phonk is hip-hop subgenre
        'trap': 'hip-hop',
        'drill': 'hip-hop',
        'lo-fi': 'chill',
        'lofi': 'chill',
        'progressive house': 'house',
        'deep house': 'house',
        'dubstep': 'electronic',
        'drum and bass': 'electronic',
        'dnb': 'electronic',
    }

    if (genreMap[normalized]) {
        return genreMap[normalized]
    }

    // Check if it's a valid Spotify genre
    if (VALID_SPOTIFY_GENRES.includes(normalized)) {
        return normalized
    }

    // Try to find a partial match
    for (const validGenre of VALID_SPOTIFY_GENRES) {
        if (normalized.includes(validGenre) || validGenre.includes(normalized)) {
            return validGenre
        }
    }

    return 'pop' // Fallback to pop
}

export async function GET(request: NextRequest) {
    try {
        // Get auth token from header (optional for guests)
        const authHeader = request.headers.get('authorization')
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '20')

        // If no auth, return genre-based recommendations for guests
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return getGuestRecommendations(request, limit)
        }

        const token = authHeader.replace('Bearer ', '')
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

        // Get user from token
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !user) {
            return getGuestRecommendations(request, limit)
        }

        // Fetch user's listening history with genres
        const { data: history, error: historyError } = await supabaseClient
            .from('listening_history')
            .select('genre, track_id')
            .eq('user_id', user.id)
            .not('genre', 'is', null)
            .order('played_at', { ascending: false })
            .limit(100) // Analyze last 100 plays

        if (historyError) {
            console.error('Error fetching history for discover:', historyError)
            return getGuestRecommendations(request, limit)
        }

        // If no history with genres, fallback to guest recommendations
        if (!history || history.length === 0) {
            return getGuestRecommendations(request, limit)
        }

        // Analyze genre frequencies
        const genreCounts: Record<string, number> = {}
        const playedTrackIds = new Set<string>()

        history.forEach((item: HistoryItem) => {
            if (item.genre) {
                const normalized = normalizeGenre(item.genre)
                genreCounts[normalized] = (genreCounts[normalized] || 0) + 1
            }
            playedTrackIds.add(item.track_id)
        })

        // Get top 3 genres by frequency
        const topGenres = Object.entries(genreCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([genre]) => genre)
            .filter(g => VALID_SPOTIFY_GENRES.includes(g))

        if (topGenres.length === 0) {
            return getGuestRecommendations(request, limit)
        }

        // Get recommendations from Spotify using genre seeds
        const seedGenres = topGenres.join(',')
        const recommendationsRes = await fetch(
            `${request.nextUrl.origin}/api/spotify?type=recommendations&seed_genres=${seedGenres}&limit=${limit + 15}`
        )

        if (!recommendationsRes.ok) {
            console.error('Discover API: Failed to get recommendations')
            return getGuestRecommendations(request, limit)
        }

        const recommendationsData = await recommendationsRes.json()
        const tracks = recommendationsData.tracks || []

        // Filter out already played tracks
        const filteredTracks = tracks.filter((track: { id: string }) =>
            !playedTrackIds.has(track.id)
        )

        return NextResponse.json({
            tracks: filteredTracks.slice(0, limit),
            basedOnGenres: topGenres,
            genreCounts: Object.fromEntries(
                Object.entries(genreCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
            ),
            totalAnalyzed: history.length,
            isPersonalized: true
        })

    } catch (error) {
        console.error('Discover API error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// Fallback for guests or users without history
async function getGuestRecommendations(request: NextRequest, limit: number) {
    try {
        // Use a mix of popular genres
        const randomGenres = DEFAULT_GENRES
            .sort(() => Math.random() - 0.5)
            .slice(0, 3)

        const seedGenres = randomGenres.join(',')

        const recommendationsRes = await fetch(
            `${request.nextUrl.origin}/api/spotify?type=recommendations&seed_genres=${seedGenres}&limit=${limit}`
        )

        if (!recommendationsRes.ok) {
            return NextResponse.json({
                tracks: [],
                basedOnGenres: [],
                isPersonalized: false,
                message: 'Failed to get recommendations'
            })
        }

        const data = await recommendationsRes.json()

        return NextResponse.json({
            tracks: data.tracks || [],
            basedOnGenres: randomGenres,
            isPersonalized: false,
            message: 'Login untuk rekomendasi yang lebih personal'
        })
    } catch (error) {
        console.error('Guest recommendations error:', error)
        return NextResponse.json({
            tracks: [],
            basedOnGenres: [],
            isPersonalized: false
        })
    }
}
