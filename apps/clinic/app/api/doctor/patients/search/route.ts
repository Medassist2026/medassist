export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { searchMyPatients } from '@shared/lib/data/patients'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ patients: [] })
    }

    // Always scope search to this doctor's own patients — never expose other doctors' patients.
    // Clinic-wide search is intentionally disabled to protect patient privacy in multi-doctor clinics.
    const patients = await searchMyPatients(user.id, query.trim(), 20)
    if (patients.length === 0) {
      return NextResponse.json({ success: true, patients: [] })
    }

    // Fetch access_level for each patient from this doctor's relationships
    // Used by P3: show upgrade prompt when patient is registered but not yet verified_consented
    const admin = createAdminClient('patient-search-access')
    const patientIds = patients.map((p) => p.id)
    const { data: relationships } = await admin
      .from('doctor_patient_relationships')
      .select('patient_id, access_level')
      .eq('doctor_id', user.id)
      .in('patient_id', patientIds)

    const accessMap: Record<string, string> = {}
    for (const rel of relationships || []) {
      accessMap[rel.patient_id] = rel.access_level
    }

    const mapped = patients.map((p) => ({
      id: p.id,
      name: p.full_name || 'Unknown Patient',
      phone: p.phone,
      date_of_birth: undefined,
      gender: p.sex ? p.sex.toLowerCase() : undefined,
      relationship_status: 'active',
      is_walkin: p.registered === false,
      // P3 fields — used to offer code-verification upgrade in SessionForm
      is_registered: p.registered === true,
      access_level: accessMap[p.id] || 'walk_in_limited',
    }))

    return NextResponse.json({ success: true, patients: mapped })
  } catch (error: any) {
    console.error('Doctor patient search error:', error)
    return toApiErrorResponse(error, 'Search failed')
  }
}
