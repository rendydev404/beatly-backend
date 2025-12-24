import { supabase } from './supabase'

export interface UserSubscription {
    user_id: string
    plan_id: string
    daily_usage: number
    last_reset_date: string
    plans: {
        daily_limit: number
        name: string
    }
}

export async function getUserSubscription(userId: string) {
    const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
      *,
      plans (
        daily_limit,
        name
      )
    `)
        .eq('user_id', userId)
        .single()

    if (error) {
        console.error('Error fetching subscription:', error)
        return null
    }

    return data as UserSubscription
}

export async function checkDailyLimit(userId: string): Promise<{ allowed: boolean; message?: string; remaining?: number }> {
    const subscription = await getUserSubscription(userId)

    if (!subscription) {
        // If no subscription record, assume free tier or create one (handled by trigger usually)
        // For safety, deny if not found to prevent abuse, or allow if we trust the trigger
        return { allowed: false, message: 'Subscription not found' }
    }

    const today = new Date().toISOString().split('T')[0]
    const lastReset = subscription.last_reset_date
    const limit = subscription.plans.daily_limit

    // Reset if new day
    if (lastReset !== today) {
        await supabase
            .from('user_subscriptions')
            .update({ daily_usage: 0, last_reset_date: today })
            .eq('user_id', userId)

        return { allowed: true, remaining: limit }
    }

    if (subscription.daily_usage >= limit) {
        return {
            allowed: false,
            message: `Daily limit of ${limit} songs reached. Upgrade to listen more!`
        }
    }

    return { allowed: true, remaining: limit - subscription.daily_usage }
}

export async function incrementDailyUsage(userId: string) {
    const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('daily_usage')
        .eq('user_id', userId)
        .single()

    if (subscription) {
        await supabase
            .from('user_subscriptions')
            .update({ daily_usage: subscription.daily_usage + 1 })
            .eq('user_id', userId)
    }
}
