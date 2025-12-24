import { NextResponse } from 'next/server';
import { getUnifiedMusicData } from '@/lib/unified-api';
import { validateApiKey } from '@/lib/api-keys';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');
    const apiKey = searchParams.get('apiKey') || req.headers.get('x-api-key');

    if (!apiKey) {
        return NextResponse.json({ error: 'API Key is required' }, { status: 401 });
    }

    if (!validateApiKey(apiKey)) {
        return NextResponse.json({ error: 'Invalid API Key' }, { status: 403 });
    }

    if (!query) {
        return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    try {
        const data = await getUnifiedMusicData(query);

        if (!data) {
            return NextResponse.json({ error: 'Track not found' }, { status: 404 });
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Unified API Error:', error);
        return NextResponse.json({
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
