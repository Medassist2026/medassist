export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { searchMyPatients } from '@shared/lib/data/patients'
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
    const mapped = patients.map((p) => ({
      id: p.id,
      name: p.full_name || 'Unknown Patient',
      phone: p.phone,
      date_of_birth: undefined,
      gender: p.sex ? p.sex.toLowerCase() : undefined,
      relationship_status: 'active',
      is_walkin: p.registered === false
    }))

    return NextResponse.json({ success: true, patients: mapped })
  } catch (error: any) {
    console.error('Doctor patient search error:', error)
    return toApiErrorResponse(error, 'Search failed')
  }
}
