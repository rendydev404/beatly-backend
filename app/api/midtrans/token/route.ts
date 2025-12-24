import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import midtransClient from 'midtrans-client'

const snap = new midtransClient.Snap({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
})

export async function POST(req: Request) {
    try {
        const { planId, price } = await req.json()

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        // Check auth
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error } = await supabase.auth.getUser(token)

        if (error || !user) {
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

        // Create a transaction record in DB (pending)
        const { data: transaction, error: txError } = await supabaseAdmin
            .from('transactions')
            .insert({
                user_id: user.id,
                plan_id: planId,
                amount: price,
                status: 'pending'
            })
            .select()
            .single()

        if (txError) throw txError

        // Create Snap Transaction
        const parameter = {
            transaction_details: {
                order_id: transaction.id,
                gross_amount: price
            },
            customer_details: {
                email: user.email,
            },
            callbacks: {
                finish: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pricing?status=success`
            }
        }

        const transactionToken = await snap.createTransaction(parameter)

        // Update transaction with token
        await supabaseAdmin
            .from('transactions')
            .update({ snap_token: transactionToken.token })
            .eq('id', transaction.id)

        return NextResponse.json({
            token: transactionToken.token,
            transactionId: transaction.id
        })

    } catch (error: unknown) {
        console.error('Midtrans Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
