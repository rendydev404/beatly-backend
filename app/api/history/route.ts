import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
    try {
        // Get auth token from header
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')

        // Create client with user token to verify user
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

        // Get user from token
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
        }

        // Get query params
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')

        // Fetch listening history
        const { data: history, error: historyError } = await supabaseClient
            .from('listening_history')
            .select('*')
            .eq('user_id', user.id)
            .order('played_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (historyError) {
            console.error('Error fetching history:', historyError)
            return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
        }

        // Get total count
        const { count } = await supabaseClient
            .from('listening_history')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)

        return NextResponse.json({
            history: history || [],
            total: count || 0,
            limit,
            offset
        })

    } catch (error) {
        console.error('History API error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
