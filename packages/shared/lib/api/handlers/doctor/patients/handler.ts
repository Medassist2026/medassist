export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { logAuditEvent } from '@shared/lib/data/audit'
import { getActiveClinicIdFromCookies } from '@shared/lib/data/clinic-context'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()
    const admin = createAdminClient('patient-privacy-checks')

    // B07 Phase G — pediatric filter param. Defaults to "all" (no filter)
    // to preserve pre-Phase-G behavior. The filter applies AFTER the
    // patients list is built so the FK-driven scope checks still own
    // who-can-see-what.
    const { searchParams } = new URL(request.url)
    const pediatricParam = (searchParams.get('pediatric') ?? 'all').toLowerCase()
    if (!['all', 'true', 'false'].includes(pediatricParam)) {
      return NextResponse.json(
        { success: false, error: 'pediatric must be one of: all, true, false' },
        { status: 400 }
      )
    }

    // Primary source: explicit doctor-patient relationships
    const { data: relationships, error: relError } = await admin
      .from('doctor_patient_relationships')
      .select('status, relationship_type, patient_id, created_at')
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: false })

    if (relError) {
      throw relError
    }

    const relationshipRows = (relationships || []) as any[]
    const relationshipPatients = relationshipRows
      .map((r) => ({
        relationship_status: (r.status || 'active') as 'active' | 'pending' | 'inactive',
        relationship_type: r.relationship_type || null,
        patient_id: r.patient_id as string
      }))
      .filter((r) => r.patient_id)

    const relationshipPatientIds = relationshipPatients.map((r) => r.patient_id)
    const relationshipPatientMap = new Map<string, any>()
    if (relationshipPatientIds.length > 0) {
      const { data: patientRows, error: patientRowsError } = await admin
        .from('patients')
        .select('id, full_name, phone, sex, registered, created_at, global_patient_id, is_dependent, parent_phone')
        .in('id', relationshipPatientIds)

      if (patientRowsError) throw patientRowsError
      ;(patientRows || []).forEach((p: any) => relationshipPatientMap.set(p.id, p))
    }

    // Shared-with-me source: patients shared by another doctor via patient_visibility
    const clinicId = await getActiveClinicIdFromCookies()
    if (clinicId) {
      try {
        const { data: sharedRows } = await admin
          .from('patient_visibility')
          .select('patient_id')
          .eq('clinic_id', clinicId)
          .eq('grantee_user_id', user.id)
          .eq('mode', 'SHARED_BY_CONSENT')

        const sharedIds = (sharedRows || [])
          .map((r: any) => r.patient_id as string)
          .filter(id => id && !relationshipPatientIds.includes(id)) // no duplicates

        if (sharedIds.length > 0) {
          const { data: sharedPatients } = await admin
            .from('patients')
            .select('id, full_name, phone, sex, registered, created_at, global_patient_id, is_dependent, parent_phone')
            .in('id', sharedIds)

          ;(sharedPatients || []).forEach((p: any) => {
            relationshipPatientMap.set(p.id, p)
            relationshipPatients.push({
              relationship_status: 'active',
              relationship_type: 'shared',
              patient_id: p.id,
            })
          })
        }
      } catch { /* patient_visibility may not exist — non-fatal */ }
    }

    // Fallback source for legacy doctors without relationship rows:
    // patients inferred from clinical notes.
    let basePatients = relationshipPatients
    if (basePatients.length === 0) {
      const { data: notes, error: notesError } = await supabase
        .from('clinical_notes')
        .select('patient_id')
        .eq('doctor_id', user.id)

      if (notesError) throw notesError

      const inferredPatientIds = Array.from(new Set((notes || []).map((n) => n.patient_id)))
      if (inferredPatientIds.length > 0) {
        const { data: inferredPatients, error: inferredError } = await admin
          .from('patients')
          .select('id, full_name, phone, sex, registered, created_at, global_patient_id, is_dependent, parent_phone')
          .in('id', inferredPatientIds)

        if (inferredError) throw inferredError

        basePatients = (inferredPatients || []).map((p) => ({
          relationship_status: 'active' as const,
          relationship_type: null,
          patient_id: p.id
        }))

        ;(inferredPatients || []).forEach((p: any) => relationshipPatientMap.set(p.id, p))
      }
    }

    if (basePatients.length === 0) {
      return NextResponse.json({ success: true, patients: [] })
    }

    const patientIds = basePatients
      .map((r) => r.patient_id)
      .filter((id): id is string => !!id)

    // Build visit stats from clinical notes
    const { data: noteStats, error: noteStatsError } = await supabase
      .from('clinical_notes')
      .select('patient_id, created_at')
      .eq('doctor_id', user.id)
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false })

    if (noteStatsError) throw noteStatsError

    const statsByPatient: Record<string, { count: number; lastVisit: string | null }> = {}
    ;(noteStats || []).forEach((note) => {
      if (!statsByPatient[note.patient_id]) {
        statsByPatient[note.patient_id] = { count: 0, lastVisit: note.created_at || null }
      }
      statsByPatient[note.patient_id].count += 1
    })

    // ──────────────────────────────────────────────────────────────────
    // B07 Phase G — v2 visibility augment (is_minor, date_of_birth,
    // guardian_*). Two-pass: collect gp ids, fetch gp rows, then resolve
    // guardian display names for any minors. Mirrors the search handler's
    // approach (see Phase F.5 Decision 7 — two-pass lookup over
    // supabase-js relational select).
    // ──────────────────────────────────────────────────────────────────
    const gpIds = Array.from(
      new Set(
        Array.from(relationshipPatientMap.values())
          .map((p: any) => p?.global_patient_id)
          .filter((id: unknown): id is string => typeof id === 'string')
      )
    )
    const gpById = new Map<
      string,
      { is_minor: boolean; date_of_birth: string | null; guardian_global_patient_id: string | null }
    >()
    const guardianNameByGpId = new Map<string, string | null>()
    if (gpIds.length > 0) {
      const { data: gpRows } = await admin
        .from('global_patients')
        .select('id, is_minor, date_of_birth, guardian_global_patient_id')
        .in('id', gpIds)
      for (const row of (gpRows ?? []) as Array<{
        id: string
        is_minor: boolean | null
        date_of_birth: string | null
        guardian_global_patient_id: string | null
      }>) {
        gpById.set(row.id, {
          is_minor: row.is_minor === true,
          date_of_birth: row.date_of_birth,
          guardian_global_patient_id: row.guardian_global_patient_id,
        })
      }
      const guardianGpIds = Array.from(
        new Set(
          Array.from(gpById.values())
            .map((r) => r.guardian_global_patient_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
        )
      )
      if (guardianGpIds.length > 0) {
        const { data: guardianRows } = await admin
          .from('global_patients')
          .select('id, display_name')
          .in('id', guardianGpIds)
        for (const g of (guardianRows ?? []) as Array<{ id: string; display_name: string | null }>) {
          guardianNameByGpId.set(g.id, g.display_name)
        }
      }
    }

    const patients = basePatients
      .map((row) => {
        const patient = relationshipPatientMap.get(row.patient_id)
        if (!patient) return null
        const stats = statsByPatient[patient.id]
        const gpInfo = patient.global_patient_id ? gpById.get(patient.global_patient_id) : null
        const guardianId = gpInfo?.guardian_global_patient_id ?? null
        return {
          id: patient.id,
          name: patient.full_name || 'مريض',
          phone: patient.phone,
          gender: patient.sex ? patient.sex.toLowerCase() : undefined,
          relationship_status: row.relationship_status,
          is_walkin: patient.registered === false,
          last_visit: stats?.lastVisit || null,
          visit_count: stats?.count || 0,
          created_at: patient.created_at,
          // B07 Phase G — v2 visibility fields
          is_minor: gpInfo?.is_minor ?? false,
          date_of_birth: gpInfo?.date_of_birth ?? null,
          is_dependent: patient.is_dependent === true,
          parent_phone: patient.parent_phone ?? null,
          guardian_global_patient_id: guardianId,
          guardian_display_name: guardianId ? (guardianNameByGpId.get(guardianId) ?? null) : null,
        }
      })
      .filter((p): p is {
        id: string
        name: string
        phone: string
        gender: string | undefined
        relationship_status: 'active' | 'pending' | 'inactive'
        is_walkin: boolean
        last_visit: string | null
        visit_count: number
        created_at: string
        is_minor: boolean
        date_of_birth: string | null
        is_dependent: boolean
        parent_phone: string | null
        guardian_global_patient_id: string | null
        guardian_display_name: string | null
      } => !!p)
      .filter((p) =>
        pediatricParam === 'all'
          ? true
          : pediatricParam === 'true'
          ? p.is_minor
          : !p.is_minor
      )
      .sort((a, b) => {
        const aTime = a.last_visit ? new Date(a.last_visit).getTime() : 0
        const bTime = b.last_visit ? new Date(b.last_visit).getTime() : 0
        return bTime - aTime
      })

    // Audit: doctor viewed patient list (clinicId already resolved above)
    logAuditEvent({
      clinicId: clinicId || undefined,
      actorUserId: user.id,
      action: 'VIEW_PATIENT',
      entityType: 'patient_list',
      metadata: { count: patients.length, pediatric_filter: pediatricParam }
    })

    return NextResponse.json({ success: true, patients, pediatric: pediatricParam })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to fetch patients')
  }
}
