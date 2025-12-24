// app/api/playlists/[id]/tracks/route.ts
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

// GET - Get tracks in playlist
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const user = await getUserFromToken(request);

        // Check playlist exists and is accessible
        const { data: playlist } = await supabase
            .from('playlists')
            .select('id, user_id, is_public')
            .eq('id', id)
            .single();

        if (!playlist) {
            return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
        }

        if (!playlist.is_public && playlist.user_id !== user?.id) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { data: tracks, error } = await supabase
            .from('playlist_tracks')
            .select('*')
            .eq('playlist_id', id)
            .order('position', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ tracks: tracks || [] });

    } catch (error) {
        console.error('Error fetching playlist tracks:', error);
        return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 });
    }
}

// POST - Add track to playlist
export async function POST(
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
        const { data: playlist } = await supabase
            .from('playlists')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!playlist || playlist.user_id !== user.id) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const body = await request.json();
        const { track_id, track_name, artist_name, album_name, album_image } = body;

        if (!track_id || !track_name || !artist_name) {
            return NextResponse.json({ error: 'Missing required track data' }, { status: 400 });
        }

        // Get the next position
        const { data: lastTrack } = await supabase
            .from('playlist_tracks')
            .select('position')
            .eq('playlist_id', id)
            .order('position', { ascending: false })
            .limit(1)
            .single();

        const nextPosition = (lastTrack?.position ?? -1) + 1;

        // Insert track
        const { data: newTrack, error } = await supabase
            .from('playlist_tracks')
            .insert({
                playlist_id: id,
                track_id,
                track_name,
                artist_name,
                album_name: album_name || null,
                album_image: album_image || null,
                position: nextPosition
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return NextResponse.json({ error: 'Track already in playlist' }, { status: 409 });
            }
            throw error;
        }

        return NextResponse.json({ success: true, track: newTrack });

    } catch (error) {
        console.error('Error adding track:', error);
        return NextResponse.json({ error: 'Failed to add track' }, { status: 500 });
    }
}

// DELETE - Remove track from playlist
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
        const { data: playlist } = await supabase
            .from('playlists')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!playlist || playlist.user_id !== user.id) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const trackId = searchParams.get('track_id');

        if (!trackId) {
            return NextResponse.json({ error: 'track_id is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('playlist_tracks')
            .delete()
            .eq('playlist_id', id)
            .eq('track_id', trackId);

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Track removed' });

    } catch (error) {
        console.error('Error removing track:', error);
        return NextResponse.json({ error: 'Failed to remove track' }, { status: 500 });
    }
}
