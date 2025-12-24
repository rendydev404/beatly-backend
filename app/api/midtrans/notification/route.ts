import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import midtransClient from 'midtrans-client'

const apiClient = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
})

export async function POST(req: Request) {
    try {
        const notificationJson = await req.json()

        const statusResponse = await apiClient.transaction.notification(notificationJson)
        const orderId = statusResponse.order_id
        const transactionStatus = statusResponse.transaction_status
        const fraudStatus = statusResponse.fraud_status

        console.log(`Transaction notification received. Order ID: ${orderId}. Transaction status: ${transactionStatus}. Fraud status: ${fraudStatus}`)

        // Use SERVICE_ROLE_KEY for webhooks to bypass RLS
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

        let newStatus = 'pending'

        if (transactionStatus == 'capture') {
            if (fraudStatus == 'challenge') {
                newStatus = 'challenge'
            } else if (fraudStatus == 'accept') {
                newStatus = 'success'
            }
        } else if (transactionStatus == 'settlement') {
            newStatus = 'success'
        } else if (transactionStatus == 'cancel' || transactionStatus == 'deny' || transactionStatus == 'expire') {
            newStatus = 'failed'
        } else if (transactionStatus == 'pending') {
            newStatus = 'pending'
        }

        // Update transaction status
        const { data: transaction, error: txError } = await supabaseAdmin
            .from('transactions')
            .update({ status: newStatus })
            .eq('id', orderId)
            .select()
            .single()

        if (txError) {
            console.error('Error updating transaction:', txError)
            return NextResponse.json({ error: 'Database error' }, { status: 500 })
        }

        // If success, update user subscription
        if (newStatus === 'success' && transaction) {
            // Get the plan_id from transaction (it's stored as 'plus' or 'pro')
            const planIdMap: { [key: string]: string } = {
                'plus': 'plus',
                'pro': 'pro',
                'free': 'free'
            }

            const planId = planIdMap[transaction.plan_id] || transaction.plan_id

            // Fetch the plan details to get duration
            const { data: planData } = await supabaseAdmin
                .from('plans')
                .select('duration_type, duration_value')
                .eq('id', planId)
                .single()

            // Calculate expires_at based on plan duration
            let expiresAt: string | null = null
            if (planData && planId !== 'free') {
                const now = new Date()
                const { duration_type, duration_value } = planData

                switch (duration_type) {
                    case 'second':
                        now.setSeconds(now.getSeconds() + duration_value)
                        break
                    case 'minute':
                        now.setMinutes(now.getMinutes() + duration_value)
                        break
                    case 'hour':
                        now.setHours(now.getHours() + duration_value)
                        break
                    case 'day':
                        now.setDate(now.getDate() + duration_value)
                        break
                    case 'week':
                        now.setDate(now.getDate() + (duration_value * 7))
                        break
                    case 'month':
                        now.setMonth(now.getMonth() + duration_value)
                        break
                    case 'year':
                        now.setFullYear(now.getFullYear() + duration_value)
                        break
                }
                expiresAt = now.toISOString()
            }

            // Check if user has a subscription
            const { data: existingSub } = await supabaseAdmin
                .from('user_subscriptions')
                .select('*')
                .eq('user_id', transaction.user_id)
                .single()

            if (existingSub) {
                // Update existing subscription with expires_at
                await supabaseAdmin
                    .from('user_subscriptions')
                    .update({
                        plan_id: planId,
                        daily_usage: 0, // Reset usage on upgrade
                        expires_at: expiresAt,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', transaction.user_id)
            } else {
                // Create new subscription with expires_at
                await supabaseAdmin
                    .from('user_subscriptions')
                    .insert({
                        user_id: transaction.user_id,
                        plan_id: planId,
                        daily_usage: 0,
                        expires_at: expiresAt
                    })
            }

            console.log(`Subscription updated for user ${transaction.user_id} to plan ${planId}, expires at: ${expiresAt}`)
        }

        return NextResponse.json({ status: 'OK' })

    } catch (error: unknown) {
        console.error('Midtrans Notification Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
