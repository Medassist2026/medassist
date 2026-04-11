export const dynamic = 'force-dynamic'

import { createClient } from '@shared/lib/supabase/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getClinicDoctorIds, getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])
    const supabase = await createClient()

    if (user.role === 'doctor') {
      const { data, error } = await supabase
        .from('doctors')
        .select('id, full_name, specialty')
        .eq('id', user.id)
        .order('full_name')

      if (error) throw new Error(error.message)

      return NextResponse.json({
        success: true,
        doctors: data
      })
    }

    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json({
        success: true,
        doctors: []
      })
    }

    const doctorIds = await getClinicDoctorIds(supabase as any, clinicId)
    if (doctorIds.length === 0) {
      return NextResponse.json({
        success: true,
        doctors: []
      })
    }

    const admin = createAdminClient('patient-privacy-checks')
    const { data, error } = await admin
      .from('doctors')
      .select('id, full_name, specialty')
      .in('id', doctorIds)
      .order('full_name')
    
    if (error) throw new Error(error.message)
    
    return NextResponse.json({
      success: true,
      doctors: data
    })

  } catch (error: any) {
    console.error('Load doctors error:', error)
    return toApiErrorResponse(error, 'Failed to load doctors')
  }
}
