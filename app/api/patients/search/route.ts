import { searchMyPatients } from '@/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
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
      // Frontdesk search: operational lookup across patient registry.
      const admin = createAdminClient()
      const safeQuery = query.replace(/[%,]/g, ' ').trim()
      const term = `%${safeQuery}%`
      const { data, error } = await admin
        .from('patients')
        .select('id, unique_id, full_name, phone, age, sex, registered, created_at')
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
