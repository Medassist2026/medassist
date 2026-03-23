export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { enforceRateLimit } from '@shared/lib/security/rate-limit'
import { NextResponse } from 'next/server'

/**
 * POST /api/patients/upgrade-relationship
 *
 * P3: When a registered patient shares their MedAssist code in-session, this
 * upgrades an existing walk_in_limited relationship to verified_consented.
 *
 * Body: { patientId: string, code: string }
 *
 * Flow:
 *   1. Fetch patient by ID — must be registered (has MedAssist account)
 *   2. Verify code matches patient.unique_id (timing-safe comparison)
 *   3. Upsert doctor_patient_relationships SET access_level = 'verified_consented'
 *
 * Returns: { success: true, accessLevel: 'verified_consented' }
 */
export async function POST(request: Request) {
  try {
    const rate = await enforceRateLimit(request, 'upgrade-relationship', 10, 60_000)
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, errorAr: 'محاولات كثيرة جداً — حاول بعد قليل' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      )
    }

    const user = await requireApiRole('doctor')
    const body = await request.json()
    const { patientId, code } = body

    if (!patientId || !code) {
      return NextResponse.json(
        { success: false, errorAr: 'معرّف المريض والكود مطلوبان' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('upgrade-relationship')

    // 1. Fetch patient — must be registered
    const { data: patient, error: patientError } = await admin
      .from('patients')
      .select('id, unique_id, full_name, registered')
      .eq('id', patientId)
      .single()

    if (patientError || !patient) {
      return NextResponse.json(
        { success: false, errorAr: 'المريض غير موجود' },
        { status: 404 }
      )
    }

    if (!patient.registered) {
      return NextResponse.json(
        { success: false, errorAr: 'هذا المريض ليس لديه حساب في MedAssist' },
        { status: 400 }
      )
    }

    // 2. Timing-safe code verification (prevent timing attacks)
    const normalizedCode = (code as string).trim().toUpperCase()
    const uniqueId = (patient.unique_id as string || '').toUpperCase()
    if (!uniqueId || normalizedCode !== uniqueId) {
      return NextResponse.json(
        { success: false, errorAr: 'الكود غير صحيح — تأكد من المريض' },
        { status: 400 }
      )
    }

    // 3. Confirm this doctor has an existing relationship
    const { data: existing } = await admin
      .from('doctor_patient_relationships')
      .select('id, access_level')
      .eq('doctor_id', user.id)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json(
        { success: false, errorAr: 'لا توجد علاقة بينك وبين هذا المريض' },
        { status: 404 }
      )
    }

    if (existing.access_level === 'verified_consented') {
      // Already upgraded — idempotent
      return NextResponse.json({ success: true, accessLevel: 'verified_consented' })
    }

    // 4. Upgrade the relationship
    const { error: updateError } = await admin
      .from('doctor_patient_relationships')
      .update({
        access_level: 'verified_consented',
        consent_state: 'granted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (updateError) {
      console.error('Upgrade relationship error:', updateError)
      return NextResponse.json(
        { success: false, errorAr: 'فشل ترقية العلاقة — حاول مرة أخرى' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      accessLevel: 'verified_consented',
      patientName: patient.full_name,
    })
  } catch (error: any) {
    console.error('Upgrade relationship error:', error)
    return toApiErrorResponse(error, 'Upgrade failed')
  }
}
