export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { NextResponse } from 'next/server'
import {
  findPotentialDuplicates,
  mergePatients,
  searchPatientsForDedup
} from '@shared/lib/data/patient-dedup'
import { auditLog } from '@shared/lib/audit/logger'

export async function GET(request: Request) {
  try {
    // Verify doctor/admin is logged in
    const user = await requireApiRole('doctor')

    // Get query parameter
    const url = new URL(request.url)
    const patientId = url.searchParams.get('patientId')
    const searchQuery = url.searchParams.get('search')

    if (!patientId && !searchQuery) {
      return NextResponse.json(
        { error: 'Either patientId or search query is required' },
        { status: 400 }
      )
    }

    const context = {
      userId: user.id,
      userRole: user.role || 'unknown'
    }

    // Search for duplicates by patient ID
    if (patientId) {
      const duplicates = await findPotentialDuplicates(patientId, context)

      await auditLog({
        userId: user.id,
        userRole: user.role || 'unknown',
        action: 'search',
        resourceType: 'patient',
        resourceId: patientId,
        details: {
          purpose: 'find-duplicates',
          matchesFound: duplicates.length
        }
      })

      return NextResponse.json({
        success: true,
        patientId,
        duplicates
      })
    }

    // Search for patients by name/phone
    if (searchQuery) {
      const results = await searchPatientsForDedup(searchQuery, context)

      return NextResponse.json({
        success: true,
        query: searchQuery,
        results
      })
    }
  } catch (error: any) {
    console.error('Patient dedup search error:', error)
    return toApiErrorResponse(error, 'Failed to search for duplicates')
  }
}

export async function POST(request: Request) {
  try {
    // Verify doctor/admin is logged in (only doctors can merge)
    const user = await requireApiRole('doctor')

    const body = await request.json()
    const { keepId, mergeId } = body

    if (!keepId || !mergeId) {
      return NextResponse.json(
        { error: 'Both keepId and mergeId are required' },
        { status: 400 }
      )
    }

    if (keepId === mergeId) {
      return NextResponse.json(
        { error: 'Cannot merge a patient with themselves' },
        { status: 400 }
      )
    }

    const context = {
      userId: user.id,
      userRole: user.role || 'unknown'
    }

    // Perform the merge
    await mergePatients(keepId, mergeId, context)

    // Log the merge action with more details
    await auditLog({
      userId: user.id,
      userRole: user.role || 'unknown',
      action: 'merge',
      resourceType: 'patient',
      resourceId: keepId,
      details: {
        mergedPatientId: mergeId,
        mergedByDoctor: user.id,
        timestamp: new Date().toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      message: `Successfully merged patient ${mergeId} into ${keepId}`,
      keepId,
      mergeId
    })
  } catch (error: any) {
    console.error('Patient merge error:', error)
    return toApiErrorResponse(error, 'Failed to merge patients')
  }
}
