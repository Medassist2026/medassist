export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getDoctorLabOrders, getLabOrderDetails, submitLabResults, updateLabOrderStatus } from '@shared/lib/data/clinical'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const orderId = searchParams.get('orderId')

    // Get single order details
    if (orderId) {
      const order = await getLabOrderDetails(orderId)
      return NextResponse.json({ success: true, order })
    }

    // Get all orders for doctor
    const orders = await getDoctorLabOrders(user.id, status || undefined)

    return NextResponse.json({
      success: true,
      orders
    })

  } catch (error: any) {
    console.error('Lab orders error:', error)
    return toApiErrorResponse(error, 'Failed to load lab orders')
  }
}

export async function POST(request: Request) {
  try {
    await requireApiRole('doctor')
    const body = await request.json()
    const { orderId, results, action } = body

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      )
    }

    // Handle status update
    if (action === 'updateStatus') {
      const { status } = body
      if (!status) {
        return NextResponse.json(
          { error: 'Status is required' },
          { status: 400 }
        )
      }
      
      await updateLabOrderStatus(orderId, status)
      return NextResponse.json({ success: true })
    }

    // Handle results submission
    if (action === 'submitResults') {
      if (!results || !Array.isArray(results)) {
        return NextResponse.json(
          { error: 'Results array is required' },
          { status: 400 }
        )
      }

      await submitLabResults(orderId, results)
      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )

  } catch (error: any) {
    console.error('Lab order update error:', error)
    return toApiErrorResponse(error, 'Failed to update lab order')
  }
}
