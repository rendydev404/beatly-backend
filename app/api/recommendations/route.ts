import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface HistoryItem {
    artist_name: string
    track_id: string
}

export async function GET(request: NextRequest) {
    try {
        // Get auth token from header
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

        // Get user from token
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
        }

        // Get query params
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '20')

        // Fetch user's listening history to analyze preferences
        const { data: history, error: historyError } = await supabaseClient
            .from('listening_history')
            .select('artist_name, track_id')
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .limit(50) // Get last 50 plays for analysis

        if (historyError) {
            console.error('Error fetching history:', historyError)
            return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
        }

        // If no history, return empty
        if (!history || history.length === 0) {
            return NextResponse.json({ tracks: [], message: 'No listening history found' })
        }

        // Analyze listening history to find top artists
        const artistCounts: Record<string, number> = {}
        const playedTrackIds = new Set<string>()

        history.forEach((item: HistoryItem) => {
            artistCounts[item.artist_name] = (artistCounts[item.artist_name] || 0) + 1
            playedTrackIds.add(item.track_id)
        })

        // Get top 3 most listened artists
        const topArtists = Object.entries(artistCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name]) => name)

        if (topArtists.length === 0) {
            return NextResponse.json({ tracks: [], message: 'No artists found in history' })
        }

        // Search for artist IDs first
        const artistIds: string[] = []
        for (const artistName of topArtists) {
            try {
                const searchRes = await fetch(
                    `${request.nextUrl.origin}/api/spotify?type=search&q=${encodeURIComponent(artistName)}&limit=1`
                )
                if (searchRes.ok) {
                    const data = await searchRes.json()
                    if (data.artists?.items?.[0]?.id) {
                        artistIds.push(data.artists.items[0].id)
                    }
                }
            } catch (e) {
                console.error('Error searching artist:', e)
            }
        }

        if (artistIds.length === 0) {
            return NextResponse.json({ tracks: [], message: 'Could not find artist IDs' })
        }

        // Get recommendations based on seed artists (max 5 seeds allowed by Spotify)
        const seedArtists = artistIds.slice(0, 5).join(',')
        const recommendationsRes = await fetch(
            `${request.nextUrl.origin}/api/spotify?type=recommendations&seed_artists=${seedArtists}&limit=${limit + 10}`
        )

        if (!recommendationsRes.ok) {
            console.error('Recommendations API error')
            return NextResponse.json({ tracks: [], message: 'Failed to get recommendations' })
        }

        const recommendationsData = await recommendationsRes.json()
        const tracks = recommendationsData.tracks || []

        // Filter out tracks that user has already played
        const filteredTracks = tracks.filter((track: { id: string }) => !playedTrackIds.has(track.id))

        // Return recommended tracks (limited to requested amount)
        return NextResponse.json({
            tracks: filteredTracks.slice(0, limit),
            basedOn: topArtists,
            totalRecommendations: filteredTracks.length
        })

    } catch (error) {
        console.error('Recommendations API error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
