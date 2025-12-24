// app/api/tripay/create-payment/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createTransaction } from '@/lib/tripay';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            planId,
            planName,
            amount,
            paymentMethod,
            userId,
            userEmail,
            userName
        } = body;

        if (!planId || !amount || !paymentMethod || !userId || !userEmail) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Generate unique merchant reference
        const merchantRef = `BEATLY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

        // Create transaction in Tripay
        const callbackUrl = `${process.env.NEXT_PUBLIC_API_URL || process.env.VERCEL_URL || 'http://localhost:3001'}/api/tripay/callback`;
        const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/thank-you?ref=${merchantRef}`;

        const transaction = await createTransaction({
            method: paymentMethod,
            merchantRef,
            amount,
            customerName: userName || 'Beatly User',
            customerEmail: userEmail,
            orderItems: [
                {
                    name: planName || 'Beatly Premium',
                    price: amount,
                    quantity: 1,
                },
            ],
            callbackUrl,
            returnUrl,
            expiredTime: 24 * 60 * 60, // 24 hours
        });

        // Save transaction to database
        const { error: dbError } = await supabase.from('transactions').insert({
            id: merchantRef,
            user_id: userId,
            plan_id: planId,
            amount,
            payment_method: paymentMethod,
            payment_reference: transaction.reference,
            status: 'PENDING',
            pay_code: transaction.pay_code,
            pay_url: transaction.pay_url,
            checkout_url: transaction.checkout_url,
            qr_url: transaction.qr_url || null,
            qr_string: transaction.qr_string || null,
            expired_at: new Date(transaction.expired_time * 1000).toISOString(),
            created_at: new Date().toISOString(),
        });

        if (dbError) {
            console.error('Database error:', dbError);
            // Continue anyway, transaction is created in Tripay
        }

        return NextResponse.json({
            success: true,
            data: {
                reference: transaction.reference,
                merchantRef,
                payCode: transaction.pay_code,
                payUrl: transaction.pay_url,
                checkoutUrl: transaction.checkout_url,
                qrUrl: transaction.qr_url,
                qrString: transaction.qr_string,
                amount: transaction.amount,
                fee: transaction.total_fee,
                total: transaction.amount + transaction.total_fee,
                expiredTime: transaction.expired_time,
                instructions: transaction.instructions,
                paymentName: transaction.payment_name,
            },
        });
    } catch (error) {
        console.error('Create payment error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create payment' },
            { status: 500 }
        );
    }
}
