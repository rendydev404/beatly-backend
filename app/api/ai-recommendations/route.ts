import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from '@google/generative-ai'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface HistoryItem {
    track_id: string
    track_name: string
    artist_name: string
    genre: string | null
    played_at: string
}

// Spotify valid genre seeds
const VALID_SPOTIFY_GENRES = [
    'pop', 'hip-hop', 'electronic', 'rock', 'r-n-b', 'jazz', 'classical',
    'country', 'reggae', 'metal', 'blues', 'funk', 'soul', 'disco',
    'house', 'techno', 'ambient', 'folk', 'indie', 'punk', 'latin',
    'k-pop', 'edm', 'dance', 'chill', 'acoustic', 'alternative'
]

// Get time context for recommendations
function getTimeContext(): { period: string; mood: string } {
    const hour = new Date().getHours()
    if (hour >= 5 && hour < 9) {
        return { period: 'pagi', mood: 'energetic, uplifting, fresh' }
    } else if (hour >= 9 && hour < 12) {
        return { period: 'pagi', mood: 'productive, focused, upbeat' }
    } else if (hour >= 12 && hour < 17) {
        return { period: 'siang', mood: 'chill, relaxed, smooth' }
    } else if (hour >= 17 && hour < 21) {
        return { period: 'sore', mood: 'mellow, evening vibes, unwinding' }
    } else {
        return { period: 'malam', mood: 'calm, ambient, reflective, late night' }
    }
}

// Normalize genre name
function normalizeGenre(genre: string): string {
    const normalized = genre.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()

    const genreMap: Record<string, string> = {
        'rnb': 'r-n-b', 'r&b': 'r-n-b', 'hiphop': 'hip-hop', 'hip hop': 'hip-hop',
        'edm': 'electronic', 'phonk': 'hip-hop', 'trap': 'hip-hop', 'drill': 'hip-hop',
        'lo-fi': 'chill', 'lofi': 'chill', 'progressive house': 'house',
        'deep house': 'house', 'dubstep': 'electronic', 'dnb': 'electronic',
    }

    if (genreMap[normalized]) return genreMap[normalized]
    if (VALID_SPOTIFY_GENRES.includes(normalized)) return normalized

    for (const validGenre of VALID_SPOTIFY_GENRES) {
        if (normalized.includes(validGenre) || validGenre.includes(normalized)) {
            return validGenre
        }
    }

    return 'pop'
}

// Analyze listening patterns (Spotify-like algorithm)
function analyzeListeningPatterns(history: HistoryItem[]): {
    topArtists: string[]
    topGenres: string[]
    recentTracks: string[]
    listeningDiversity: number
    preferredEnergy: string
} {
    const artistCounts: Record<string, number> = {}
    const genreCounts: Record<string, number> = {}
    const recentTracks: string[] = []
    const uniqueArtists = new Set<string>()

    history.forEach((item, index) => {
        // Weight recent plays more heavily (exponential decay)
        const weight = Math.exp(-index * 0.05)

        artistCounts[item.artist_name] = (artistCounts[item.artist_name] || 0) + weight
        uniqueArtists.add(item.artist_name)

        if (item.genre) {
            const normalized = normalizeGenre(item.genre)
            genreCounts[normalized] = (genreCounts[normalized] || 0) + weight
        }

        if (index < 10) {
            recentTracks.push(`${item.track_name} by ${item.artist_name}`)
        }
    })

    // Get top 5 artists and genres by weighted score
    const topArtists = Object.entries(artistCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name]) => name)

    const topGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([genre]) => genre)
        .filter(g => VALID_SPOTIFY_GENRES.includes(g))

    // Calculate listening diversity (0-1)
    const listeningDiversity = Math.min(uniqueArtists.size / history.length, 1)

    // Determine preferred energy based on genres
    const energeticGenres = ['electronic', 'hip-hop', 'rock', 'metal', 'edm', 'dance']
    const chillGenres = ['chill', 'ambient', 'jazz', 'classical', 'acoustic', 'folk']

    let energyScore = 0
    topGenres.forEach((g, idx) => {
        const weight = 1 / (idx + 1)
        if (energeticGenres.includes(g)) energyScore += weight
        if (chillGenres.includes(g)) energyScore -= weight
    })

    const preferredEnergy = energyScore > 0.3 ? 'high' : energyScore < -0.3 ? 'low' : 'medium'

    return { topArtists, topGenres, recentTracks, listeningDiversity, preferredEnergy }
}

