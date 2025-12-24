// app/api/playlists/[id]/route.ts
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

// GET - Get playlist detail
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = await getUserFromToken(request);

        // Get playlist with tracks
        const { data: playlist, error } = await supabase
            .from('playlists')
            .select(`
        *,
        playlist_tracks(
          id,
          track_id,
          track_name,
          artist_name,
          album_name,
          album_image,
          position,
          added_at
        )
      `)
            .eq('id', id)
            .single();

        if (error || !playlist) {
            return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
        }

        // Check access permission
        if (!playlist.is_public && playlist.user_id !== user?.id) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Sort tracks by position
        const tracks = (playlist.playlist_tracks || []).sort((a: any, b: any) => a.position - b.position);

        // Get save count
        const { count: saveCount } = await supabase
            .from('saved_playlists')
            .select('*', { count: 'exact', head: true })
            .eq('playlist_id', id);

        // Check if user has saved this playlist
        let is_saved = false;
        if (user && playlist.user_id !== user.id) {
            const { data: savedCheck } = await supabase
                .from('saved_playlists')
                .select('id')
                .eq('playlist_id', id)
                .eq('user_id', user.id)
                .single();
            is_saved = !!savedCheck;
        }

        // Get owner info
        const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('full_name, avatar_url')
            .eq('user_id', playlist.user_id)
            .single();

        return NextResponse.json({
            ...playlist,
            tracks,
            track_count: tracks.length,
            save_count: saveCount || 0,
            is_owner: user?.id === playlist.user_id,
            is_saved,
            owner: ownerProfile || { full_name: 'User', avatar_url: null }
        });

    } catch (error) {
        console.error('Error fetching playlist:', error);
        return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: 500 });
    }
}

// PUT - Update playlist
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = await getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check ownership
        const { data: existingPlaylist } = await supabase
            .from('playlists')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!existingPlaylist || existingPlaylist.user_id !== user.id) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const updates: any = {};

        if (body.name !== undefined) updates.name = body.name.trim();
        if (body.description !== undefined) updates.description = body.description?.trim() || null;
        if (body.is_public !== undefined) updates.is_public = body.is_public;
        if (body.cover_image !== undefined) updates.cover_image = body.cover_image;

        updates.updated_at = new Date().toISOString();

        const { data: playlist, error } = await supabase
            .from('playlists')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, playlist });

    } catch (error) {
        console.error('Error updating playlist:', error);
        return NextResponse.json({ error: 'Failed to update playlist' }, { status: 500 });
    }
}

// DELETE - Delete playlist
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = await getUserFromToken(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check ownership
        const { data: existingPlaylist } = await supabase
            .from('playlists')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!existingPlaylist || existingPlaylist.user_id !== user.id) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { error } = await supabase
            .from('playlists')
            .delete()
            .eq('id', id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Playlist deleted' });

    } catch (error) {
        console.error('Error deleting playlist:', error);
        return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 });
    }
}
