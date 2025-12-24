import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Rendy@123';

// Create admin client with service role for full access
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Default developer settings
const defaultSettings = {
    id: 'main',
    name: 'Developer Name',
    title: 'Full Stack Developer',
    photo_url: '/pp.jpg',
    photo_expanded_url: '/pp1.jpg',
    is_visible: true,
    social_links: []
};

// GET - Public endpoint to fetch developer settings
export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('developer_settings')
            .select('*')
            .eq('id', 'main')
            .single();

        if (error) {
            // If table doesn't exist or no data, return defaults
            if (error.code === 'PGRST116' || error.code === '42P01') {
                return NextResponse.json(defaultSettings);
            }
            throw error;
        }

        return NextResponse.json(data || defaultSettings);
    } catch (error) {
        console.error('Error fetching developer settings:', error);
        return NextResponse.json(defaultSettings);
    }
}

// PUT - Admin only endpoint to update developer settings
export async function PUT(request: Request) {
    try {
        // Verify admin password
        const adminPassword = request.headers.get('x-admin-password');
        if (adminPassword !== ADMIN_PASSWORD) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, title, photo_url, photo_expanded_url, is_visible, social_links } = body;

        // Upsert the settings
        const { data, error } = await supabaseAdmin
            .from('developer_settings')
            .upsert({
                id: 'main',
                name: name || defaultSettings.name,
                title: title || defaultSettings.title,
                photo_url: photo_url || defaultSettings.photo_url,
                photo_expanded_url: photo_expanded_url || defaultSettings.photo_expanded_url,
                is_visible: is_visible !== undefined ? is_visible : defaultSettings.is_visible,
                social_links: social_links || defaultSettings.social_links,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error updating developer settings:', error);
        return NextResponse.json(
            { error: 'Failed to update developer settings' },
            { status: 500 }
        );
    }
}