// Generate AI-powered search queries using Gemini
async function generateAIRecommendations(
    patterns: ReturnType<typeof analyzeListeningPatterns>,
    timeContext: ReturnType<typeof getTimeContext>
): Promise<string[]> {
    if (!process.env.GEMINI_API_KEY) {
        return []
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
        const model = genAI.getGenerativeModel({
            model: 'gemini-pro',
            generationConfig: {
                temperature: 0.8, // Higher for more variety
                maxOutputTokens: 300,
            }
        })

        const prompt = `You are a music recommendation AI like Spotify's algorithm. Based on this user's listening data, generate 5 different Spotify search queries to find new songs they would love.

USER PROFILE:
- Top Artists: ${patterns.topArtists.join(', ')}
- Top Genres: ${patterns.topGenres.join(', ')}
- Recent Tracks: ${patterns.recentTracks.slice(0, 5).join('; ')}
- Listening Diversity: ${patterns.listeningDiversity > 0.5 ? 'High (likes variety)' : 'Low (focused taste)'}
- Preferred Energy: ${patterns.preferredEnergy}

CONTEXT:
- Time: ${timeContext.period} (current mood preference: ${timeContext.mood})

RULES:
1. Mix familiar artists with similar new artists
2. Consider the time of day for mood-appropriate suggestions
3. If diversity is high, suggest more varied genres
4. If diversity is low, stay closer to core preferences
5. Include at least one query for discovering new artists similar to their favorites

Return ONLY 5 search queries, one per line. Each query should be short (2-5 words) and effective for Spotify search. No numbering, no explanations.`

        const result = await Promise.race([
            model.generateContent(prompt),
            new Promise<null>((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), 15000)
            )
        ])

        if (!result) return []

        const response = await (result as any).response
        const text = response.text?.().trim()

        if (!text) return []

        // Parse the queries
        const queries = text.split('\n')
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 2 && q.length < 100)
            .slice(0, 5)

        return queries

    } catch (error) {
        console.error('AI recommendations error:', error)
        return []
    }
}

