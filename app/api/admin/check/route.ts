import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role for admin checks (bypasses RLS)
// Use service role for admin checks (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in environment variables');
}

const supabaseAdmin = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey)
    : null;

export async function GET(request: NextRequest) {
    try {
        // Get the authorization header
        const authHeader = request.headers.get('authorization')

        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json(
                { isAdmin: false, error: 'No valid authorization token' },
                { status: 401 }
            )
        }

        if (!supabaseAdmin) {
            console.error('Supabase Admin client not initialized');
            return NextResponse.json({ isAdmin: false, error: 'Server configuration error' }, { status: 500 });
        }

        const token = authHeader.replace('Bearer ', '')

        // Verify the JWT and get user info
        const { data: { user }, error: userError } = await supabaseAdmin!.auth.getUser(token)

        if (userError || !user) {
            return NextResponse.json(
                { isAdmin: false, error: 'Invalid or expired token' },
                { status: 401 }
            )
        }

        const userEmail = user.email

        if (!userEmail) {
            return NextResponse.json(
                { isAdmin: false, error: 'User has no email' },
                { status: 400 }
            )
        }

        // Check if user email exists in admin_users table
        const { data: adminUser, error: adminError } = await supabaseAdmin!
            .from('admin_users')
            .select('id, email, created_at')
            .eq('email', userEmail.toLowerCase())
            .single()

        if (adminError || !adminUser) {
            console.log(`Admin check failed for ${userEmail}: Not in admin_users table`)
            return NextResponse.json({
                isAdmin: false,
                email: userEmail,
                userId: user.id
            })
        }

        console.log(`Admin verified: ${userEmail}`)
        return NextResponse.json({
            isAdmin: true,
            email: userEmail,
            userId: user.id,
            adminSince: adminUser.created_at
        })

    } catch (error) {
        console.error('Admin check error:', error)
        return NextResponse.json(
            { isAdmin: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// POST: Add new admin (only existing admins can do this)
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')

        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const token = authHeader.replace('Bearer ', '')

        if (!supabaseAdmin) {
            return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
        }

        const { data: { user } } = await supabaseAdmin!.auth.getUser(token)

        if (!user?.email) {
            return NextResponse.json(
                { success: false, error: 'Invalid user' },
                { status: 401 }
            )
        }

        // Check if current user is admin
        const { data: currentAdmin } = await supabaseAdmin!
            .from('admin_users')
            .select('email')
            .eq('email', user.email.toLowerCase())
            .single()

        if (!currentAdmin) {
            return NextResponse.json(
                { success: false, error: 'Only admins can add new admins' },
                { status: 403 }
            )
        }

        // Get email to add from request body
        const body = await request.json()
        const { email } = body

        if (!email || typeof email !== 'string') {
            return NextResponse.json(
                { success: false, error: 'Valid email is required' },
                { status: 400 }
            )
        }

        // Insert new admin
        const { data: newAdmin, error: insertError } = await supabaseAdmin!
            .from('admin_users')
            .insert({
                email: email.toLowerCase().trim(),
                created_by: user.email
            })
            .select()
            .single()

        if (insertError) {
            if (insertError.code === '23505') { // Unique violation
                return NextResponse.json(
                    { success: false, error: 'This email is already an admin' },
                    { status: 409 }
                )
            }
            throw insertError
        }

        return NextResponse.json({
            success: true,
            admin: newAdmin
        })

    } catch (error) {
        console.error('Add admin error:', error)
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// DELETE: Remove admin (only existing admins can do this, cannot remove self)
export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')

        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const token = authHeader.replace('Bearer ', '')

        if (!supabaseAdmin) {
            return NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 });
        }

        const { data: { user } } = await supabaseAdmin!.auth.getUser(token)

        if (!user?.email) {
            return NextResponse.json(
                { success: false, error: 'Invalid user' },
                { status: 401 }
            )
        }

        // Check if current user is admin
        const { data: currentAdmin } = await supabaseAdmin!
            .from('admin_users')
            .select('email')
            .eq('email', user.email.toLowerCase())
            .single()

        if (!currentAdmin) {
            return NextResponse.json(
                { success: false, error: 'Only admins can remove admins' },
                { status: 403 }
            )
        }

        // Get email to remove from URL
        const url = new URL(request.url)
        const emailToRemove = url.searchParams.get('email')

        if (!emailToRemove) {
            return NextResponse.json(
                { success: false, error: 'Email parameter is required' },
                { status: 400 }
            )
        }

        // Prevent self-removal
        if (emailToRemove.toLowerCase() === user.email.toLowerCase()) {
            return NextResponse.json(
                { success: false, error: 'You cannot remove yourself as admin' },
                { status: 400 }
            )
        }

        // Delete admin
        const { error: deleteError } = await supabaseAdmin!
            .from('admin_users')
            .delete()
            .eq('email', emailToRemove.toLowerCase())

        if (deleteError) {
            throw deleteError
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Remove admin error:', error)
        return NextResponse.json(
            { success: false, error: 'Internal server error' },
            { status: 500 }
        )
    }
}
