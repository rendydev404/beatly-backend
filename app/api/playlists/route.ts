// app/api/playlists/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Helper to get user from token
async function getUserFromToken(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
}

// GET - List user's playlists (owned + saved)
export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get owned playlists
        const { data: ownedPlaylists, error: ownedError } = await supabase
            .from('playlists')
            .select(`
        *,
        playlist_tracks(count),
        saved_playlists(count)
      `)
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (ownedError) throw ownedError;

        // Get saved playlists
        const { data: savedData, error: savedError } = await supabase
            .from('saved_playlists')
            .select(`
        playlist_id,
        saved_at,
        playlists(
          *,
          playlist_tracks(count)
        )
      `)
            .eq('user_id', user.id)
            .order('saved_at', { ascending: false });

        if (savedError) throw savedError;

        // Format owned playlists
        const owned = (ownedPlaylists || []).map(p => ({
            ...p,
            track_count: p.playlist_tracks?.[0]?.count || 0,
            save_count: p.saved_playlists?.[0]?.count || 0,
            is_owner: true,
            is_saved: false
        }));

        // Format saved playlists
        const saved = (savedData || []).map((s: any) => ({
            ...(s.playlists as any),
            track_count: (s.playlists as any)?.playlist_tracks?.[0]?.count || 0,
            saved_at: s.saved_at,
            is_owner: false,
            is_saved: true
        }));

        return NextResponse.json({
            owned,
            saved,
            total: owned.length + saved.length
        });

    } catch (error) {
        console.error('Error fetching playlists:', error);
        return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 });
    }
}

// POST - Create new playlist
export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, description, is_public = false, cover_image } = body;

        if (!name || name.trim().length === 0) {
            return NextResponse.json({ error: 'Playlist name is required' }, { status: 400 });
        }

        const { data: playlist, error } = await supabase
            .from('playlists')
            .insert({
                user_id: user.id,
                name: name.trim(),
                description: description?.trim() || null,
                is_public,
                cover_image: cover_image || null
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({
            success: true,
            playlist: {
                ...playlist,
                track_count: 0,
                save_count: 0,
                is_owner: true
            }
        });

    } catch (error) {
        console.error('Error creating playlist:', error);
        return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 });
    }
}
