// app/api/tripay/check-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTransactionDetail } from '@/lib/tripay';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const reference = searchParams.get('reference');
        const merchantRef = searchParams.get('merchant_ref');

        if (!reference && !merchantRef) {
            return NextResponse.json(
                { error: 'Reference or merchant_ref is required' },
                { status: 400 }
            );
        }

        // Check from database first
        if (merchantRef) {
            const { data: dbTransaction, error } = await supabase
                .from('transactions')
                .select('*')
                .eq('id', merchantRef)
                .single();

            if (dbTransaction && !error) {
                return NextResponse.json({
                    success: true,
                    data: {
                        reference: dbTransaction.payment_reference,
                        merchantRef: dbTransaction.id,
                        status: dbTransaction.status,
                        amount: dbTransaction.amount,
                        payCode: dbTransaction.pay_code,
                        payUrl: dbTransaction.pay_url,
                        checkoutUrl: dbTransaction.checkout_url,
                        qrUrl: dbTransaction.qr_url,
                        expiredAt: dbTransaction.expired_at,
                        paidAt: dbTransaction.paid_at,
                    },
                });
            }
        }

        // If not found in DB or need fresh data, check Tripay
        if (reference) {
            const transaction = await getTransactionDetail(reference);

            return NextResponse.json({
                success: true,
                data: {
                    reference: transaction.reference,
                    merchantRef: transaction.merchant_ref,
                    status: transaction.status,
                    amount: transaction.amount,
                    payCode: transaction.pay_code,
                    payUrl: transaction.pay_url,
                    checkoutUrl: transaction.checkout_url,
                    qrUrl: transaction.qr_url,
                    expiredTime: transaction.expired_time,
                    instructions: transaction.instructions,
                },
            });
        }

        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    } catch (error) {
        console.error('Check status error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to check status' },
            { status: 500 }
        );
    }
}
