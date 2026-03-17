export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// GET /api/doctor/notifications
// Fetch doctor's notifications (newest first, paginated)
// Query params:
//   - limit: number of notifications (default 20, max 50)
//   - unread_only: "true" to filter unread only
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient('notifications')

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
    const unreadOnly = searchParams.get('unread_only') === 'true'

    let query = admin
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.eq('read', false)
    }

    const { data, error } = await query

    if (error) {
      console.error('Notifications fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }

    // Also get unread count
    const { count } = await admin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('read', false)

    return NextResponse.json({
      notifications: data || [],
      unreadCount: count ?? 0,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch notifications')
  }
}

// ============================================================================
// PATCH /api/doctor/notifications
// Mark notifications as read
// Body: { notificationIds: string[] } — mark specific, or { markAllRead: true }
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient('notifications')
    const body = await request.json()

    const { notificationIds, markAllRead } = body

    if (markAllRead) {
      // Mark all as read
      const { error } = await admin
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .eq('read', false)

      if (error) {
        return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 })
      }
    } else if (notificationIds && Array.isArray(notificationIds)) {
      // Mark specific notifications as read
      const { error } = await admin
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('recipient_id', user.id)
        .in('id', notificationIds)

      if (error) {
        return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to update notifications')
  }
}
