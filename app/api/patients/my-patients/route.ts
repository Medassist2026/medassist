import { getMyPatients, searchMyPatients } from '@/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

/**
 * GET /api/patients/my-patients
 * 
 * Get doctor's patients (only those with relationships)
 * 
 * Query params:
 * - accessType: 'walk_in' | 'verified' | 'all' (default: 'all')
 * - search: search query (optional)
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    
    const { searchParams } = new URL(request.url)
    const accessType = searchParams.get('accessType') as 'walk_in' | 'verified' | 'all' || 'all'
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    
    // If search query provided, use search function
    if (search && search.length >= 2) {
      const patients = await searchMyPatients(user.id, search, limit)
      return NextResponse.json({
        patients,
        total: patients.length,
        isSearch: true
      })
    }
    
    // Otherwise get paginated list
    const result = await getMyPatients(user.id, { accessType, limit, offset })
    
    return NextResponse.json({
      patients: result.patients,
      total: result.total,
      limit,
      offset,
      hasMore: offset + result.patients.length < result.total
    })
    
  } catch (error: any) {
    console.error('Get my patients error:', error)
    return toApiErrorResponse(error, 'Failed to get patients')
  }
}
