import { canMessagePatient, upgradeRelationship } from '@/lib/data/patients'
import { requireRole } from '@/lib/auth/session'
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
    const user = await requireRole('doctor')
    
    const canMessage = await canMessagePatient(user.id, params.id)
    
    return NextResponse.json({
      canMessage,
      reason: canMessage 
        ? 'Patient has shared their code with you'
        : 'Patient has not shared their code. Messaging is not available.'
    })
    
  } catch (error: any) {
    console.error('Check messaging permission error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to check permission' },
      { status: 500 }
    )
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
    const user = await requireRole('doctor')
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
      messageAr: 'تم ترقية العلاقة. المريض الآن في قائمة مرضاك ويمكنك مراسلته.'
    })
    
  } catch (error: any) {
    console.error('Upgrade relationship error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upgrade' },
      { status: 500 }
    )
  }
}
