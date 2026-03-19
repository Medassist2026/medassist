export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/doctor/stats
 * Returns doctor profile, clinic context, and activity stats.
 * Used by the Profile page.
 */
export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()
    const admin = createAdminClient('doctor-stats')

    // ── 1. Doctor profile ─────────────────────────────────────
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, full_name, specialty, unique_id, consultation_fee_egp, followup_fee_egp')
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

    // ── 3. Clinic memberships ─────────────────────────────────
    const { data: memberships } = await admin
      .from('clinic_memberships')
      .select('role, clinic:clinics(id, name, unique_id)')
      .eq('user_id', user.id)
      .eq('user_role', 'doctor')

    const allClinics = (memberships || [])
      .filter((m: any) => m.clinic)
      .map((m: any) => ({
        id: m.clinic.id,
        name: m.clinic.name,
        uniqueId: m.clinic.unique_id,
        role: m.role,
      }))

    const activeClinic = allClinics[0] || null

    // ── 4. Patient count ──────────────────────────────────────
    const { count: totalPatients } = await admin
      .from('doctor_patient_relationships')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', user.id)
      .eq('status', 'active')

    // ── 5. Session counts ─────────────────────────────────────
    const { count: totalSessions } = await admin
      .from('clinical_notes')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', user.id)

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count: sessionsThisMonth } = await admin
      .from('clinical_notes')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', user.id)
      .gte('created_at', startOfMonth.toISOString())

    // ── 6. Fee revenue this month ─────────────────────────────
    const { data: payments } = await admin
      .from('payments')
      .select('amount')
      .eq('doctor_id', user.id)
      .gte('created_at', startOfMonth.toISOString())
      .eq('status', 'paid')

    const totalFees = (payments || []).reduce(
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
        consultationFee: doctor.consultation_fee_egp || 0,
        followupFee: doctor.followup_fee_egp || 0,
      },
      stats: {
        totalPatients: totalPatients || 0,
        totalSessions: totalSessions || 0,
        sessionsThisMonth: sessionsThisMonth || 0,
        totalFees: totalFees || 0,
      },
      clinic: activeClinic
        ? {
            name: activeClinic.name,
            uniqueId: activeClinic.uniqueId,
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
