import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface HistoryEntry {
    track_id: string
    track_name: string
    artist_name: string
    album_name?: string
    album_image?: string
    genre?: string
}

export async function POST(request: NextRequest) {
    try {
        // Get auth token from header
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')

        // Create client with service key
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

        // Get user from token
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
        }

        // Get track data from body
        const body: HistoryEntry = await request.json()

        if (!body.track_id || !body.track_name || !body.artist_name) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        // Check if same track was played in last 30 seconds (prevent duplicates from repeat)
        const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString()
        const { data: recentPlay } = await supabaseClient
            .from('listening_history')
            .select('id')
            .eq('user_id', user.id)
            .eq('track_id', body.track_id)
            .gte('played_at', thirtySecondsAgo)
            .single()

        if (recentPlay) {
            // Skip duplicate
            return NextResponse.json({ success: true, message: 'Already recorded recently' })
        }

        // Insert listening history
        const { error: insertError } = await supabaseClient
            .from('listening_history')
            .insert({
                user_id: user.id,
                track_id: body.track_id,
                track_name: body.track_name,
                artist_name: body.artist_name,
                album_name: body.album_name || null,
                album_image: body.album_image || null,
                genre: body.genre || null
            })

        if (insertError) {
            console.error('Error inserting history:', insertError)
            return NextResponse.json({ error: 'Failed to add to history' }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('History add API error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
