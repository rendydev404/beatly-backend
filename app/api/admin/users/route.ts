import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role for admin operations
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Verify admin status
async function verifyAdmin(request: NextRequest): Promise<{ isAdmin: boolean; error?: string }> {
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return { isAdmin: false, error: 'No authorization token' }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabaseAdmin.auth.getUser(token)

    if (!user?.email) {
        return { isAdmin: false, error: 'Invalid token' }
    }

    const { data: admin } = await supabaseAdmin
        .from('admin_users')
        .select('email')
        .eq('email', user.email.toLowerCase())
        .single()

    if (!admin) {
        return { isAdmin: false, error: 'Not an admin' }
    }

    return { isAdmin: true }
}

// GET - List all users with their subscription info
export async function GET(request: NextRequest) {
    try {
        const adminCheck = await verifyAdmin(request)
        if (!adminCheck.isAdmin) {
            return NextResponse.json({ error: adminCheck.error }, { status: 403 })
        }

        // Get search query
        const { searchParams } = new URL(request.url)
        const search = searchParams.get('search') || ''
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = (page - 1) * limit

        // Get all users from auth.users via admin API
        const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
            page: page,
            perPage: limit
        })

        if (authError) {
            console.error('Error fetching users:', authError)
            return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
        }

        // Get user subscriptions
        const userIds = authUsers.users.map(u => u.id)
        const { data: subscriptions } = await supabaseAdmin
            .from('user_subscriptions')
            .select('*')
            .in('user_id', userIds)

        // Get user profiles
        const { data: profiles } = await supabaseAdmin
            .from('user_profiles')
            .select('user_id, full_name, avatar_url')
            .in('user_id', userIds)

        // Get plans for reference
        const { data: plans } = await supabaseAdmin
            .from('plans')
            .select('id, name')

        const planMap = new Map(plans?.map(p => [p.id, p.name]) || [])
        const subMap = new Map(subscriptions?.map(s => [s.user_id, s]) || [])
        const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || [])

        // Combine data
        let users = authUsers.users.map(user => {
            const sub = subMap.get(user.id)
            const profile = profileMap.get(user.id)

            // Check if block has expired
            let isBlocked = sub?.is_blocked || false
            if (isBlocked && sub?.blocked_until) {
                const blockedUntil = new Date(sub.blocked_until)
                if (blockedUntil < new Date()) {
                    isBlocked = false
                }
            }

            return {
                id: user.id,
                email: user.email,
                full_name: profile?.full_name || user.user_metadata?.full_name || null,
                avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
                created_at: user.created_at,
                last_sign_in_at: user.last_sign_in_at,
                plan_id: sub?.plan_id || 'free',
                plan_name: planMap.get(sub?.plan_id || 'free') || 'Free',
                is_blocked: isBlocked,
                blocked_until: sub?.blocked_until || null,
                block_reason: sub?.block_reason || null,
                daily_usage: sub?.daily_usage || 0
            }
        })

        // Filter by search if provided
        if (search) {
            const searchLower = search.toLowerCase()
            users = users.filter(u =>
                u.email?.toLowerCase().includes(searchLower) ||
                u.full_name?.toLowerCase().includes(searchLower)
            )
        }

        return NextResponse.json({
            users,
            total: authUsers.users.length,
            page,
            limit
        })

    } catch (error) {
        console.error('Get users error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH - Update user (block/unblock, change plan)
export async function PATCH(request: NextRequest) {
    try {
        const adminCheck = await verifyAdmin(request)
        if (!adminCheck.isAdmin) {
            return NextResponse.json({ error: adminCheck.error }, { status: 403 })
        }

        const body = await request.json()
        const { user_id, action, plan_id, block_duration, block_reason } = body

        if (!user_id || !action) {
            return NextResponse.json({ error: 'user_id and action are required' }, { status: 400 })
        }

        switch (action) {
            case 'block': {
                // Calculate blocked_until based on duration
                let blockedUntil: Date | null = null

                if (block_duration === 'permanent') {
                    // Permanent block - set to year 9999
                    blockedUntil = new Date('9999-12-31T23:59:59Z')
                } else if (block_duration) {
                    // Parse duration like "1h", "24h", "7d", "30d", "1y"
                    const match = block_duration.match(/^(\d+)(h|d|w|m|y)$/)
                    if (match) {
                        const value = parseInt(match[1])
                        const unit = match[2]

                        blockedUntil = new Date()
                        switch (unit) {
                            case 'h': blockedUntil.setHours(blockedUntil.getHours() + value); break
                            case 'd': blockedUntil.setDate(blockedUntil.getDate() + value); break
                            case 'w': blockedUntil.setDate(blockedUntil.getDate() + (value * 7)); break
                            case 'm': blockedUntil.setMonth(blockedUntil.getMonth() + value); break
                            case 'y': blockedUntil.setFullYear(blockedUntil.getFullYear() + value); break
                        }
                    }
                }

                const { error } = await supabaseAdmin
                    .from('user_subscriptions')
                    .update({
                        is_blocked: true,
                        blocked_until: blockedUntil?.toISOString() || null,
                        block_reason: block_reason || 'Diblokir oleh admin'
                    })
                    .eq('user_id', user_id)

                if (error) throw error

                return NextResponse.json({
                    success: true,
                    message: 'User berhasil diblokir',
                    blocked_until: blockedUntil?.toISOString()
                })
            }

            case 'unblock': {
                const { error } = await supabaseAdmin
                    .from('user_subscriptions')
                    .update({
                        is_blocked: false,
                        blocked_until: null,
                        block_reason: null
                    })
                    .eq('user_id', user_id)

                if (error) throw error

                return NextResponse.json({ success: true, message: 'User berhasil di-unblock' })
            }

            case 'change_plan': {
                if (!plan_id) {
                    return NextResponse.json({ error: 'plan_id is required' }, { status: 400 })
                }

                // Verify plan exists
                const { data: plan } = await supabaseAdmin
                    .from('plans')
                    .select('id, name')
                    .eq('id', plan_id)
                    .single()

                if (!plan) {
                    return NextResponse.json({ error: 'Plan not found' }, { status: 404 })
                }

                const { error } = await supabaseAdmin
                    .from('user_subscriptions')
                    .update({ plan_id })
                    .eq('user_id', user_id)

                if (error) throw error

                return NextResponse.json({
                    success: true,
                    message: `Plan berhasil diubah ke ${plan.name}`
                })
            }

            default:
                return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        }

    } catch (error) {
        console.error('Update user error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE - Delete user
export async function DELETE(request: NextRequest) {
    try {
        const adminCheck = await verifyAdmin(request)
        if (!adminCheck.isAdmin) {
            return NextResponse.json({ error: adminCheck.error }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const userId = searchParams.get('user_id')

        if (!userId) {
            return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
        }

        // Check if trying to delete an admin
        try {
            const { data: { user }, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId)

            if (getUserError) {
                console.error('Error getting user by ID:', getUserError)
                return NextResponse.json({
                    error: 'User tidak ditemukan atau sudah dihapus'
                }, { status: 404 })
            }

            if (user?.email) {
                const { data: admin } = await supabaseAdmin
                    .from('admin_users')
                    .select('email')
                    .eq('email', user.email.toLowerCase())
                    .single()

                if (admin) {
                    return NextResponse.json({
                        error: 'Tidak dapat menghapus akun admin. Hapus dari daftar admin terlebih dahulu.'
                    }, { status: 400 })
                }
            }
        } catch (checkError) {
            console.error('Error checking user/admin status:', checkError)
            // Continue with deletion if check fails
        }

        // Delete user's subscription first (to avoid foreign key issues)
        try {
            await supabaseAdmin
                .from('user_subscriptions')
                .delete()
                .eq('user_id', userId)
        } catch (subError) {
            console.error('Error deleting user subscription (non-critical):', subError)
            // Continue even if subscription delete fails
        }

        // Delete user's transactions
        try {
            await supabaseAdmin
                .from('transactions')
                .delete()
                .eq('user_id', userId)
        } catch (txError) {
            console.error('Error deleting user transactions (non-critical):', txError)
        }

        // Delete user's daily_skips
        try {
            await supabaseAdmin
                .from('daily_skips')
                .delete()
                .eq('user_id', userId)
        } catch (skipError) {
            console.error('Error deleting daily skips (non-critical):', skipError)
        }

        // Delete user's profile
        try {
            await supabaseAdmin
                .from('user_profiles')
                .delete()
                .eq('user_id', userId)
        } catch (profileError) {
            console.error('Error deleting user profile (non-critical):', profileError)
        }

        // Delete user's playlists and playlist_songs (if they exist)
        try {
            // Get user's playlists first
            const { data: playlists } = await supabaseAdmin
                .from('playlists')
                .select('id')
                .eq('user_id', userId)

            if (playlists && playlists.length > 0) {
                const playlistIds = playlists.map(p => p.id)

                // Delete playlist songs
                await supabaseAdmin
                    .from('playlist_songs')
                    .delete()
                    .in('playlist_id', playlistIds)

                // Delete playlists
                await supabaseAdmin
                    .from('playlists')
                    .delete()
                    .eq('user_id', userId)
            }
        } catch (playlistError) {
            console.error('Error deleting user playlists (non-critical):', playlistError)
        }

        // Delete listening history if exists
        try {
            await supabaseAdmin
                .from('listening_history')
                .delete()
                .eq('user_id', userId)
        } catch (historyError) {
            console.error('Error deleting listening history (non-critical):', historyError)
        }

        // Delete user from auth
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (deleteError) {
            console.error('Error deleting user from auth:', deleteError)
            return NextResponse.json({
                error: `Gagal menghapus user: ${deleteError.message}`
            }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: 'User berhasil dihapus' })

    } catch (error: any) {
        console.error('Delete user error:', error)
        return NextResponse.json({
            error: error?.message || 'Internal server error'
        }, { status: 500 })
    }
}
