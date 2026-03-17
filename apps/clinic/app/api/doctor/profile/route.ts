export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * PATCH /api/doctor/profile
 * Updates doctor profile fields (specialty, full_name, etc.)
 * Used during setup and profile editing.
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()

    const admin = createAdminClient('doctor-profile-update')

    // Build update object with only allowed fields
    const updates: Record<string, any> = {}
    if (body.specialty) updates.specialty = body.specialty
    if (body.fullName) updates.full_name = body.fullName

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'لا توجد بيانات للتحديث' },
        { status: 400 }
      )
    }

    const { error } = await admin
      .from('doctors')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return toApiErrorResponse(error, 'فشل في تحديث الملف الشخصي')
  }
}