// Fallback recommendations based on patterns
function generateFallbackQueries(patterns: ReturnType<typeof analyzeListeningPatterns>): string[] {
    const queries: string[] = []

    // Query based on top artist
    if (patterns.topArtists[0]) {
        queries.push(`${patterns.topArtists[0]} popular`)
    }

    // Query for similar artists
    if (patterns.topArtists[1]) {
        queries.push(`similar to ${patterns.topArtists[1]}`)
    }

    // Genre-based queries
    patterns.topGenres.forEach(genre => {
        queries.push(`${genre} hits 2024`)
    })

    // Add one discovery query
    queries.push('trending new music')

    return queries.slice(0, 5)
}

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '20')

        // Guest users get generic recommendations
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return getGuestRecommendations(request, limit)
        }

        const token = authHeader.replace('Bearer ', '')
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !user) {
            return getGuestRecommendations(request, limit)
        }

        // Fetch comprehensive listening history
        const { data: history, error: historyError } = await supabaseClient
            .from('listening_history')
            .select('track_id, track_name, artist_name, genre, played_at')
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(100) // Analyze last 100 plays for patterns

        if (historyError || !history || history.length === 0) {
            return getGuestRecommendations(request, limit)
        }

        // Analyze patterns (Spotify-like algorithm)
        const patterns = analyzeListeningPatterns(history)
        const timeContext = getTimeContext()

        // Get played track IDs to filter out
        const playedTrackIds = new Set(history.map(h => h.track_id))

        // Generate AI recommendations
        let searchQueries = await generateAIRecommendations(patterns, timeContext)

        // Fallback if AI fails
        if (searchQueries.length === 0) {
            searchQueries = generateFallbackQueries(patterns)
        }

        // Collect tracks from all queries
        const allTracks: any[] = []
        const trackIds = new Set<string>()

        // Also add Spotify recommendations API call with seed artists
        const artistSearchPromises = patterns.topArtists.slice(0, 2).map(async (artistName) => {
            try {
                const res = await fetch(
                    `${request.nextUrl.origin}/api/spotify?type=search&q=${encodeURIComponent(artistName)}&limit=1`
                )
                if (res.ok) {
                    const data = await res.json()
                    return data.artists?.items?.[0]?.id
                }
            } catch { }
            return null
        })

        const artistIds = (await Promise.all(artistSearchPromises)).filter(id => id)

        // Fetch from Spotify recommendations API with artist seeds
        if (artistIds.length > 0) {
            try {
                const seedArtists = artistIds.slice(0, 3).join(',')
                const seedGenres = patterns.topGenres.slice(0, 2).join(',')

                let recsUrl = `${request.nextUrl.origin}/api/spotify?type=recommendations&limit=${Math.floor(limit * 0.6)}`
                if (seedArtists) recsUrl += `&seed_artists=${seedArtists}`
                if (seedGenres) recsUrl += `&seed_genres=${seedGenres}`

                const recsRes = await fetch(recsUrl)
                if (recsRes.ok) {
                    const recsData = await recsRes.json()
                    const tracks = recsData.tracks || []
                    tracks.forEach((track: any) => {
                        if (!playedTrackIds.has(track.id) && !trackIds.has(track.id)) {
                            trackIds.add(track.id)
                            allTracks.push(track)
                        }
                    })
                }
            } catch (e) {
                console.error('Spotify recommendations error:', e)
            }
        }

        // Search for tracks based on AI queries
        const searchPromises = searchQueries.map(async (query) => {
            try {
                const res = await fetch(
                    `${request.nextUrl.origin}/api/spotify?type=search&q=${encodeURIComponent(query)}&limit=8`
                )
                if (res.ok) {
                    const data = await res.json()
                    return data.tracks?.items || []
                }
            } catch { }
            return []
        })

        const searchResults = await Promise.all(searchPromises)
        searchResults.flat().forEach((track: any) => {
            if (track && !playedTrackIds.has(track.id) && !trackIds.has(track.id) && track.album?.images?.length > 0) {
                trackIds.add(track.id)
                allTracks.push(track)
            }
        })

        // Shuffle and limit
        const shuffledTracks = allTracks
            .sort(() => Math.random() - 0.5)
            .slice(0, limit)

        // Create a descriptive "based on" message
        let basedOnMessage = ''
        if (patterns.topArtists.length > 0) {
            const artistsToShow = patterns.topArtists.slice(0, 2)
            basedOnMessage = `Berdasarkan ${artistsToShow.join(', ')} dan musik yang kamu suka`
        } else if (patterns.topGenres.length > 0) {
            basedOnMessage = `Berdasarkan genre ${patterns.topGenres[0]} yang kamu suka`
        }

        return NextResponse.json({
            tracks: shuffledTracks,
            basedOn: basedOnMessage,
            analysis: {
                topArtists: patterns.topArtists.slice(0, 3),
                topGenres: patterns.topGenres,
                timeContext: timeContext.period,
                diversity: patterns.listeningDiversity > 0.5 ? 'varied' : 'focused',
                totalAnalyzed: history.length
            },
            isAIPowered: searchQueries.length > 0,
            isPersonalized: true
        })

    } catch (error) {
        console.error('AI Recommendations API error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// Guest recommendations (generic popular music)
async function getGuestRecommendations(request: NextRequest, limit: number) {
    try {
        const timeContext = getTimeContext()

        // Choose genres based on time of day
        let genres: string[]
        if (timeContext.period === 'pagi') {
            genres = ['pop', 'indie', 'acoustic']
        } else if (timeContext.period === 'siang') {
            genres = ['pop', 'chill', 'r-n-b']
        } else if (timeContext.period === 'sore') {
            genres = ['pop', 'hip-hop', 'indie']
        } else {
            genres = ['chill', 'r-n-b', 'ambient']
        }

        const seedGenres = genres.sort(() => Math.random() - 0.5).slice(0, 3).join(',')

        const res = await fetch(
            `${request.nextUrl.origin}/api/spotify?type=recommendations&seed_genres=${seedGenres}&limit=${limit}`
        )

        if (!res.ok) {
            return NextResponse.json({
                tracks: [],
                isPersonalized: false,
                message: 'Login untuk rekomendasi personal'
            })
        }

        const data = await res.json()

        return NextResponse.json({
            tracks: data.tracks || [],
            basedOn: 'Musik populer pilihan untukmu',
            isPersonalized: false,
            isAIPowered: false,
            message: 'Login untuk rekomendasi yang lebih personal'
        })

    } catch (error) {
        console.error('Guest recommendations error:', error)
        return NextResponse.json({
            tracks: [],
            isPersonalized: false
        })
    }
}
