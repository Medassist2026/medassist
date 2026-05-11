export const dynamic = 'force-dynamic'

/**
 * /api/patient/sharing — B07 Phase F.5 cross-context extension.
 *
 * GET: sharing state (legacy patient_visibility + Build 05
 *      patient_data_shares) for the active gp context.
 * DELETE: revoke a legacy patient_visibility grant. Delegates rejected
 *         (no MVP capability covers `consent_to_share`; ruling 4).
 *
 * Minor gps return empty shares (no claim, no `patients.id`, no rows).
 */

import { NextResponse } from 'next/server'
import {
  requireApiRole,
  toApiErrorResponse,
} from '@shared/lib/auth/session'
import {
  getPatientSharingStatus,
  revokeVisibility,
} from '@shared/lib/data/visibility'
import { logAuditEvent } from '@shared/lib/data/audit'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { listSharesForPatient } from '@shared/lib/data/patient-shares'
import {
  emptyForCrossContext,
  resolvePatientContext,
} from '@shared/lib/auth/patient-context'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        emptyForCrossContext({ grants: [], shares: [] })
      )
    }

    const { grants } = await getPatientSharingStatus(ctx.resolvedPatientId)

    // Enrich with doctor/clinic names
    const admin = createAdminClient('patient-sharing')

    const clinicIds = [...new Set(grants.map((g) => g.clinic_id))]
    const doctorIds = [
      ...new Set(
        grants.map((g) => g.grantee_user_id).filter(Boolean) as string[]
      ),
    ]

    let clinicMap: Record<string, string> = {}
    let doctorMap: Record<string, string> = {}

    if (clinicIds.length > 0) {
      const { data: clinics } = await admin
        .from('clinics')
        .select('id, name')
        .in('id', clinicIds)
      if (clinics) {
        clinicMap = Object.fromEntries(
          clinics.map((c) => [c.id, c.name])
        )
      }
    }

    if (doctorIds.length > 0) {
      const { data: doctors } = await admin
        .from('doctors')
        .select('id, full_name')
        .in('id', doctorIds)
      if (doctors) {
        doctorMap = Object.fromEntries(
          doctors.map((d) => [d.id, d.full_name || 'Doctor'])
        )
      }
    }

    const enrichedGrants = grants.map((g) => ({
      ...g,
      clinic_name: clinicMap[g.clinic_id] || 'Unknown Clinic',
      doctor_name: g.grantee_user_id
        ? doctorMap[g.grantee_user_id] || 'Doctor'
        : null,
    }))

    // ─── Build 05 § B10: also return patient_data_shares ─────────────────
    // Resolve gpid: prefer ctx.gpId when cross-context; else look up via
    // claimed_user_id = ctx.resolvedPatientId.
    let shares: Array<Record<string, unknown>> = []
    try {
      const url = request ? new URL(request.url) : null
      const includeExpired =
        url?.searchParams.get('include_expired') === 'true'

      let gpid: string | null = ctx.gpId
      if (!gpid) {
        const { data: gp } = await admin
          .from('global_patients')
          .select('id')
          .eq('claimed_user_id', ctx.resolvedPatientId)
          .maybeSingle()
        gpid = (gp as { id?: string } | null)?.id ?? null
      }

      if (gpid) {
        const rawShares = await listSharesForPatient({
          globalPatientId: gpid,
          includeExpired,
        })

        // Enrich each share with grantor + grantee clinic names.
        const shareClinicIds = Array.from(
          new Set(
            rawShares.flatMap((s) => [
              s.grantor_clinic_id,
              s.grantee_clinic_id,
            ])
          )
        )
        let shareClinicMap: Record<string, string> = clinicMap
        if (shareClinicIds.length > 0) {
          const { data: clinicsForShares } = await admin
            .from('clinics')
            .select('id, name')
            .in('id', shareClinicIds)
          if (clinicsForShares) {
            for (const c of clinicsForShares as Array<{
              id: string
              name: string
            }>) {
              shareClinicMap[c.id] = c.name
            }
          }
        }

        shares = rawShares.map((s) => {
          const isActive =
            s.revoked_at === null &&
            (s.expires_at === null || new Date(s.expires_at) > new Date())
          return {
            id: s.id,
            global_patient_id: s.global_patient_id,
            grantor_clinic_id: s.grantor_clinic_id,
            grantor_clinic_name:
              shareClinicMap[s.grantor_clinic_id] ?? 'Unknown Clinic',
            grantee_clinic_id: s.grantee_clinic_id,
            grantee_clinic_name:
              shareClinicMap[s.grantee_clinic_id] ?? 'Unknown Clinic',
            granted_at: s.granted_at,
            expires_at: s.expires_at,
            revoked_at: s.revoked_at,
            granted_via: s.granted_via,
            grant_reason: s.grant_reason,
            is_active: isActive,
            is_permanent:
              s.expires_at === null && s.revoked_at === null,
          }
        })
      }
    } catch (err) {
      console.error(
        'GET /patient/sharing: shares enrichment failed (non-fatal):',
        err
      )
    }

    return NextResponse.json({
      success: true,
      grants: enrichedGrants,
      shares,
    })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to get sharing info')
  }
}

/**
 * DELETE /api/patient/sharing — Revoke a specific legacy visibility grant.
 *
 * Cross-context: accepts optional `?gpId=<id>`. Delegates rejected
 * (sharing falls under `consent_to_share` which is post-MVP).
 */
export async function DELETE(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const ctx = await resolvePatientContext({
      request,
      userId: user.id,
      denyDelegates: true,
    })

    if (ctx.resolvedPatientId === null) {
      return NextResponse.json(
        { error: 'Cannot revoke shares for this account context' },
        { status: 400 }
      )
    }

    const { visibilityId } = await request.json()

    if (!visibilityId) {
      return NextResponse.json(
        { error: 'Visibility ID required' },
        { status: 400 }
      )
    }

    // Verify the grant belongs to the resolved subject.
    const admin = createAdminClient('patient-sharing')
    const { data: grant } = await admin
      .from('patient_visibility')
      .select('patient_id')
      .eq('id', visibilityId)
      .single()

    if (!grant || grant.patient_id !== ctx.resolvedPatientId) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      )
    }

    const { error } = await revokeVisibility(visibilityId)
    if (error) {
      return NextResponse.json(
        { error: 'Failed to revoke' },
        { status: 500 }
      )
    }

    logAuditEvent({
      actorUserId: user.id,
      action: 'REVOKE_SHARE',
      entityType: 'patient_visibility',
      entityId: visibilityId,
      metadata: {
        acting_as: ctx.basis,
        ...(ctx.gpId ? { global_patient_id: ctx.gpId } : {}),
      },
    })

    return NextResponse.json({ success: true, message: 'Access revoked' })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to revoke sharing')
  }
}
