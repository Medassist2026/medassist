export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiAuth, toApiErrorResponse } from '@shared/lib/auth/session'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import {
  listClinicsNeedingReconsent,
  recordReconsentDecision,
} from '@shared/lib/data/messaging-consent'
import { createAdminClient } from '@shared/lib/supabase/admin'

/**
 * GET /api/patient/messaging-reconsent  — Build prompt 04 (B17 backend).
 *   Returns the list of clinics that still need re-consent for this patient.
 *
 * POST /api/patient/messaging-reconsent
 *   Body: { clinic_id: string, decision: 'reconfirmed' | 'revoked' }
 *   Records the per-clinic decision. Writes the audit + (on reconfirmed)
 *   updates patient_clinic_records.consent_to_messaging.
 */
export async function GET(request: Request) {
  void request
  try {
    const session = await requireApiAuth()
    const userId = session.id

    const admin = createAdminClient('patient-reconsent-list')
    const { data: gp } = await admin
      .from('global_patients')
      .select('id')
      .eq('claimed_user_id', userId)
      .maybeSingle()

    if (!gp?.id) {
      return NextResponse.json({ pending: [] })
    }

    const pending = await listClinicsNeedingReconsent(gp.id)

    // Hydrate clinic name for the modal.
    const clinicIds = Array.from(new Set(pending.map((p) => p.clinicId)))
    const { data: clinics } = await admin
      .from('clinics')
      .select('id, name')
      .in('id', clinicIds.length > 0 ? clinicIds : ['00000000-0000-0000-0000-000000000000'])

    const nameById = new Map<string, string>(
      (clinics || []).map((c: any) => [c.id, c.name as string])
    )

    return NextResponse.json({
      pending: pending.map((p) => ({
        clinic_id: p.clinicId,
        clinic_name: nameById.get(p.clinicId) || 'العيادة',
        legacy_granted_at: p.legacyGrantedAt,
        grace_expires_at: p.graceExpiresAt,
      })),
    })
  } catch (error: any) {
    console.error('GET /patient/messaging-reconsent error:', error)
    return toApiErrorResponse(error, 'Failed to list pending re-consent')
  }
}

export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'patient-messaging-reconsent', 30, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const session = await requireApiAuth()
    const userId = session.id

    const body = await request.json().catch(() => ({}))
    const clinicId = typeof body?.clinic_id === 'string' ? body.clinic_id : null
    const decision = body?.decision === 'reconfirmed' || body?.decision === 'revoked'
      ? body.decision
      : null

    if (!clinicId || !decision) {
      return NextResponse.json({ error: 'clinic_id and decision required' }, { status: 400 })
    }

    const admin = createAdminClient('patient-reconsent-record')
    const { data: gp } = await admin
      .from('global_patients')
      .select('id')
      .eq('claimed_user_id', userId)
      .maybeSingle()
    if (!gp?.id) {
      return NextResponse.json({ error: 'Patient identity not claimed' }, { status: 404 })
    }

    await recordReconsentDecision({
      globalPatientId: gp.id,
      clinicId,
      patientUserId: userId,
      decision,
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('POST /patient/messaging-reconsent error:', error)
    return toApiErrorResponse(error, 'Failed to record re-consent decision')
  }
}
