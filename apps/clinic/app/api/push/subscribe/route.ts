export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@shared/lib/supabase/server'

/**
 * POST /api/push/subscribe
 *
 * Stores a Web Push subscription for a user.
 * The subscription object comes from PushManager.subscribe().
 *
 * Body: { subscription: PushSubscriptionJSON, userId: string }
 *
 * TODO: Create `push_subscriptions` table in Supabase:
 * CREATE TABLE push_subscriptions (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 *   endpoint text NOT NULL UNIQUE,
 *   keys_p256dh text NOT NULL,
 *   keys_auth text NOT NULL,
 *   created_at timestamptz DEFAULT now(),
 *   updated_at timestamptz DEFAULT now()
 * );
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subscription, userId } = body

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Upsert the subscription (update if endpoint exists)
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: subscription.endpoint,
          keys_p256dh: subscription.keys?.p256dh || '',
          keys_auth: subscription.keys?.auth || '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      // Table may not exist yet — log but don't fail
      console.warn('[Push Subscribe] DB error (table may not exist yet):', error.message)
      return NextResponse.json(
        { success: true, stored: false, message: 'Subscription received but not persisted (DB not ready)' },
        { status: 200 }
      )
    }

    return NextResponse.json({ success: true, stored: true })
  } catch (err) {
    console.error('[Push Subscribe] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
