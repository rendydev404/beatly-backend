// app/api/tripay/channels/route.ts
import { NextResponse } from 'next/server';
import { getPaymentChannels } from '@/lib/tripay';

export async function GET() {
    try {
        const channels = await getPaymentChannels();

        // Filter only active channels and group by type
        const activeChannels = channels.filter(ch => ch.active);

        // Group channels
        const grouped = {
            virtual_account: activeChannels.filter(ch => ch.group === 'Virtual Account'),
            ewallet: activeChannels.filter(ch => ch.group === 'E-Wallet'),
            convenience_store: activeChannels.filter(ch => ch.group === 'Convenience Store'),
            others: activeChannels.filter(ch =>
                !['Virtual Account', 'E-Wallet', 'Convenience Store'].includes(ch.group)
            ),
        };

        return NextResponse.json({
            success: true,
            data: {
                channels: activeChannels,
                grouped,
            },
        });
    } catch (error) {
        console.error('Get channels error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to get payment channels' },
            { status: 500 }
        );
    }
}
