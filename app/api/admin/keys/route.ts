import { NextResponse } from 'next/server';
import { getApiKeys, generateApiKey, revokeApiKey } from '@/lib/api-keys';

// In a real app, you should add authentication middleware here to ensure only admins can access this.
// For this project, we assume the route is protected or local usage.

export async function GET() {
    const keys = getApiKeys();
    return NextResponse.json(keys);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const newKey = generateApiKey(name);
        return NextResponse.json(newKey);
    } catch (error) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}

export async function DELETE(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const success = revokeApiKey(id);

    if (success) {
        return NextResponse.json({ success: true });
    } else {
        return NextResponse.json({ error: 'Key not found' }, { status: 404 });
    }
}
