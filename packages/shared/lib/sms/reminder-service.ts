import { sendSMS } from './twilio-client'
import { reminderTemplates, ReminderContext } from './reminder-templates'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { auditLog } from '@shared/lib/audit/logger'

type MessageType = 'appointment_reminder' | 'appointment_confirmed' | 'appointment_cancelled' | 'followup' | 'lab_ready' | 'custom'

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

  // Use start_time (the actual schema column) with a date range for tomorrow
  const { data: appointments } = await admin
    .from('appointments')
    .select(
      `id, patient_id, doctor_id, start_time, clinic_id,
       patients!appointments_patient_id_fkey(full_name, phone),
       doctors!appointments_doctor_id_fkey(full_name),
       clinics!appointments_clinic_id_fkey(name)`
    )
    .gte('start_time', `${tomorrowStr}T00:00:00`)
    .lte('start_time', `${tomorrowStr}T23:59:59`)
    .in('status', ['scheduled', 'confirmed'])

  if (!appointments) return { sent: 0, failed: 0 }

  let sent = 0, failed = 0

  for (const apt of appointments) {
    const patient = Array.isArray((apt as any).patients) ? (apt as any).patients[0] : (apt as any).patients
    const doctor = Array.isArray((apt as any).doctors) ? (apt as any).doctors[0] : (apt as any).doctors
    const clinic = Array.isArray((apt as any).clinics) ? (apt as any).clinics[0] : (apt as any).clinics

    if (!patient?.phone) continue

    // Format date/time from start_time
    const aptDate = new Date((apt as any).start_time)
    const dateStr = aptDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })
    const timeStr = aptDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })

    const result = await sendReminder({
      patientId: apt.patient_id,
      phoneNumber: patient.phone,
      messageType: 'appointment_reminder',
      appointmentId: apt.id,
      clinicId: (apt as any).clinic_id,
      context: {
        patientName: patient.full_name || 'المريض',
        doctorName: doctor?.full_name || 'الطبيب',
        clinicName: clinic?.name || '',
        appointmentDate: dateStr,
        appointmentTime: timeStr,
      },
      language: 'ar',
    })

    if (result.success) sent++
    else failed++
  }

  return { sent, failed }
}
