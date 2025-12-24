import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use RPC to ensure subscription exists (bypassing RLS issues)
    const { data: subscription, error: subError } = await supabase
        .rpc('ensure_user_subscription', { target_user_id: user.id })

    if (subError || !subscription) {
        console.error('Error ensuring subscription:', subError)
        return NextResponse.json({ allowed: false, message: 'Subscription error' })
    }

    // Check if subscription has expired
    const now = new Date()
    const expiresAt = subscription.expires_at ? new Date(subscription.expires_at) : null
    const isExpired = expiresAt && expiresAt < now && subscription.plan_id !== 'free'

    let effectivePlanId = subscription.plan_id

    if (isExpired) {
        // Subscription has expired - downgrade to free
        await supabaseAdmin
            .from('user_subscriptions')
            .update({
                plan_id: 'free',
                expires_at: null,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)

        console.log(`Subscription expired for user ${user.id}, downgraded to free plan`)
        effectivePlanId = 'free'
    }

    // Fetch plan details for the effective plan
    const { data: planData, error: planError } = await supabase
        .from('plans')
        .select('daily_limit')
        .eq('id', effectivePlanId)
        .single()

    if (planError || !planData) {
        return NextResponse.json({ allowed: false, message: 'Plan error' })
    }

    const limit = planData.daily_limit

    // Handle unlimited (-1)
    if (limit === -1) {
        return NextResponse.json({
            allowed: true,
            remaining: -1,
            limit: -1,
            currentUsage: subscription.daily_usage || 0,
            unlimited: true,
            is_expired: isExpired,
            effective_plan: effectivePlanId
        })
    }

    const today = new Date().toISOString().split('T')[0]
    const lastReset = subscription.last_reset_date
    let currentUsage = subscription.daily_usage || 0

    // Reset if new day
    if (lastReset !== today) {
        await supabase
            .from('user_subscriptions')
            .update({ daily_usage: 0, last_reset_date: today })
            .eq('user_id', user.id)
        currentUsage = 0
    }

    // Check if user can play more songs
    // If currentUsage >= limit, they are at limit and cannot play more
    const canPlay = currentUsage < limit
    const remaining = Math.max(0, limit - currentUsage)

    if (!canPlay) {
        return NextResponse.json({
            allowed: false,
            message: `Batas harian ${limit} lagu tercapai. Upgrade untuk lanjut mendengarkan!`,
            remaining: 0,
            currentUsage,
            limit,
            unlimited: false,
            is_expired: isExpired,
            effective_plan: effectivePlanId
        })
    }

    return NextResponse.json({
        allowed: true,
        remaining,
        currentUsage,
        limit,
        unlimited: false,
        is_expired: isExpired,
        effective_plan: effectivePlanId
    })
}
