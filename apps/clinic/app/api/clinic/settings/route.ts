export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse, getClinicRole } from '@shared/lib/auth/session'
import { getClinicContext, getClinicMembers } from '@shared/lib/data/clinic-context'
import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// GET /api/clinic/settings — Fetch clinic data for settings page
// ============================================================================

export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const context = await getClinicContext(user.id, 'doctor')

    if (!context) {
      return NextResponse.json({ error: 'No clinic found' }, { status: 404 })
    }

    const [members, rawRole] = await Promise.all([
      getClinicMembers(context.clinicId),
      getClinicRole(user.id, context.clinicId),
    ])

    const admin = createAdminClient('settings-owner-check')

    // ── Owner auto-repair ────────────────────────────────────────────────────
    // clinic_memberships OWNER insert is fire-and-forget in createClinic(),
    // so some older clinics may have no OWNER row even though the doctor
    // who created the clinic is the real owner.
    //
    // Detection: userRole is null/DOCTOR but NO OWNER exists anywhere in
    // clinic_memberships for this clinic AND this user is in clinic_doctors
    // (i.e. they were linked at clinic creation time).
    let effectiveRole = (rawRole || '').toUpperCase() || 'DOCTOR'

    if (effectiveRole !== 'OWNER') {
      // 1. Check if any OWNER exists in clinic_memberships for this clinic
      const { data: ownerRows } = await admin
        .from('clinic_memberships')
        .select('user_id')
        .eq('clinic_id', context.clinicId)
        .eq('role', 'OWNER')
        .eq('status', 'ACTIVE')
        .limit(1)

      if (!ownerRows?.length) {
        // 2. No OWNER row exists — check if this user is in clinic_doctors
        const { data: cdRow } = await admin
          .from('clinic_doctors')
          .select('doctor_id')
          .eq('clinic_id', context.clinicId)
          .eq('doctor_id', user.id)
          .limit(1)
          .maybeSingle()

        if (cdRow) {
          // This doctor was linked at clinic creation — they ARE the owner.
          // Repair the missing membership row.
          await admin
            .from('clinic_memberships')
            .upsert(
              {
                clinic_id: context.clinicId,
                user_id: user.id,
                role: 'OWNER',
                status: 'ACTIVE',
              },
              { onConflict: 'clinic_id,user_id' }
            )
          effectiveRole = 'OWNER'
        }
      }
    }

    // Normalize role strings (DB may store lowercase legacy values)
    const normalizeRole = (r: string) => r.toUpperCase()
    const doctors = members.filter(m => ['OWNER', 'DOCTOR'].includes(normalizeRole(m.role)))
    const staff   = members.filter(m => ['ASSISTANT', 'FRONT_DESK'].includes(normalizeRole(m.role)))

    return NextResponse.json({
      clinicId: context.clinicId,
      clinicName: context.clinic.name,
      clinicUniqueId: context.clinic.uniqueId,
      doctors,
      staff,
      currentUserId: user.id,
      userRole: effectiveRole,             // 'OWNER' | 'DOCTOR' | 'ASSISTANT'
      hasMultipleClinics: context.hasMultipleClinics,
      allClinics: context.allClinics,      // [{id, name, uniqueId, role}] — used by clinic switcher
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch clinic settings')
  }
}
