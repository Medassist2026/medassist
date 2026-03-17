import { sendSMS } from './twilio-client'
import { reminderTemplates, ReminderContext } from './reminder-templates'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { auditLog } from '@shared/lib/audit/logger'

type MessageType = 'appointment_reminder' | 'appointment_cancelled' | 'followup' | 'lab_ready' | 'custom'

interface SendReminderParams {
  patientId: string
  phoneNumber: string
  messageType: MessageType
  context: ReminderContext
  appointmentId?: string
  clinicId?: string
  language?: 'en' | 'ar'
}

export async function sendReminder(params: SendReminderParams) {
  const { patientId, phoneNumber, messageType, context, appointmentId, clinicId, language = 'ar' } = params

  const template = reminderTemplates[messageType as keyof typeof reminderTemplates]
  if (!template) throw new Error(`Unknown message type: ${messageType}`)

  const messages = template(context as any)
  const messageBody = language === 'ar' ? messages.ar : messages.en

  // Send via Twilio
  const result = await sendSMS(phoneNumber, messageBody)

  // Log to database
  const admin = createAdminClient('sms-reminders')
  await admin.from('sms_reminders').insert({
    patient_id: patientId,
    appointment_id: appointmentId || null,
    clinic_id: clinicId || null,
    phone_number: phoneNumber,
    message_type: messageType,
    message_body: messageBody,
    message_body_ar: messages.ar,
    status: result.success ? 'sent' : 'failed',
    twilio_sid: result.sid || null,
    error_message: result.error || null,
    sent_at: result.success ? new Date().toISOString() : null,
  })

  // Audit log
  auditLog({
    userId: patientId,
    userRole: 'system',
    action: 'sms_sent',
    resourceType: 'sms_reminder',
    details: { messageType, success: result.success, phone: phoneNumber.slice(-4) }
  })

  return result
}

// Batch send reminders for tomorrow's appointments
export async function sendAppointmentReminders() {
  const admin = createAdminClient('sms-reminders')

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: appointments } = await admin
    .from('appointments')
    .select(
      `id, patient_id, doctor_id, appointment_date, appointment_time, clinic_id,
       patients(full_name, phone),
       doctors(full_name),
       clinics(name)`
    )
    .eq('appointment_date', tomorrowStr)
    .eq('status', 'confirmed')

  if (!appointments) return { sent: 0, failed: 0 }

  let sent = 0, failed = 0

  for (const apt of appointments) {
    const patient = (apt as any).patients
    const doctor = (apt as any).doctors
    const clinic = (apt as any).clinics

    if (!patient?.phone) continue

    const result = await sendReminder({
      patientId: apt.patient_id,
      phoneNumber: patient.phone,
      messageType: 'appointment_reminder',
      appointmentId: apt.id,
      clinicId: (apt as any).clinic_id,
      context: {
        patientName: patient.full_name || 'Patient',
        doctorName: doctor?.full_name || 'Doctor',
        clinicName: clinic?.name || '',
        appointmentDate: apt.appointment_date,
        appointmentTime: apt.appointment_time,
      },
      language: 'ar',
    })

    if (result.success) sent++
    else failed++
  }

  return { sent, failed }
}
