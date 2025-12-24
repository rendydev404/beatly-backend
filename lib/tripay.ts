// lib/tripay.ts
import crypto from 'crypto';

const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY || '';
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY || '';
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE || '';
const IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true';

const BASE_URL = IS_PRODUCTION
    ? 'https://tripay.co.id/api'
    : 'https://tripay.co.id/api-sandbox';

interface TripayChannel {
    group: string;
    code: string;
    name: string;
    type: string;
    fee_merchant: { flat: number; percent: string };
    fee_customer: { flat: number; percent: string };
    total_fee: { flat: number; percent: string };
    minimum_fee: number;
    maximum_fee: number;
    icon_url: string;
    active: boolean;
}

interface TripayTransaction {
    reference: string;
    merchant_ref: string;
    payment_selection_type: string;
    payment_method: string;
    payment_name: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    callback_url: string;
    return_url: string;
    amount: number;
    fee_merchant: number;
    fee_customer: number;
    total_fee: number;
    amount_received: number;
    pay_code: string;
    pay_url: string | null;
    checkout_url: string;
    status: string;
    expired_time: number;
    order_items: Array<{
        sku: string;
        name: string;
        price: number;
        quantity: number;
        subtotal: number;
    }>;
    instructions: Array<{
        title: string;
        steps: string[];
    }>;
    qr_string?: string;
    qr_url?: string;
}

// Generate signature for requests
function generateSignature(merchantRef: string, amount: number): string {
    const data = TRIPAY_MERCHANT_CODE + merchantRef + amount;
    return crypto.createHmac('sha256', TRIPAY_PRIVATE_KEY).update(data).digest('hex');
}

// Generate callback signature for verification
export function generateCallbackSignature(data: string): string {
    return crypto.createHmac('sha256', TRIPAY_PRIVATE_KEY).update(data).digest('hex');
}

// Get available payment channels
export async function getPaymentChannels(): Promise<TripayChannel[]> {
    try {
        const response = await fetch(`${BASE_URL}/merchant/payment-channel`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TRIPAY_API_KEY}`,
            },
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to get payment channels');
        }

        return result.data;
    } catch (error) {
        console.error('Error getting payment channels:', error);
        throw error;
    }
}

// Create closed payment transaction
export async function createTransaction(params: {
    method: string;
    merchantRef: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    orderItems: Array<{
        sku?: string;
        name: string;
        price: number;
        quantity: number;
    }>;
    callbackUrl: string;
    returnUrl: string;
    expiredTime?: number; // in seconds, default 24 hours
}): Promise<TripayTransaction> {
    const {
        method,
        merchantRef,
        amount,
        customerName,
        customerEmail,
        customerPhone = '',
        orderItems,
        callbackUrl,
        returnUrl,
        expiredTime = 24 * 60 * 60, // 24 hours default
    } = params;

    const signature = generateSignature(merchantRef, amount);
    const expiry = Math.floor(Date.now() / 1000) + expiredTime;

    const payload = {
        method,
        merchant_ref: merchantRef,
        amount,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_items: orderItems.map(item => ({
            sku: item.sku || item.name.toLowerCase().replace(/\s+/g, '-'),
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            subtotal: item.price * item.quantity,
        })),
        callback_url: callbackUrl,
        return_url: returnUrl,
        expired_time: expiry,
        signature,
    };

    try {
        const response = await fetch(`${BASE_URL}/transaction/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TRIPAY_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (!result.success) {
            console.error('Tripay error:', result);
            throw new Error(result.message || 'Failed to create transaction');
        }

        return result.data;
    } catch (error) {
        console.error('Error creating transaction:', error);
        throw error;
    }
}

// Get transaction detail
export async function getTransactionDetail(reference: string): Promise<TripayTransaction> {
    try {
        const response = await fetch(`${BASE_URL}/transaction/detail?reference=${reference}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${TRIPAY_API_KEY}`,
            },
        });

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to get transaction detail');
        }

        return result.data;
    } catch (error) {
        console.error('Error getting transaction detail:', error);
        throw error;
    }
}

// Verify callback signature
export function verifyCallbackSignature(jsonData: string, receivedSignature: string): boolean {
    const calculatedSignature = generateCallbackSignature(jsonData);
    return calculatedSignature === receivedSignature;
}

// Calculate fee for a payment method
export async function calculateFee(code: string, amount: number): Promise<{
    code: string;
    name: string;
    fee: number;
    total: number;
}> {
    try {
        const response = await fetch(
            `${BASE_URL}/merchant/fee-calculator?code=${code}&amount=${amount}`,
            {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${TRIPAY_API_KEY}`,
                },
            }
        );

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to calculate fee');
        }

        const data = result.data[0];
        return {
            code: data.code,
            name: data.name,
            fee: data.total_fee.customer,
            total: amount + data.total_fee.customer,
        };
    } catch (error) {
        console.error('Error calculating fee:', error);
        throw error;
    }
}
