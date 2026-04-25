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
    // The clinic_memberships OWNER insert in createClinic() ignores errors,
    // so some older clinics may end up with the creator as DOCTOR rather than
    // OWNER. Heuristic: if there's no OWNER for this clinic and the calling
    // user is the SOLE active member, they're the creator — upgrade them.
    //
    // (Pre-mig-052 this used clinic_doctors as the "creator signal"; that
    // table is now dropped, so we use clinic_memberships membership cardinality
    // instead. Same intent, single source of truth.)
    let effectiveRole = (rawRole || '').toUpperCase() || 'DOCTOR'

    if (effectiveRole !== 'OWNER') {
      const { data: ownerRows } = await admin
        .from('clinic_memberships')
        .select('user_id')
        .eq('clinic_id', context.clinicId)
        .eq('role', 'OWNER')
        .eq('status', 'ACTIVE')
        .limit(1)

      if (!ownerRows?.length) {
        const { data: allMemberRows } = await admin
          .from('clinic_memberships')
          .select('user_id')
          .eq('clinic_id', context.clinicId)
          .eq('status', 'ACTIVE')

        const memberIds = (allMemberRows || []).map((r: any) => r.user_id)
        const isSoleMember = memberIds.length === 1 && memberIds[0] === user.id

        if (isSoleMember) {
          // Promote the sole member's existing membership to OWNER.
          await admin
            .from('clinic_memberships')
            .update({ role: 'OWNER' })
            .eq('clinic_id', context.clinicId)
            .eq('user_id', user.id)
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

// ============================================================================
// PATCH /api/clinic/settings — Update clinic name and/or address (OWNER only)
// ============================================================================

export async function PATCH(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const context = await getClinicContext(user.id, 'doctor')

    if (!context) {
      return NextResponse.json({ error: 'No clinic found' }, { status: 404 })
    }

    const role = await getClinicRole(user.id, context.clinicId)
    if (role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only the clinic owner can edit clinic details' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, address } = body

    if (name !== undefined && (!name || name.trim().length < 2)) {
      return NextResponse.json(
        { error: 'اسم العيادة لازم يكون على الأقل حرفين' },
        { status: 400 }
      )
    }
    if (address !== undefined && (!address || address.trim().length < 5)) {
      return NextResponse.json(
        { error: 'العنوان لازم يكون على الأقل ٥ أحرف' },
        { status: 400 }
      )
    }

    const updates: Record<string, string> = {}
    if (name)    updates.name    = name.trim()
    if (address) updates.address = address.trim()

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const admin = createAdminClient('clinic-settings-patch')
    const { error: updateError } = await admin
      .from('clinics')
      .update(updates)
      .eq('id', context.clinicId)

    if (updateError) throw new Error(updateError.message)

    return NextResponse.json({ success: true, ...updates })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to update clinic settings')
  }
}
