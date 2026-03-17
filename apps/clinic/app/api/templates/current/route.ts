export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getDoctorProfile } from '@shared/lib/data/users'
import { getDefaultTemplate } from '@shared/lib/data/templates'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    
    // Get doctor's specialty
    const profile = await getDoctorProfile(user.id)
    
    // Get default template for specialty
    const template = await getDefaultTemplate(profile.specialty)
    
    if (!template) {
      return NextResponse.json(
        { error: 'No template found for specialty' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      template,
      specialty: profile.specialty
    })
    
  } catch (error: any) {
    console.error('Get template error:', error)
    return toApiErrorResponse(error, 'Failed to load template')
  }
}
