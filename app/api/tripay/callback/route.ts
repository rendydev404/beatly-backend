// app/api/tripay/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyCallbackSignature } from '@/lib/tripay';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
    try {
        const rawBody = await request.text();
        const signature = request.headers.get('X-Callback-Signature');

        // Verify signature
        if (!signature || !verifyCallbackSignature(rawBody, signature)) {
            console.error('Invalid callback signature');
            return NextResponse.json({ success: false, message: 'Invalid signature' }, { status: 403 });
        }

        const body = JSON.parse(rawBody);
        const {
            reference,
            merchant_ref,
            status,
            amount_received,
            paid_at
        } = body;

        console.log('Tripay callback received:', { reference, merchant_ref, status });

        // Map Tripay status to our status
        let transactionStatus = 'PENDING';
        if (status === 'PAID') {
            transactionStatus = 'SUCCESS';
        } else if (status === 'EXPIRED') {
            transactionStatus = 'EXPIRED';
        } else if (status === 'FAILED') {
            transactionStatus = 'FAILED';
        } else if (status === 'REFUND') {
            transactionStatus = 'REFUNDED';
        }

        // Update transaction in database
        const { data: transaction, error: fetchError } = await supabase
            .from('transactions')
            .select('*, user_id, plan_id')
            .eq('id', merchant_ref)
            .single();

        if (fetchError || !transaction) {
            console.error('Transaction not found:', merchant_ref);
            return NextResponse.json({ success: false, message: 'Transaction not found' }, { status: 404 });
        }

        // Update transaction status
        const { error: updateError } = await supabase
            .from('transactions')
            .update({
                status: transactionStatus,
                amount_received: amount_received || null,
                paid_at: paid_at || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', merchant_ref);

        if (updateError) {
            console.error('Error updating transaction:', updateError);
        }

        // If payment successful, update user subscription
        if (transactionStatus === 'SUCCESS') {
            // Get plan details
            const { data: plan } = await supabase
                .from('plans')
                .select('*')
                .eq('id', transaction.plan_id)
                .single();

            if (plan) {
                const now = new Date();
                const expiresAt = new Date(now);
                expiresAt.setMonth(expiresAt.getMonth() + (plan.duration_months || 1));

                // Update or create subscription
                const { error: subError } = await supabase
                    .from('subscriptions')
                    .upsert({
                        user_id: transaction.user_id,
                        plan_id: plan.id,
                        status: 'active',
                        started_at: now.toISOString(),
                        expires_at: expiresAt.toISOString(),
                        updated_at: now.toISOString(),
                    }, {
                        onConflict: 'user_id',
                    });

                if (subError) {
                    console.error('Error updating subscription:', subError);
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Callback processing error:', error);
        return NextResponse.json(
            { success: false, message: 'Internal server error' },
            { status: 500 }
        );
    }
}
