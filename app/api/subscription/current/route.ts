import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: Request) {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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

        // Use service role for querying
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

        // Get user subscription
        const { data: subscription } = await supabaseAdmin
            .from('user_subscriptions')
            .select('*, plans(*)')
            .eq('user_id', user.id)
            .single()

        if (!subscription) {
            // Return free plan if no subscription exists
            return NextResponse.json({
                plan_id: 'free',
                plan_name: 'Free',
                daily_limit: 25,
                daily_usage: 0,
                expires_at: null,
                is_expired: false
            })
        }

        // Check if subscription has expired
        const now = new Date()
        const expiresAt = subscription.expires_at ? new Date(subscription.expires_at) : null
        const isExpired = expiresAt && expiresAt < now && subscription.plan_id !== 'free'

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

            return NextResponse.json({
                plan_id: 'free',
                plan_name: 'Free',
                daily_limit: 25,
                daily_usage: subscription.daily_usage || 0,
                expires_at: null,
                is_expired: true,
                expired_from: subscription.plan_id
            })
        }

        return NextResponse.json({
            plan_id: subscription.plan_id,
            plan_name: subscription.plans?.name || subscription.plan_id,
            daily_limit: subscription.plans?.daily_limit || 25,
            daily_usage: subscription.daily_usage || 0,
            expires_at: subscription.expires_at,
            is_expired: false
        })

    } catch (error: unknown) {
        console.error('Get Subscription Error:', error)
        return NextResponse.json({
            plan_id: 'free',
            plan_name: 'Free',
            daily_limit: 25,
            daily_usage: 0
        })
    }
}
