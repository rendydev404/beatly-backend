import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import midtransClient from 'midtrans-client'

// Initialize Midtrans Core API to check transaction status
const core = new midtransClient.CoreApi({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
})

// Route to verify transaction status from Midtrans
export async function POST(req: Request) {
    console.log('=== VERIFY TRANSACTION CALLED ===')

    try {
        const body = await req.json()
        const { transactionId } = body

        console.log('Transaction ID:', transactionId)

        if (!transactionId) {
            return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
        }

        // Get user from auth
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabase.auth.getUser(token)

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Use service role for database operations
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

        // Get transaction from database
        const { data: transaction, error: txError } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .eq('id', transactionId)
            .eq('user_id', user.id)
            .single()

        if (txError || !transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
        }

        // If already success in our DB, return success
        if (transaction.status === 'success') {
            return NextResponse.json({
                status: 'success',
                transactionStatus: 'settlement',
                plan: transaction.plan_id,
                message: 'Pembayaran sudah berhasil sebelumnya'
            })
        }

        // CHECK ACTUAL STATUS FROM MIDTRANS API
        let midtransStatus
        try {
            midtransStatus = await core.transaction.status(transactionId)
            console.log('Midtrans status response:', midtransStatus)
        } catch (midtransError) {
            console.error('Midtrans status check failed:', midtransError)
            return NextResponse.json({
                status: 'pending',
                transactionStatus: 'pending',
                message: 'Pembayaran belum diterima'
            })
        }

        const txStatus = midtransStatus.transaction_status
        const fraudStatus = midtransStatus.fraud_status

        console.log('Transaction status from Midtrans:', txStatus)
        console.log('Fraud status:', fraudStatus)

        // Determine actual status
        let isSuccess = false
        let statusMessage = ''

        if (txStatus === 'capture' || txStatus === 'settlement') {
            if (fraudStatus === 'accept' || !fraudStatus) {
                isSuccess = true
                statusMessage = 'Pembayaran berhasil!'
            } else {
                statusMessage = 'Pembayaran ditolak karena fraud detection'
            }
        } else if (txStatus === 'pending') {
            statusMessage = 'Menunggu pembayaran'
        } else if (txStatus === 'deny' || txStatus === 'cancel' || txStatus === 'expire') {
            statusMessage = txStatus === 'expire' ? 'Pembayaran kedaluwarsa' : 'Pembayaran dibatalkan'
        } else {
            statusMessage = 'Status: ' + txStatus
        }

        // Only update to success if Midtrans confirms it
        if (isSuccess) {
            // Update transaction status
            await supabaseAdmin
                .from('transactions')
                .update({ status: 'success' })
                .eq('id', transactionId)

            // Fetch the plan details to get duration
            const { data: planData } = await supabaseAdmin
                .from('plans')
                .select('duration_type, duration_value')
                .eq('id', transaction.plan_id)
                .single()

            // Calculate expires_at based on plan duration
            let expiresAt: string | null = null
            if (planData && transaction.plan_id !== 'free') {
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

            // Update or create subscription
            const { data: existingSub } = await supabaseAdmin
                .from('user_subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .single()

            if (existingSub) {
                await supabaseAdmin
                    .from('user_subscriptions')
                    .update({
                        plan_id: transaction.plan_id,
                        daily_usage: 0,
                        expires_at: expiresAt,
                        updated_at: new Date().toISOString()
                    })
                    .eq('user_id', user.id)
            } else {
                await supabaseAdmin
                    .from('user_subscriptions')
                    .insert({
                        user_id: user.id,
                        plan_id: transaction.plan_id,
                        daily_usage: 0,
                        expires_at: expiresAt
                    })
            }

            console.log(`Subscription updated via verify for user ${user.id} to plan ${transaction.plan_id}, expires at: ${expiresAt}`)

            return NextResponse.json({
                status: 'success',
                transactionStatus: txStatus,
                plan: transaction.plan_id,
                expires_at: expiresAt,
                message: statusMessage
            })
        }

        // Return current status without updating
        return NextResponse.json({
            status: 'pending',
            transactionStatus: txStatus,
            message: statusMessage
        })

    } catch (error: unknown) {
        console.error('Verify Transaction Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
