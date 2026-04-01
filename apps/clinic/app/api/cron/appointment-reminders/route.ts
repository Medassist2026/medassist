export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sendAppointmentReminders } from '@shared/lib/sms/reminder-service'

/**
 * GET /api/cron/appointment-reminders
 * Sends SMS reminders for tomorrow's appointments.
 * Triggered daily by Vercel Cron at 09:00 Cairo time (07:00 UTC).
 *
 * Protected by CRON_SECRET environment variable.
 */
export async function GET(request: NextRequest) {
  // Verify this is a legitimate Vercel cron call
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await sendAppointmentReminders()

    console.log(`Appointment reminders: sent=${result.sent}, failed=${result.failed}`)

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Appointment reminders cron error:', error)
    return NextResponse.json(
      { error: 'Failed to send appointment reminders' },
      { status: 500 }
    )
  }
}
