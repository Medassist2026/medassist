export const dynamic = 'force-dynamic'

import { checkInPatient } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { ensureDoctorInFrontdeskClinic, getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { logAuditEvent } from '@shared/lib/data/audit'
import { cairoTodayStart } from '@shared/lib/date/cairo-date'
import { sendReminder } from '@shared/lib/sms/reminder-service'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { patientId, doctorId, appointmentId, queueType } = body

    if (!patientId || !doctorId || !queueType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const doctorInScope = await ensureDoctorInFrontdeskClinic(supabase as any, user.id, doctorId)
    if (!doctorInScope) {
      return NextResponse.json(
        { error: 'Doctor is outside your clinic scope' },
        { status: 403 }
      )
    }

    // ── Server-resolved tenant scope (D-041) ──
    // Required for the INSERT (check_in_queue.clinic_id is NOT NULL since
    // mig 051) and reused for the audit log below. Uses getFrontdeskClinicId
    // (FRONT_DESK/ASSISTANT-only) to stay consistent with the auth gate
    // above; if ensureDoctorInFrontdeskClinic returned true this should
    // never be null, but we guard explicitly to convert the would-be DB
    // 500 into a clean 403 when it does.
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic context not found' },
        { status: 403 }
      )
    }

    // ── Duplicate check-in prevention (pre-check) ──
    // "Today" anchored on Cairo midnight so a 23:30 Cairo check-in
    // doesn't get flagged as duplicate of an entry from "yesterday"
    // server-local that the user is mentally treating as today.
    const today = cairoTodayStart()

    const { data: existingEntry } = await supabase
      .from('check_in_queue')
      .select('id, status, doctor_id, queue_number')
      .eq('patient_id', patientId)
      .eq('doctor_id', doctorId)
      .in('status', ['waiting', 'in_progress'])
      .gte('created_at', today.toISOString())
      .limit(1)
      .maybeSingle()

    if (existingEntry) {
      // ── Replay-safe dedupe (TD-008) ──────────────────────────────────────
      // Pre-TD-008 we returned 409 here. Now we return 200 with the existing
      // record so an offline-write replay treats this as success and removes
      // the entry from the local queue (instead of looping retries forever).
      // Live UI behavior is unchanged: the client treats deduped === true
      // the same way it treated the 409 message.
      const statusLabel = existingEntry.status === 'waiting' ? 'في الانتظار' : 'مع الطبيب'
      return NextResponse.json({
        success: true,
        deduped: true,
        message: `هذا المريض مسجّل بالفعل (${statusLabel})`,
        queueItem: existingEntry,
      })
    }

    const queueItem = await checkInPatient({
      patientId,
      doctorId,
      clinicId,
      appointmentId,
      queueType
    })

    // ── Post-insert verification (concurrent protection) ──
    // If two check-in requests pass the pre-check simultaneously, detect the duplicate
    const { data: duplicates } = await supabase
      .from('check_in_queue')
      .select('id')
      .eq('patient_id', patientId)
      .eq('doctor_id', doctorId)
      .in('status', ['waiting', 'in_progress'])
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true })

    if (duplicates && duplicates.length > 1) {
      // Keep the first (earliest) entry, cancel the one we just created if it's not the first
      const firstId = duplicates[0].id
      if (queueItem.id !== firstId) {
        await supabase
          .from('check_in_queue')
          .update({ status: 'cancelled' })
          .eq('id', queueItem.id)

        return NextResponse.json(
          { error: 'هذا المريض تم تسجيله بالفعل — تم اكتشاف تسجيل متزامن' },
          { status: 409 }
        )
      }
    }

    // Audit log — reuses the clinicId resolved above.
    logAuditEvent({
      clinicId,
      actorUserId: user.id,
      action: 'CREATE_PATIENT',
      entityType: 'check_in',
      entityId: patientId,
      metadata: { doctorId, queueType }
    })

    // ── Build 05 § B7: auto-renew patient_data_shares on visit ───────────────
    // Encounter-triggered renewal extends every active, non-permanent share
    // for (gpid, this clinic) to NOW+90d. The DB function (mig 090) writes
    // one SHARE_AUTO_RENEWED audit + one expires_at update per share, all
    // atomic per share.
    //
    // EXPLICIT EXCEPTION TO SYNC+TRANSACTIONAL RULE (Build 05 § B7):
    //   This is the only place in Prompt 5 where audit failure is allowed
    //   to be non-fatal. The reasoning: preserving an encounter (already
    //   inserted at this point) is more important than guaranteeing the
    //   renewal audit. If renewal silently fails, the share will eventually
    //   expire on its normal schedule and a notification will fire — not a
    //   privacy hole, just a UX gap.
    ;(async () => {
      try {
        const { autoRenewOnVisit } = await import('@shared/lib/data/patient-shares')
        // Resolve gpid via the patient row (legacy patients carry global_patient_id since mig 074).
        const admin = createAdminClient('auto-renew-on-visit-gpid-lookup')
        const { data: patient } = await admin
          .from('patients')
          .select('global_patient_id')
          .eq('id', patientId)
          .maybeSingle()
        const gpid = (patient as { global_patient_id?: string } | null)?.global_patient_id
        if (!gpid) {
          // No gpid — the patient pre-dates global_patients, or backfill
          // missed this row. Skip silently; legacy data will be reconciled
          // by the cleanup migrations Prompt 6.5 owns.
          return
        }
        await autoRenewOnVisit({
          globalPatientId: gpid,
          granteeClinicId: clinicId,
          encounterId: queueItem.id,
        })
      } catch (err) {
        // Log only — do not propagate. See exception note above.
        console.error('checkin: autoRenewOnVisit failed (non-fatal):', err)
      }
    })()

    // ── SMS Invitation for first-time patients (fire-and-forget) ──────────────
    ;(async () => {
      try {
        const admin = createAdminClient('first-visit-sms-invitation')

        // Check if this patient has ANY prior queue entries (before today)
        const nowCairo = new Date(Date.now() + 3 * 60 * 60 * 1000)
        const todayStr = nowCairo.toISOString().split('T')[0]
        const todayStart = `${todayStr}T00:00:00+03:00`

        const { count } = await admin
          .from('check_in_queue')
          .select('id', { count: 'exact', head: true })
          .eq('patient_id', patientId)
          .lt('created_at', todayStart)

        // Only send invitation if this is truly their first ever visit
        if ((count ?? 0) > 0) return

        // Fetch patient phone + name
        const { data: patient } = await admin
          .from('patients')
          .select('full_name, phone')
          .eq('id', patientId)
          .maybeSingle()

        if (!patient?.phone) return

        // Fetch doctor name
        const { data: doctor } = await admin
          .from('doctors')
          .select('full_name')
          .eq('id', doctorId)
          .maybeSingle()

        // Fetch clinic name
        const { data: clinic } = clinicId
          ? await admin.from('clinics').select('name').eq('id', clinicId).maybeSingle()
          : { data: null }

        await sendReminder({
          patientId,
          phoneNumber: patient.phone,
          messageType: 'app_invitation' as any,
          context: {
            patientName: patient.full_name || 'مريض',
            doctorName: doctor?.full_name || 'الطبيب',
            clinicName: clinic?.name || 'العيادة',
          },
          language: 'ar',
        })
      } catch (smsErr) {
        // Non-critical — never block check-in for SMS failure
        console.error('[first-visit-sms] Failed:', smsErr)
      }
    })()

    return NextResponse.json({
      success: true,
      queueItem
    })

  } catch (error: any) {
    console.error('Check-in error:', error)
    return toApiErrorResponse(error, 'Check-in failed')
  }
}
