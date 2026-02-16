import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole(['doctor', 'frontdesk'])

    if (user.role === 'doctor') {
      const supabase = await createClient()

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

    // Frontdesk needs full doctor list for scheduling/check-in/payment flows.
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('doctors')
      .select('id, full_name, specialty')
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
