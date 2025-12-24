import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET - Check skip limit
export async function GET(req: Request) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get user from token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get user's subscription with plan details in one query
    const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
            plan_id,
            plans (
                skip_limit
            )
        `)
        .eq('user_id', user.id)
        .single();

    // Log for debugging
    console.log('Skip API - User:', user.id, 'Subscription:', subscription, 'Error:', subError);

    // Get skip limit from the joined plan data or fetch separately
    let skipLimit: number;
    let userPlan: string;

    if (subscription && subscription.plans) {
        // Got plan data from join - could be object or array depending on relation
        userPlan = subscription.plan_id;
        const plansData = subscription.plans as unknown;
        const plans = Array.isArray(plansData) ? plansData[0] : plansData;
        skipLimit = (plans as { skip_limit: number })?.skip_limit ?? 3;
        console.log('Skip limit from join:', skipLimit);
    } else {
        // Fallback: query plan directly
        userPlan = subscription?.plan_id || 'free';

        const { data: planData, error: planError } = await supabase
            .from('plans')
            .select('skip_limit')
            .eq('id', userPlan)
            .single();

        console.log('Skip limit fallback query - Plan:', userPlan, 'Data:', planData, 'Error:', planError);

        if (planData && planData.skip_limit !== null && planData.skip_limit !== undefined) {
            skipLimit = planData.skip_limit;
        } else {
            // Last resort: use default based on plan type
            if (userPlan === 'plus' || userPlan === 'pro') {
                skipLimit = -1; // Unlimited for paid plans
            } else {
                skipLimit = 3; // Default for free
            }
            console.log('Using default skip limit:', skipLimit);
        }
    }

    // If unlimited (-1), return immediately
    if (skipLimit === -1) {
        return NextResponse.json({
            currentSkips: 0,
            limit: -1,
            remaining: -1,
            allowed: true,
            unlimited: true,
            plan: userPlan,
            message: 'Unlimited skips'
        });
    }

    // Get today's skip count
    const today = new Date().toISOString().split('T')[0];
    const { data: skipData } = await supabase
        .from('daily_skips')
        .select('skip_count')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

    const currentSkips = skipData?.skip_count || 0;
    const remaining = Math.max(0, skipLimit - currentSkips);
    const allowed = currentSkips < skipLimit;

    return NextResponse.json({
        currentSkips,
        limit: skipLimit,
        remaining,
        allowed,
        unlimited: false,
        plan: userPlan
    });
}

// POST - Increment skip count
export async function POST(req: Request) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Get user from token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get user's subscription with plan details in one query
    const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select(`
            plan_id,
            plans (
                skip_limit
            )
        `)
        .eq('user_id', user.id)
        .single();

    // Get skip limit
    let skipLimit: number;
    let userPlan: string;

    if (subscription && subscription.plans) {
        userPlan = subscription.plan_id;
        const plansData = subscription.plans as unknown;
        const plans = Array.isArray(plansData) ? plansData[0] : plansData;
        skipLimit = (plans as { skip_limit: number })?.skip_limit ?? 3;
    } else {
        userPlan = subscription?.plan_id || 'free';

        const { data: planData } = await supabase
            .from('plans')
            .select('skip_limit')
            .eq('id', userPlan)
            .single();

        if (planData && planData.skip_limit !== null && planData.skip_limit !== undefined) {
            skipLimit = planData.skip_limit;
        } else {
            skipLimit = (userPlan === 'plus' || userPlan === 'pro') ? -1 : 3;
        }
    }

    // Check if unlimited (-1) - don't track skips
    if (skipLimit === -1) {
        return NextResponse.json({
            success: true,
            currentSkips: 0,
            limit: -1,
            remaining: -1,
            allowed: true,
            unlimited: true,
            message: 'Unlimited skips'
        });
    }

    // Get or create today's skip record
    const today = new Date().toISOString().split('T')[0];

    // Try to get existing record
    const { data: existingSkip } = await supabase
        .from('daily_skips')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

    let currentSkips = 0;

    if (existingSkip) {
        // Check if limit reached BEFORE incrementing
        if (existingSkip.skip_count >= skipLimit) {
            return NextResponse.json({
                success: false,
                currentSkips: existingSkip.skip_count,
                limit: skipLimit,
                remaining: 0,
                allowed: false,
                unlimited: false,
                message: `Batas skip harian (${skipLimit}x) sudah habis. Upgrade untuk unlimited skip!`
            });
        }

        // Increment existing record
        const { data: updated, error: updateError } = await supabase
            .from('daily_skips')
            .update({ skip_count: existingSkip.skip_count + 1 })
            .eq('id', existingSkip.id)
            .select()
            .single();

        if (updateError) {
            console.error('Error updating skip count:', updateError);
            return NextResponse.json({ error: 'Failed to update skip count' }, { status: 500 });
        }

        currentSkips = updated.skip_count;
    } else {
        // Create new record
        const { data: created, error: createError } = await supabase
            .from('daily_skips')
            .insert({
                user_id: user.id,
                date: today,
                skip_count: 1
            })
            .select()
            .single();

        if (createError) {
            console.error('Error creating skip record:', createError);
            return NextResponse.json({ error: 'Failed to create skip record' }, { status: 500 });
        }

        currentSkips = created.skip_count;
    }

    const remaining = Math.max(0, skipLimit - currentSkips);
    const allowed = currentSkips < skipLimit;

    return NextResponse.json({
        success: true,
        currentSkips,
        limit: skipLimit,
        remaining,
        allowed,
        unlimited: false,
        message: allowed ? `Sisa ${remaining} skip hari ini` : `Batas skip harian (${skipLimit}x) sudah habis`
    });
}
