/**
 * GET /api/admin/patient-clinic-records
 *
 * Internal verification endpoint for the patient_clinic_records layer
 * (mig 075 / Build prompt 03). Returns the per-clinic records for a
 * global patient, OR the patients at a clinic.
 *
 * Query modes (mutually exclusive):
 *   ?global_patient_id=<uuid>    → all PCRs for this global patient
 *   ?clinic_id=<uuid>            → all PCRs at this clinic
 *                                   (paginated, max 100/page)
 *     &limit=<n>   (1-100, default 50)
 *     &offset=<n>  (default 0)
 *
 * NOT user-facing. The patient and clinic apps don't yet expose
 * patient_clinic_records data; that ships in Prompt 4 (privacy code) and
 * Prompt 10 (patient app).
 *
 * Auth: SERVICE-ROLE ONLY via requireServiceRole. Same rationale as
 * /api/admin/global-patients/lookup — this endpoint resolves any global
 * patient to every clinic where their data lives, which is a network-
 * wide read and not appropriate for per-clinic operators.
 *
 * Response shapes:
 *   global_patient_id mode (success):
 *     200 { mode: 'by_global_patient', global_patient_id, records: [...] }
 *   clinic_id mode (success):
 *     200 { mode: 'by_clinic', clinic_id, limit, offset, records: [...] }
 *   400 — neither or both query params provided, or invalid uuid
 *   401 — missing/invalid service-role bearer
 *   500 — internal
 */

import { NextResponse } from 'next/server'
import { requireServiceRole, toApiErrorResponse } from '@shared/lib/auth/session'
import {
  listPatientClinicRecordsForGlobal,
  listPatientClinicRecordsForClinic,
} from '@shared/lib/data/patient-clinic-records'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request): Promise<Response> {
  try {
    requireServiceRole(request)

    const url = new URL(request.url)
    const globalPatientId = url.searchParams.get('global_patient_id')
    const clinicId = url.searchParams.get('clinic_id')

    // Exactly one mode.
    if ((!globalPatientId && !clinicId) || (globalPatientId && clinicId)) {
      return NextResponse.json(
        {
          error: 'Provide exactly one of global_patient_id OR clinic_id query param',
        },
        { status: 400 }
      )
    }

    if (globalPatientId) {
      if (!UUID_REGEX.test(globalPatientId)) {
        return NextResponse.json(
          { error: 'global_patient_id must be a UUID' },
          { status: 400 }
        )
      }
      const records = await listPatientClinicRecordsForGlobal(globalPatientId)
      return NextResponse.json({
        mode: 'by_global_patient',
        global_patient_id: globalPatientId,
        records,
      })
    }

    // clinicId mode.
    if (!UUID_REGEX.test(clinicId!)) {
      return NextResponse.json(
        { error: 'clinic_id must be a UUID' },
        { status: 400 }
      )
    }

    const limitRaw = url.searchParams.get('limit')
    const offsetRaw = url.searchParams.get('offset')
    let limit = limitRaw ? parseInt(limitRaw, 10) : 50
    let offset = offsetRaw ? parseInt(offsetRaw, 10) : 0
    if (Number.isNaN(limit) || limit < 1) limit = 50
    if (limit > 100) limit = 100
    if (Number.isNaN(offset) || offset < 0) offset = 0

    const records = await listPatientClinicRecordsForClinic(clinicId!, {
      limit,
      offset,
    })
    return NextResponse.json({
      mode: 'by_clinic',
      clinic_id: clinicId,
      limit,
      offset,
      records,
    })
  } catch (error) {
    console.error('admin/patient-clinic-records error:', error)
    return toApiErrorResponse(error, 'Failed to read patient_clinic_records')
  }
}
