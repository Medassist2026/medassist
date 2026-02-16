import { updateQueueStatus } from '@/lib/data/frontdesk'
import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    await requireApiRole('frontdesk')

    const body = await request.json()
    const { queueId, status } = body

    if (!queueId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    await updateQueueStatus(queueId, status)

    return NextResponse.json({
      success: true
    })

  } catch (error: any) {
    console.error('Queue update error:', error)
    return toApiErrorResponse(error, 'Update failed')
  }
}
