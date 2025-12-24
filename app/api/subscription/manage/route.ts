import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Helper to get authenticated user
async function getAuthenticatedUser(request: NextRequest) {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { user: null, error: 'Unauthorized' }
    }

    const token = authHeader.replace('Bearer ', '')
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)
    const { data: { user }, error } = await supabaseClient.auth.getUser(token)

    if (error || !user) {
        return { user: null, error: 'Invalid token' }
    }

    return { user, error: null, supabaseClient }
}

// GET - Get detailed subscription info
export async function GET(request: NextRequest) {
    try {
        const { user, error, supabaseClient } = await getAuthenticatedUser(request)
        if (error || !user || !supabaseClient) {
            return NextResponse.json({ error }, { status: 401 })
        }

        // Get subscription with plan details
        const { data: subscription } = await supabaseClient
            .from('user_subscriptions')
            .select(`
                plan_id,
                daily_usage,
                last_reset_date,
                updated_at
            `)
            .eq('user_id', user.id)
            .single()

        // Get plan details
        const planId = subscription?.plan_id || 'free'
        const { data: plan } = await supabaseClient
            .from('plans')
            .select('*')
            .eq('id', planId)
            .single()

        // Get all available plans for comparison
        const { data: allPlans } = await supabaseClient
            .from('plans')
            .select('*')
            .order('price', { ascending: true })

        // Get last transaction for this user
        const { data: lastTransaction } = await supabaseClient
            .from('transactions')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'success')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        return NextResponse.json({
            subscription: {
                plan_id: planId,
                plan_name: plan?.name || 'Free',
                daily_limit: plan?.daily_limit || 25,
                daily_usage: subscription?.daily_usage || 0,
                price: plan?.price || 0,
                features: plan?.features || [],
                duration_type: plan?.duration_type || 'month',
                duration_value: plan?.duration_value || 1,
                updated_at: subscription?.updated_at || user.created_at,
                is_premium: planId !== 'free'
            },
            lastPayment: lastTransaction ? {
                amount: lastTransaction.amount,
                date: lastTransaction.created_at,
                plan_id: lastTransaction.plan_id
            } : null,
            availablePlans: allPlans || []
        })

    } catch (error) {
        console.error('Subscription manage GET error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PUT - Change subscription (upgrade/downgrade)
export async function PUT(request: NextRequest) {
    try {
        const { user, error, supabaseClient } = await getAuthenticatedUser(request)
        if (error || !user || !supabaseClient) {
            return NextResponse.json({ error }, { status: 401 })
        }

        const body = await request.json()
        const { new_plan_id } = body

        if (!new_plan_id) {
            return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 })
        }

        // Validate plan exists
        const { data: newPlan } = await supabaseClient
            .from('plans')
            .select('*')
            .eq('id', new_plan_id)
            .single()

        if (!newPlan) {
            return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
        }

        // Get current subscription
        const { data: currentSub } = await supabaseClient
            .from('user_subscriptions')
            .select('plan_id')
            .eq('user_id', user.id)
            .single()

        const currentPlanId = currentSub?.plan_id || 'free'

        // Get current plan details
        const { data: currentPlan } = await supabaseClient
            .from('plans')
            .select('price')
            .eq('id', currentPlanId)
            .single()

        // If downgrade to free - apply immediately
        if (new_plan_id === 'free') {
            const { error: updateError } = await supabaseClient
                .from('user_subscriptions')
                .upsert({
                    user_id: user.id,
                    plan_id: 'free',
                    daily_usage: 0,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' })

            if (updateError) {
                console.error('Downgrade error:', updateError)
                return NextResponse.json({ error: 'Failed to downgrade' }, { status: 500 })
            }

            return NextResponse.json({
                success: true,
                action: 'downgraded',
                message: 'Berhasil beralih ke paket Free',
                new_plan: {
                    id: 'free',
                    name: 'Free',
                    daily_limit: 25
                }
            })
        }

        // If upgrade (paid plan) - need to redirect to checkout
        if (newPlan.price > (currentPlan?.price || 0)) {
            return NextResponse.json({
                success: true,
                action: 'redirect_checkout',
                message: 'Silakan lanjutkan ke pembayaran',
                checkout_params: {
                    plan: new_plan_id,
                    name: newPlan.name,
                    price: newPlan.price.toString()
                }
            })
        }

        // Downgrade to lower paid plan - apply immediately (no refund logic for simplicity)
        const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .upsert({
                user_id: user.id,
                plan_id: new_plan_id,
                daily_usage: 0,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' })

        if (updateError) {
            console.error('Plan change error:', updateError)
            return NextResponse.json({ error: 'Failed to change plan' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            action: 'changed',
            message: `Berhasil beralih ke paket ${newPlan.name}`,
            new_plan: {
                id: new_plan_id,
                name: newPlan.name,
                daily_limit: newPlan.daily_limit
            }
        })

    } catch (error) {
        console.error('Subscription manage PUT error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE - Cancel subscription (downgrade to free)
export async function DELETE(request: NextRequest) {
    try {
        const { user, error, supabaseClient } = await getAuthenticatedUser(request)
        if (error || !user || !supabaseClient) {
            return NextResponse.json({ error }, { status: 401 })
        }

        // Get current subscription
        const { data: currentSub } = await supabaseClient
            .from('user_subscriptions')
            .select('plan_id')
            .eq('user_id', user.id)
            .single()

        if (!currentSub || currentSub.plan_id === 'free') {
            return NextResponse.json({ error: 'No active premium subscription' }, { status: 400 })
        }

        // Downgrade to free
        const { error: updateError } = await supabaseClient
            .from('user_subscriptions')
            .update({
                plan_id: 'free',
                daily_usage: 0,
                updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id)

        if (updateError) {
            console.error('Cancel subscription error:', updateError)
            return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: 'Langganan berhasil dibatalkan. Anda sekarang menggunakan paket Free.',
            new_plan: {
                id: 'free',
                name: 'Free',
                daily_limit: 25
            }
        })

    } catch (error) {
        console.error('Subscription manage DELETE error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
