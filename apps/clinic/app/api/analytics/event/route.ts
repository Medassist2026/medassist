import { createClient } from '@shared/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/analytics/event
 * Generic analytics event endpoint.
 * Accepts: { event_name: string, properties: Record<string, any> }
 *
 * Used by both doctor ("faster than paper" session timing)
 * and frontdesk (check-in speed) workflows.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user (any role)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { event_name, properties } = await request.json()

    if (!event_name || typeof event_name !== 'string') {
      return NextResponse.json({ error: 'event_name required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('analytics_events')
      .insert({
        event_name,
        user_id: user.id,
        properties: properties || {},
      })

    if (error) {
      console.error('Analytics event insert error:', error)
      // Don't fail the response — analytics should be non-blocking
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Analytics event error:', error)
    // Always return success — analytics failures shouldn't break anything
    return NextResponse.json({ success: true })
  }
}
