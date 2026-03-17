export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClinic } from '@shared/lib/data/users'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { name } = await request.json()

    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Clinic name is required (at least 2 characters)' },
        { status: 400 }
      )
    }

    const result = await createClinic({
      name: name.trim(),
      doctorId: user.id
    })

    return NextResponse.json({
      success: true,
      clinicId: result.clinicId,
      clinicUniqueId: result.clinicUniqueId
    })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to create clinic')
  }
}
