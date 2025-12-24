import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

    // Fetch subscription with plan info
    const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('daily_usage, plan_id, last_reset_date')
        .eq('user_id', user.id)
        .single()

    const today = new Date().toISOString().split('T')[0]
    const planId = subscription?.plan_id || 'free'
    let currentUsageBeforePlay = subscription?.daily_usage || 0
    const needsReset = !subscription || subscription.last_reset_date !== today

    // If new day, reset usage
    if (needsReset) {
        currentUsageBeforePlay = 0
    }

    // Get plan limit FIRST
    const { data: planData } = await supabase
        .from('plans')
        .select('daily_limit')
        .eq('id', planId)
        .single()

    const limit = planData?.daily_limit ?? 10

    // Handle unlimited (-1)
    if (limit === -1) {
        // Still track usage for analytics, but always allow
        const newUsage = currentUsageBeforePlay + 1

        if (subscription) {
            await supabase
                .from('user_subscriptions')
                .update({
                    daily_usage: needsReset ? 1 : newUsage,
                    last_reset_date: today
                })
                .eq('user_id', user.id)
        } else {
            await supabase
                .from('user_subscriptions')
                .insert({
                    user_id: user.id,
                    plan_id: 'free',
                    daily_usage: 1,
                    last_reset_date: today
                })
        }

        return NextResponse.json({
            success: true,
            currentUsage: needsReset ? 1 : newUsage,
            limit: -1,
            remaining: -1,
            allowed: true,
            unlimited: true,
            message: null
        })
    }

    // CHECK LIMIT BEFORE INCREMENT - This is the key fix!
    // If already at or over limit, REJECT without incrementing
    if (currentUsageBeforePlay >= limit) {
        return NextResponse.json({
            success: false,
            currentUsage: currentUsageBeforePlay,
            limit,
            remaining: 0,
            allowed: false,
            unlimited: false,
            message: `Batas harian ${limit} lagu tercapai. Upgrade untuk lanjut mendengarkan!`
        })
    }

    // User is allowed - NOW increment
    const newUsage = currentUsageBeforePlay + 1

    if (subscription) {
        if (needsReset) {
            await supabase
                .from('user_subscriptions')
                .update({ daily_usage: 1, last_reset_date: today })
                .eq('user_id', user.id)
        } else {
            await supabase
                .from('user_subscriptions')
                .update({ daily_usage: newUsage })
                .eq('user_id', user.id)
        }
    } else {
        // Create new subscription
        await supabase
            .from('user_subscriptions')
            .insert({
                user_id: user.id,
                plan_id: 'free',
                daily_usage: 1,
                last_reset_date: today
            })
    }

    const actualUsage = needsReset ? 1 : newUsage
    const remaining = Math.max(0, limit - actualUsage)
    // After this play, can they play more?
    const canPlayMore = actualUsage < limit

    return NextResponse.json({
        success: true,
        currentUsage: actualUsage,
        limit,
        remaining,
        allowed: canPlayMore,
        unlimited: false,
        message: canPlayMore ? null : `Ini lagu terakhir hari ini! Batas ${limit} lagu tercapai.`
    })
}
