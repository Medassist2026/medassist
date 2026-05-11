export const dynamic = 'force-dynamic'

import { searchMyPatients } from '@shared/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

/**
 * GET /api/patients/search
 *
 * Search within doctor's patients only.
 *
 * PRIVACY: Doctors can ONLY search their own patients (those with a
 * relationship). Frontdesk staff search within their own clinic.
 *
 * QUERY PARAMS:
 *   q          required, ≥ 2 chars — substring search across phone +
 *              full_name + unique_id (+ parent_phone for doctor scope)
 *   limit      optional integer, default 10
 *   pediatric  optional — "true" / "false" / "all" (default "all").
 *              Filters by gp.is_minor. "true" = age < 18, "false" =
 *              adults only, "all" = no filter. B07 Phase G Section 2.
 *
 * RESPONSE SHAPE (B07 Phase G — extended):
 *   patients[] now carries v2 visibility fields per row:
 *     - is_minor                  : boolean (from gp.is_minor)
 *     - date_of_birth             : string | null (from gp.date_of_birth)
 *     - guardian_global_patient_id: uuid | null (from gp.guardian_global_patient_id)
 *     - guardian_display_name     : string | null (display name of guardian gp; null if guardian incomplete)
 *
 * JOIN APPROACH (Phase F.5 Decision 7 — two-pass lookup, not supabase-js
 * relational select): we collect global_patient_ids from search results,
 * fetch gp rows in one query, then fetch guardian gp rows in a second
 * query. supabase-js's relational select grammar doesn't compose cleanly
 * with self-referential FKs on the same table (guardian_global_patient_id
 * → global_patients.id), and the explicit two-pass is more legible.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limitParam = searchParams.get('limit')
    const pediatricParam = (searchParams.get('pediatric') ?? 'all').toLowerCase()

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (!['all', 'true', 'false'].includes(pediatricParam)) {
      return NextResponse.json(
        { error: 'pediatric must be one of: all, true, false' },
        { status: 400 }
      )
    }

    const limit = limitParam ? parseInt(limitParam) : 10
    let patients: any[] = []

    if (user.role === 'doctor') {
      // Doctor privacy-aware search: only their own patients.
      patients = await searchMyPatients(user.id, query, limit)
    } else {
      // Frontdesk search: only within own clinic.
      //
      // Scope source: doctor_patient_relationships.clinic_id (NOT NULL since
      // mig 051). Pre-D-057 this path joined clinical_notes + appointments,
      // which silently excluded patients registered via /frontdesk/patients/
      // register but never given a visit yet — making the user's complaint
      // ("I add as new and it tells me already saved") inevitable.
      // DPR captures every walk-in registration the moment onboardPatient
      // runs, so it's the canonical "patient is in this clinic's universe"
      // signal.
      const supabase = await createClient()
      const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
      if (!clinicId) {
        return NextResponse.json({ patients: [], count: 0 })
      }

      const safeQuery = query.replace(/[%,]/g, ' ').trim()
      const term = `%${safeQuery}%`

      const { data: relationships, error: relationshipsError } = await supabase
        .from('doctor_patient_relationships')
        .select('patient_id')
        .eq('clinic_id', clinicId)
        .limit(2000)

      if (relationshipsError) {
        throw new Error(relationshipsError.message)
      }

      const patientIds = Array.from(
        new Set(
          (relationships || [])
            .map((row: any) => row.patient_id)
            .filter(Boolean)
        )
      )
      if (patientIds.length === 0) {
        return NextResponse.json({ patients: [], count: 0 })
      }

      // B07 Phase G — global_patient_id added to select() so the
      // post-pass v2 augmentation can JOIN through it.
      const { data, error } = await supabase
        .from('patients')
        .select('id, unique_id, full_name, phone, age, sex, registered, created_at, global_patient_id, is_dependent, parent_phone')
        .in('id', patientIds)
        .or(`phone.ilike.${term},unique_id.ilike.${term},full_name.ilike.${term}`)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }
      patients = data || []
    }

    // ========================================================================
    // B07 Phase G — augment each row with v2 visibility fields
    // ========================================================================
    const gpIds = Array.from(
      new Set(
        patients
          .map((p: any) => p.global_patient_id)
          .filter((id: unknown): id is string => typeof id === 'string')
      )
    )

    const gpById = new Map<
      string,
      {
        id: string
        is_minor: boolean
        date_of_birth: string | null
        guardian_global_patient_id: string | null
      }
    >()
    const guardianDisplayById = new Map<string, string | null>()

    if (gpIds.length > 0) {
      // Pass 1 — fetch v2 fields for each searched patient's gp.
      // Use admin client because RLS on global_patients may filter for
      // patient-side reads; doctor/frontdesk staff already passed
      // requireApiRole and the patients-table scope guarantees they
      // belong to this clinic's universe.
      const admin = createAdminClient('patient-search-v2-augment')
      const { data: gpRows, error: gpErr } = await admin
        .from('global_patients')
        .select('id, is_minor, date_of_birth, guardian_global_patient_id')
        .in('id', gpIds)

      if (gpErr) {
        // Soft-fail: degrade to pre-Phase-G shape so the search bar
        // doesn't blank out on a transient gp-table issue.
        console.error('search v2 augment: gp lookup failed', gpErr)
      } else {
        for (const row of (gpRows ?? []) as Array<{
          id: string
          is_minor: boolean | null
          date_of_birth: string | null
          guardian_global_patient_id: string | null
        }>) {
          gpById.set(row.id, {
            id: row.id,
            is_minor: row.is_minor === true,
            date_of_birth: row.date_of_birth,
            guardian_global_patient_id: row.guardian_global_patient_id,
          })
        }

        // Pass 2 — resolve guardian display names for any minor rows.
        const guardianGpIds = Array.from(
          new Set(
            Array.from(gpById.values())
              .map((r) => r.guardian_global_patient_id)
              .filter((id): id is string => typeof id === 'string' && id.length > 0)
          )
        )
        if (guardianGpIds.length > 0) {
          const { data: guardianRows, error: guardianErr } = await admin
            .from('global_patients')
            .select('id, display_name')
            .in('id', guardianGpIds)
          if (!guardianErr && guardianRows) {
            for (const g of guardianRows as Array<{ id: string; display_name: string | null }>) {
              guardianDisplayById.set(g.id, g.display_name)
            }
          }
        }
      }
    }

    const augmented = patients.map((p: any) => {
      const gp = p.global_patient_id ? gpById.get(p.global_patient_id) : null
      const guardianId = gp?.guardian_global_patient_id ?? null
      return {
        ...p,
        is_minor: gp?.is_minor ?? false,
        date_of_birth: gp?.date_of_birth ?? null,
        guardian_global_patient_id: guardianId,
        guardian_display_name: guardianId
          ? (guardianDisplayById.get(guardianId) ?? null)
          : null,
      }
    })

    // Apply pediatric filter post-augmentation.
    const filtered =
      pediatricParam === 'all'
        ? augmented
        : augmented.filter((p) =>
            pediatricParam === 'true' ? p.is_minor : !p.is_minor
          )

    return NextResponse.json({
      patients: filtered,
      count: filtered.length,
      pediatric: pediatricParam,
    })
  } catch (error: any) {
    console.error('Patient search error:', error)
    return toApiErrorResponse(error, 'Search failed')
  }
}
