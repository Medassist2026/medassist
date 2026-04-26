export const dynamic = 'force-dynamic'

import { searchMyPatients } from '@shared/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

/**
 * GET /api/patients/search
 * 
 * Search within doctor's patients only
 * 
 * PRIVACY: Doctors can ONLY search their own patients
 * (those with a relationship)
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])
    
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limitParam = searchParams.get('limit')
    
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Query must be at least 2 characters' },
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

      const { data, error } = await supabase
        .from('patients')
        .select('id, unique_id, full_name, phone, age, sex, registered, created_at')
        .in('id', patientIds)
        .or(`phone.ilike.${term},unique_id.ilike.${term},full_name.ilike.${term}`)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }
      patients = data || []
    }
    
    return NextResponse.json({
      patients,
      count: patients.length
    })
    
  } catch (error: any) {
    console.error('Patient search error:', error)
    return toApiErrorResponse(error, 'Search failed')
  }
}
