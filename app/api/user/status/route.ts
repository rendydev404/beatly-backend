import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role to check block status
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Check if current user is blocked
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')

        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ isBlocked: false })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

        if (userError || !user) {
            return NextResponse.json({ isBlocked: false })
        }

        // Check subscription for block status
        const { data: subscription, error: subError } = await supabaseAdmin
            .from('user_subscriptions')
            .select('is_blocked, blocked_until, block_reason')
            .eq('user_id', user.id)
            .single()

        if (subError || !subscription) {
            return NextResponse.json({ isBlocked: false })
        }

        // Check if blocked
        if (!subscription.is_blocked) {
            return NextResponse.json({ isBlocked: false })
        }

        // Check if block has expired
        if (subscription.blocked_until) {
            const blockedUntil = new Date(subscription.blocked_until)
            const now = new Date()

            if (blockedUntil < now) {
                // Block has expired - auto unblock
                await supabaseAdmin
                    .from('user_subscriptions')
                    .update({
                        is_blocked: false,
                        blocked_until: null,
                        block_reason: null
                    })
                    .eq('user_id', user.id)

                return NextResponse.json({ isBlocked: false })
            }

            // Still blocked - return details
            return NextResponse.json({
                isBlocked: true,
                blockedUntil: subscription.blocked_until,
                blockReason: subscription.block_reason,
                isPermanent: blockedUntil.getFullYear() >= 9999
            })
        }

        // Blocked with no expiry (shouldn't happen but handle it)
        return NextResponse.json({
            isBlocked: true,
            blockReason: subscription.block_reason,
            isPermanent: true
        })

    } catch (error) {
        console.error('User status check error:', error)
        return NextResponse.json({ isBlocked: false })
    }
}
