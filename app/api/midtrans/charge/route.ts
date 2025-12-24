import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// @ts-ignore
import midtransClient from 'midtrans-client'

interface MidtransAction {
    name: string
    url: string
}

interface MidtransResponse {
    transaction_id: string
    transaction_status: string
    expiry_time?: string
    actions?: MidtransAction[]
    va_numbers?: { bank: string; va_number: string }[]
    permata_va_number?: string
}

const core = new midtransClient.CoreApi({
    isProduction: false,
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
})

export async function POST(req: Request) {
    try {
        const { planId, price, paymentType, bank } = await req.json()

        console.log('Charge request:', { planId, price, paymentType, bank })

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

        if (txError) {
            console.error('Transaction insert error:', txError)
            throw txError
        }

        const orderId = transaction.id

        // Build charge parameter based on payment type
        const parameter: Record<string, unknown> = {
            transaction_details: {
                order_id: orderId,
                gross_amount: price
            },
            customer_details: {
                email: user.email,
            }
        }

        let chargeResponse: MidtransResponse

        try {
            switch (paymentType) {
                case 'qris':
                    parameter.payment_type = 'qris'
                    parameter.qris = {
                        acquirer: 'gopay'
                    }
                    chargeResponse = await core.charge(parameter)
                    break

                case 'bank_transfer':
                    parameter.payment_type = 'bank_transfer'
                    parameter.bank_transfer = {
                        bank: bank || 'bca'
                    }
                    chargeResponse = await core.charge(parameter)
                    break

                case 'gopay':
                    parameter.payment_type = 'gopay'
                    parameter.gopay = {
                        enable_callback: true,
                        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/thank-you?plan=${planId}&name=${planId === 'pro' ? 'Pro' : 'Plus'}`
                    }
                    chargeResponse = await core.charge(parameter)
                    break

                case 'shopeepay':
                    parameter.payment_type = 'shopeepay'
                    parameter.shopeepay = {
                        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/thank-you?plan=${planId}&name=${planId === 'pro' ? 'Pro' : 'Plus'}`
                    }
                    chargeResponse = await core.charge(parameter)
                    break

                default:
                    return NextResponse.json({ error: 'Invalid payment type' }, { status: 400 })
            }
        } catch (midtransError: unknown) {
            console.error('Midtrans API Error:', midtransError)
            // Delete the pending transaction since charge failed
            await supabaseAdmin.from('transactions').delete().eq('id', orderId)

            const errMsg = midtransError instanceof Error ? midtransError.message : 'Payment processing failed'
            return NextResponse.json({ error: errMsg }, { status: 500 })
        }

        console.log('Charge response:', chargeResponse)

        // Update transaction with midtrans response
        await supabaseAdmin
            .from('transactions')
            .update({
                midtrans_transaction_id: chargeResponse.transaction_id,
                snap_token: JSON.stringify(chargeResponse)
            })
            .eq('id', orderId)

        // Build response based on payment type
        const response: Record<string, unknown> = {
            orderId,
            status: chargeResponse.transaction_status,
            expiryTime: chargeResponse.expiry_time
        }

        // QRIS response
        if (paymentType === 'qris' && chargeResponse.actions) {
            const qrAction = chargeResponse.actions.find(a => a.name === 'generate-qr-code')
            if (qrAction) {
                response.qrCodeUrl = qrAction.url
            }
        }

        // GoPay response
        if (paymentType === 'gopay' && chargeResponse.actions) {
            const qrAction = chargeResponse.actions.find(a => a.name === 'generate-qr-code')
            const deepLinkAction = chargeResponse.actions.find(a => a.name === 'deeplink-redirect')
            if (qrAction) {
                response.qrCodeUrl = qrAction.url
            }
            if (deepLinkAction) {
                response.deepLinkUrl = deepLinkAction.url
            }
        }

        // ShopeePay response
        if (paymentType === 'shopeepay' && chargeResponse.actions) {
            const deepLinkAction = chargeResponse.actions.find(a => a.name === 'deeplink-redirect')
            if (deepLinkAction) {
                response.deepLinkUrl = deepLinkAction.url
            }
        }

        // Bank Transfer response
        if (paymentType === 'bank_transfer') {
            const vaNumbers = chargeResponse.va_numbers
            if (vaNumbers && vaNumbers.length > 0) {
                response.vaNumber = vaNumbers[0].va_number
                response.bankCode = vaNumbers[0].bank
            }
            // For Permata
            if (chargeResponse.permata_va_number) {
                response.vaNumber = chargeResponse.permata_va_number
                response.bankCode = 'permata'
            }
        }

        return NextResponse.json(response)

    } catch (error: unknown) {
        console.error('Midtrans Charge Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
