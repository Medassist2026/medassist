import { checkInPatient } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic, getUserClinicId } from '@shared/lib/data/frontdesk-scope'
import { logAuditEvent } from '@shared/lib/data/audit'
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

    // ── Duplicate check-in prevention (pre-check) ──
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: existingEntry } = await supabase
      .from('check_in_queue')
      .select('id, status, doctor_id')
      .eq('patient_id', patientId)
      .eq('doctor_id', doctorId)
      .in('status', ['waiting', 'in_progress'])
      .gte('created_at', today.toISOString())
      .limit(1)
      .maybeSingle()

    if (existingEntry) {
      const statusLabel = existingEntry.status === 'waiting' ? 'في الانتظار' : 'مع الطبيب'
      return NextResponse.json(
        { error: `هذا المريض مسجّل بالفعل (${statusLabel}) — لا يمكن تسجيله مرة أخرى` },
        { status: 409 }
      )
    }

    const queueItem = await checkInPatient({
      patientId,
      doctorId,
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

    // Audit log
    const clinicId = await getUserClinicId(user.id)
    logAuditEvent({
      clinicId: clinicId || undefined,
      actorUserId: user.id,
      action: 'CREATE_PATIENT',
      entityType: 'check_in',
      entityId: patientId,
      metadata: { doctorId, queueType }
    })

    return NextResponse.json({
      success: true,
      queueItem
    })

  } catch (error: any) {
    console.error('Check-in error:', error)
    return toApiErrorResponse(error, 'Check-in failed')
  }
}
