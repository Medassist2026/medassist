export const dynamic = 'force-dynamic'

import { createPayment } from '@shared/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { ensureDoctorInFrontdeskClinic, getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { patientId, doctorId, amount, paymentMethod, appointmentId, clinicalNoteId, notes, clientIdempotencyKey } = body

    if (!patientId || !doctorId || !amount || !paymentMethod) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // ── Replay-safe idempotency (TD-008) ───────────────────────────────────
    // Offline-write callers (useOfflineMutation hook) include a UUID per
    // attempt in clientIdempotencyKey. On replay we look up first; if a row
    // already exists for this key, return it instead of inserting a duplicate.
    // Migration 069 adds the column + partial unique index.
    if (clientIdempotencyKey) {
      const { data: existing } = await supabase
        .from('payments')
        .select('*')
        .eq('client_idempotency_key', clientIdempotencyKey)
        .maybeSingle()

      if (existing) {
        return NextResponse.json({
          success: true,
          deduped: true,
          payment: existing,
        })
      }
    }

    // Resolve the frontdesk's clinic. We do this BEFORE the doctor-scope
    // check because (a) we need the clinic_id to write the payment row
    // (NOT NULL since mig 047), and (b) doctor-scope already calls the
    // same resolver internally — so this avoids a second lookup.
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json(
        {
          error: 'لا توجد عيادة نشطة لهذا الحساب. يرجى التواصل مع المسؤول.',
          code: 'NO_ACTIVE_CLINIC'
        },
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

    const payment = await createPayment({
      patientId,
      doctorId,
      clinicId,
      amount,
      paymentMethod,
      appointmentId,
      clinicalNoteId,
      notes,
      clientIdempotencyKey,
    })

    return NextResponse.json({
      success: true,
      payment
    })

  } catch (error: any) {
    console.error('Payment creation error:', error)
    return toApiErrorResponse(error, 'Failed to record payment')
  }
}
