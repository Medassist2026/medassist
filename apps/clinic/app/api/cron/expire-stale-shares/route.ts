export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  listExpiringShares,
  markShareExpiredNotification,
} from '@shared/lib/data/patient-shares'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * GET /api/cron/expire-stale-shares — Build prompt 05 § B11.
 *
 * Sweeps patient_data_shares for grants whose expires_at falls in the
 * next 24 hours, writes a SHARE_EXPIRED audit row per share (idempotent
 * via mark_share_expired_notification), and dispatches an Egyptian Arabic
 * SMS to the patient warning that the clinic will lose access.
 *
 * IDEMPOTENCY
 *   The DB function mark_share_expired_notification checks for an existing
 *   SHARE_EXPIRED audit row with metadata.notified=true; re-runs of the
 *   cron skip already-notified shares. Safe to invoke multiple times per
 *   day (we still aim for once daily via Vercel Cron).
 *
 * AUTH
 *   Same pattern as appointment-reminders: Authorization: Bearer <CRON_SECRET>.
 *
 * RUN ID
 *   Each invocation tags its audit rows with a cron_run_id so a future
 *   audit pass can group them. Format: ISO timestamp.
 *
 * SMS DISPATCH
 *   Best-effort. SMS dispatch failures log but don't fail the run — the
 *   audit row is the system-of-record; the SMS is courtesy notification.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronRunId = new Date().toISOString()
  let scanned = 0
  let notified = 0
  let alreadyNotified = 0
  let smsSent = 0
  let smsFailed = 0
  const errors: Array<{ share_id: string; message: string }> = []

  try {
    const expiring = await listExpiringShares({ windowHours: 24 })
    scanned = expiring.length

    if (expiring.length === 0) {
      return NextResponse.json({
        success: true,
        cron_run_id: cronRunId,
        scanned: 0,
        notified: 0,
        already_notified: 0,
        sms_sent: 0,
        sms_failed: 0,
      })
    }

    // Resolve the gpids → patient phones + grantee clinic names in one pass.
    const admin = createAdminClient('cron-expire-stale-shares')
    const gpids = Array.from(new Set(expiring.map((s) => s.global_patient_id)))
    const granteeIds = Array.from(new Set(expiring.map((s) => s.grantee_clinic_id)))

    const [{ data: gps }, { data: clinics }] = await Promise.all([
      admin
        .from('global_patients')
        .select('id, normalized_phone, claimed_user_id')
        .in('id', gpids),
      admin
        .from('clinics')
        .select('id, name')
        .in('id', granteeIds),
    ])

    const phoneByGpid = new Map<string, string>()
    for (const gp of (gps ?? []) as Array<{ id: string; normalized_phone: string | null }>) {
      if (gp.normalized_phone) phoneByGpid.set(gp.id, gp.normalized_phone)
    }
    const clinicNameById = new Map<string, string>()
    for (const c of (clinics ?? []) as Array<{ id: string; name: string }>) {
      clinicNameById.set(c.id, c.name)
    }

    for (const share of expiring) {
      try {
        const mark = await markShareExpiredNotification({
          shareId: share.id,
          cronRunId,
        })
        if (!mark.changed) {
          alreadyNotified += 1
          continue
        }
        notified += 1

        // Best-effort SMS dispatch.
        const phone = phoneByGpid.get(share.global_patient_id)
        const clinicName = clinicNameById.get(share.grantee_clinic_id) ?? 'العيادة'
        if (phone) {
          try {
            const { sendSMS } = await import('@shared/lib/sms/twilio-client')
            const body = renderShareExpiringTemplate({
              clinicName,
              expiresAt: share.expires_at!,
            })
            const result = await sendSMS(phone, body)
            if (result.success) smsSent += 1
            else smsFailed += 1
          } catch (smsErr) {
            smsFailed += 1
            console.error('expire-stale-shares: SMS dispatch failed:', smsErr)
          }
        }
      } catch (err) {
        errors.push({
          share_id: share.id,
          message: (err as Error).message ?? 'unknown',
        })
      }
    }

    return NextResponse.json({
      success: true,
      cron_run_id: cronRunId,
      scanned,
      notified,
      already_notified: alreadyNotified,
      sms_sent: smsSent,
      sms_failed: smsFailed,
      errors: errors.slice(0, 20),  // cap surface
    })
  } catch (err) {
    console.error('expire-stale-shares cron error:', err)
    return NextResponse.json(
      {
        success: false,
        cron_run_id: cronRunId,
        scanned,
        notified,
        already_notified: alreadyNotified,
        sms_sent: smsSent,
        sms_failed: smsFailed,
        error: (err as Error).message ?? 'unknown',
      },
      { status: 500 }
    )
  }
}

/**
 * Egyptian Arabic SMS template for share-expiring-soon. Mo to review.
 * Tracked under ORPH-V5-04 (sharing strings Arabic review).
 */
function renderShareExpiringTemplate(params: {
  clinicName: string
  expiresAt: string
}): string {
  // Format the date in Cairo time, dd/mm.
  const dt = new Date(params.expiresAt)
  // Convert to Cairo TZ approximately by adding 3 hours offset; the
  // exact-tz format is overkill for an SMS body.
  const cairo = new Date(dt.getTime() + 3 * 60 * 60 * 1000)
  const dd = String(cairo.getUTCDate()).padStart(2, '0')
  const mm = String(cairo.getUTCMonth() + 1).padStart(2, '0')
  return (
    `صلاحية ${params.clinicName} لرؤية سجلاتك هتنتهي يوم ${dd}/${mm}.\n` +
    `لو عايز تمدد المدة، افتح تطبيق MedAssist > الإعدادات > المشاركة.\n` +
    `لو ما عملتش حاجة، الصلاحية هتنتهي تلقائي.`
  )
}
