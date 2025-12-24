// app/api/playlists/[id]/save/route.ts
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

// POST - Save/follow a playlist
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

        // Check playlist exists and is public
        const { data: playlist } = await supabase
            .from('playlists')
            .select('id, user_id, is_public')
            .eq('id', id)
            .single();

        if (!playlist) {
            return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
        }

        if (!playlist.is_public) {
            return NextResponse.json({ error: 'Cannot save private playlist' }, { status: 403 });
        }

        if (playlist.user_id === user.id) {
            return NextResponse.json({ error: 'Cannot save your own playlist' }, { status: 400 });
        }

        // Save the playlist
        const { error } = await supabase
            .from('saved_playlists')
            .insert({
                user_id: user.id,
                playlist_id: id
            });

        if (error) {
            if (error.code === '23505') { // Already saved
                return NextResponse.json({ success: true, message: 'Already saved' });
            }
            throw error;
        }

        return NextResponse.json({ success: true, message: 'Playlist saved' });

    } catch (error) {
        console.error('Error saving playlist:', error);
        return NextResponse.json({ error: 'Failed to save playlist' }, { status: 500 });
    }
}

// DELETE - Unsave/unfollow a playlist
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

        const { error } = await supabase
            .from('saved_playlists')
            .delete()
            .eq('user_id', user.id)
            .eq('playlist_id', id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: 'Playlist unsaved' });

    } catch (error) {
        console.error('Error unsaving playlist:', error);
        return NextResponse.json({ error: 'Failed to unsave playlist' }, { status: 500 });
    }
}
