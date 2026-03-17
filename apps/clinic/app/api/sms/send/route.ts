export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { sendReminder } from '@shared/lib/sms/reminder-service'
import { ReminderContext } from '@shared/lib/sms/reminder-templates'

interface SendSMSBody {
  patientId: string
  phoneNumber: string
  messageType: 'appointment_reminder' | 'followup' | 'lab_ready' | 'custom'
  context: ReminderContext
  appointmentId?: string
  clinicId?: string
  language?: 'en' | 'ar'
}

export async function POST(request: NextRequest) {
  try {
    // Only doctors and frontdesk can send SMS
    const user = await requireApiRole(['doctor', 'frontdesk'])

    const body = (await request.json()) as SendSMSBody

    // Validate required fields
    if (!body.patientId || !body.phoneNumber || !body.messageType || !body.context) {
      return NextResponse.json(
        { error: 'Missing required fields: patientId, phoneNumber, messageType, context' },
        { status: 400 }
      )
    }

    // Validate phone number format (basic check)
    if (!body.phoneNumber.match(/^\+?[\d\s\-()]+$/)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    // Validate message type
    const validMessageTypes = ['appointment_reminder', 'followup', 'lab_ready', 'custom']
    if (!validMessageTypes.includes(body.messageType)) {
      return NextResponse.json(
        { error: `Invalid message type. Must be one of: ${validMessageTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Send the reminder
    const result = await sendReminder({
      patientId: body.patientId,
      phoneNumber: body.phoneNumber,
      messageType: body.messageType,
      context: body.context,
      appointmentId: body.appointmentId,
      clinicId: body.clinicId,
      language: body.language || 'ar',
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        sid: result.sid,
        message: 'SMS sent successfully'
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to send SMS'
        },
        { status: 400 }
      )
    }

  } catch (error: any) {
    console.error('SMS send error:', error)
    return toApiErrorResponse(error, 'Failed to send SMS')
  }
}
