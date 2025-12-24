// app/api/playlists/public/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// GET - Search/list public playlists
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = parseInt(searchParams.get('offset') || '0');

        let queryBuilder = supabase
            .from('playlists')
            .select(`
        *,
        playlist_tracks(count)
      `)
            .eq('is_public', true)
            .order('updated_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Add search filter if query provided
        if (query && query.trim()) {
            queryBuilder = queryBuilder.ilike('name', `%${query.trim()}%`);
        }

        const { data: playlists, error, count } = await queryBuilder;

        if (error) throw error;

        // Format response
        const formattedPlaylists = (playlists || []).map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            cover_image: p.cover_image,
            is_public: p.is_public,
            user_id: p.user_id,
            created_at: p.created_at,
            updated_at: p.updated_at,
            track_count: p.playlist_tracks?.[0]?.count || 0
        }));

        // Get owner info for all playlists
        const userIds = [...new Set(formattedPlaylists.map(p => p.user_id))];
        const { data: profiles } = await supabase
            .from('user_profiles')
            .select('user_id, full_name, avatar_url')
            .in('user_id', userIds);

        const profileMap = new Map(
            (profiles || []).map(p => [p.user_id, { full_name: p.full_name, avatar_url: p.avatar_url }])
        );

        const withOwners = formattedPlaylists.map(p => ({
            ...p,
            owner: profileMap.get(p.user_id) || { full_name: 'User', avatar_url: null }
        }));

        return NextResponse.json({
            playlists: withOwners,
            total: count,
            has_more: (offset + limit) < (count || 0)
        });

    } catch (error) {
        console.error('Error fetching public playlists:', error);
        return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 });
    }
}
