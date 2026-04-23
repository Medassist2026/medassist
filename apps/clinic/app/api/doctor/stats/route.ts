export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { PAYMENT_STATUS } from '@shared/lib/data/payments'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { cairoMonthStart } from '@shared/lib/date/cairo-date'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/doctor/stats
 * Returns doctor profile, active-clinic context, and activity stats.
 * Used by the Profile page.
 *
 * Data scoping:
 *  - Active clinic resolved via getClinicContext (cookie + OWNER-first
 *    sort + ACTIVE-only memberships) — matches DoctorShell's clinic
 *    badge, so a multi-clinic doctor sees ONE clinic name on-screen.
 *  - Patient / session / fee counts are scoped to the active clinic so
 *    multi-clinic doctors see only that clinic's figures.
 *  - Month boundaries use Africa/Cairo TZ so "this month" matches the
 *    wall-clock a clinic in Egypt reads off its screen.
 */
export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()
    const admin = createAdminClient('doctor-stats')

    // ── 1. Doctor profile ─────────────────────────────────────
    // Select only columns that exist in the live DB (fee columns added later via migration)
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, full_name, specialty, unique_id')
      .eq('id', user.id)
      .single()

    if (doctorError || !doctor) {
      return NextResponse.json(
        { error: 'فشل في جلب بيانات الطبيب' },
        { status: 404 }
      )
    }

    // ── 2. Auth user details (phone / email) ──────────────────
    const { data: authData } = await supabase.auth.getUser()
    const authUser = authData?.user

    // ── 3. Clinic context — shared resolver, matches DoctorShell badge ──
    const clinicContext = await getClinicContext(user.id, 'doctor')
    const activeClinicId = clinicContext?.clinicId ?? null
    const activeClinicInfo = clinicContext?.clinic ?? null
    const allClinics = (clinicContext?.allClinics ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      uniqueId: c.uniqueId,
      role: c.role,
    }))

    // ── 4. Month boundary in Africa/Cairo ─────────────────────
    const monthStartIso = cairoMonthStart().toISOString()

    // ── 5. Patient counts (active-clinic-scoped when available) ──
    // Note: doctor_patient_relationships.clinic_id exists (mig 019/026).
    const patientBase = () => {
      let q = admin
        .from('doctor_patient_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', user.id)
        .eq('status', 'active')
      if (activeClinicId) q = q.eq('clinic_id', activeClinicId)
      return q
    }
    const { count: totalPatients } = await patientBase()

    // Patients whose relationship STARTED this month — a rough "new
    // patients this month" metric. doctor_patient_relationships is
    // one-row-per-doctor-patient-pair, so created_at is the onboarding
    // moment for that pair.
    const { count: patientsThisMonth } = await (() => {
      let q = admin
        .from('doctor_patient_relationships')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', user.id)
        .eq('status', 'active')
        .gte('created_at', monthStartIso)
      if (activeClinicId) q = q.eq('clinic_id', activeClinicId)
      return q
    })()

    // ── 6. Session counts (active-clinic-scoped when available) ──
    // Note: clinical_notes.clinic_id exists (mig 016/023).
    const { count: totalSessions } = await (() => {
      let q = admin
        .from('clinical_notes')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', user.id)
      if (activeClinicId) q = q.eq('clinic_id', activeClinicId)
      return q
    })()

    const { count: sessionsThisMonth } = await (() => {
      let q = admin
        .from('clinical_notes')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', user.id)
        .gte('created_at', monthStartIso)
      if (activeClinicId) q = q.eq('clinic_id', activeClinicId)
      return q
    })()

    // ── 7. Fees — both this-month and all-time ─────────────────
    // payments.clinic_id exists (mig 019) so scoping is safe.
    const feesQueryBase = () => {
      let q = admin
        .from('payments')
        .select('amount')
        .eq('doctor_id', user.id)
        .eq('payment_status', PAYMENT_STATUS.COMPLETED)
      if (activeClinicId) q = q.eq('clinic_id', activeClinicId)
      return q
    }

    const { data: paymentsThisMonth } = await feesQueryBase().gte(
      'created_at',
      monthStartIso
    )
    const feesThisMonth = (paymentsThisMonth || []).reduce(
      (sum: number, p: any) => sum + (p.amount || 0),
      0
    )

    const { data: paymentsAllTime } = await feesQueryBase()
    const totalFees = (paymentsAllTime || []).reduce(
      (sum: number, p: any) => sum + (p.amount || 0),
      0
    )

    return NextResponse.json({
      success: true,
      doctor: {
        id: doctor.id,
        fullName: doctor.full_name || '',
        specialty: doctor.specialty || '',
        uniqueId: doctor.unique_id || '',
        consultationFee: (doctor as any).consultation_fee_egp || 0,
        followupFee: (doctor as any).followup_fee_egp || 0,
      },
      stats: {
        totalPatients: totalPatients || 0,
        totalSessions: totalSessions || 0,
        patientsThisMonth: patientsThisMonth || 0,
        sessionsThisMonth: sessionsThisMonth || 0,
        feesThisMonth: feesThisMonth || 0,
        totalFees: totalFees || 0,
      },
      clinic: activeClinicInfo
        ? {
            name: activeClinicInfo.name,
            uniqueId: activeClinicInfo.uniqueId,
            allClinics,
          }
        : null,
      phone: authUser?.phone || '',
      email: authUser?.email || null,
    })
  } catch (error: any) {
    return toApiErrorResponse(error, 'فشل في جلب بيانات الطبيب')
  }
}
