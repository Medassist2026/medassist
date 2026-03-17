export const dynamic = 'force-dynamic'

import { canMessagePatient, getDoctorPatientRelationship, upgradeRelationship } from '@shared/lib/data/patients'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { NextResponse } from 'next/server'

/**
 * GET /api/patients/[id]/can-message
 * 
 * Check if doctor can message this patient
 * Only verified relationships allow messaging
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireApiRole('doctor')
    const relationship = await getDoctorPatientRelationship(user.id, params.id)
    const canMessage = await canMessagePatient(user.id, params.id)
    
    return NextResponse.json({
      success: true,
      access_level: relationship?.access_level || (relationship?.access_type === 'verified' ? 'verified_consented' : 'walk_in_limited'),
      consent_state: relationship?.consent_state || (relationship?.access_type === 'verified' ? 'granted' : 'pending'),
      canMessage,
      reason: canMessage 
        ? 'Patient has shared their code with you'
        : 'Patient has not shared their code. Messaging is not available.'
    })
    
  } catch (error: any) {
    console.error('Check messaging permission error:', error)
    return toApiErrorResponse(error, 'Failed to check permission')
  }
}

/**
 * POST /api/patients/[id]/upgrade
 * 
 * Upgrade relationship when patient shares code
 * walk_in → verified
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireApiRole('doctor')
    const { code } = await request.json()
    
    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Patient code is required' },
        { status: 400 }
      )
    }
    
    const result = await upgradeRelationship(user.id, params.id, code)
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message },
        { status: 400 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: result.message,
      access_level: result.relationship?.access_level || 'verified_consented',
      consent_state: result.relationship?.consent_state || 'granted',
      messageAr: 'تم ترقية العلاقة. المريض الآن في قائمة مرضاك ويمكنك مراسلته.'
    })
    
  } catch (error: any) {
    console.error('Upgrade relationship error:', error)
    return toApiErrorResponse(error, 'Failed to upgrade relationship')
  }
}
