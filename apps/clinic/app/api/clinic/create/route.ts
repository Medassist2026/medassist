export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClinic } from '@shared/lib/data/users'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { name, address } = await request.json()

    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Clinic name is required (at least 2 characters)' },
        { status: 400 }
      )
    }
    if (!address || address.trim().length < 5) {
      return NextResponse.json(
        { error: 'Clinic address is required — it appears on every prescription' },
        { status: 400 }
      )
    }

    const result = await createClinic({
      name: name.trim(),
      address: address.trim(),
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
