import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_PASSWORD = 'Rendy@123'

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase.from('plans').select('*').order('price')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
}

export async function PUT(req: Request) {
    const password = req.headers.get('x-admin-password')

    if (password !== ADMIN_PASSWORD) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
        id,
        name,
        price,
        daily_limit,
        features,
        duration_type,
        duration_value,
        is_popular,
        skip_limit
    } = await req.json()

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const updateData: Record<string, unknown> = {}

    if (name !== undefined) updateData.name = name
    if (price !== undefined) updateData.price = price
    if (daily_limit !== undefined) updateData.daily_limit = daily_limit
    if (features !== undefined) updateData.features = features
    if (duration_type !== undefined) updateData.duration_type = duration_type
    if (duration_value !== undefined) updateData.duration_value = duration_value
    if (is_popular !== undefined) updateData.is_popular = is_popular
    if (skip_limit !== undefined) updateData.skip_limit = skip_limit

    const { data, error } = await supabase
        .from('plans')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data)
}
