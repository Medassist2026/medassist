/**
 * Notification Creation Helper
 *
 * Product-level notification design for Egyptian clinic doctors:
 *
 * ┌─────────────────────────────┬───────────────┬──────────────────────────────────┐
 * │ Notification Type           │ Recipient     │ Why It Matters                   │
 * ├─────────────────────────────┼───────────────┼──────────────────────────────────┤
 * │ patient_arrived             │ Doctor        │ Core workflow: patient is ready   │
 * │ appointment_booked          │ Doctor        │ Awareness: schedule changed       │
 * │ appointment_cancelled       │ Doctor        │ Saves wasted prep time           │
 * │ emergency_added             │ Doctor        │ Urgent: needs immediate attention │
 * │ session_completed           │ Front desk    │ Billing/checkout ready            │
 * │ appointment_reminder        │ Doctor+Patient│ Reduce no-shows                  │
 * │ daily_summary               │ Doctor        │ Morning briefing: today's load    │
 * │ message_received            │ Doctor+Patient│ Communication                    │
 * │ invite_accepted             │ Doctor        │ Team management                  │
 * │ queue_update                │ Patient       │ Wait time awareness              │
 * └─────────────────────────────┴───────────────┴──────────────────────────────────┘
 *
 * Balance principle: Only notify about things that require awareness or action.
 * Egyptian clinic context: Doctors see 20-40 patients/day. Notifications must be
 * high-signal, not noisy. "Patient arrived" is the most critical — it drives
 * the queue flow. "Emergency added" is rare but urgent.
 */

import { createAdminClient } from '@shared/lib/supabase/admin'

export type NotificationType =
  | 'patient_arrived'
  | 'appointment_booked'
  | 'appointment_cancelled'
  | 'emergency_added'
  | 'session_completed'
  | 'queue_update'
  | 'appointment_reminder'
  | 'daily_summary'
  | 'message_received'
  | 'invite_accepted'
  // Phone-change v2 (PR-2 / Phase B). See PHONE_CHANGE_PLAN.md §10.2 Q5.
  | 'phone_change_pending_approval' // → clinic OWNER, when fallback is opened
  | 'phone_change_completed'        // → subject (staff/patient), after commit
  | 'phone_change_approved'         // → subject, after owner approves fallback
  | 'phone_change_rejected'         // → subject, after owner rejects fallback

interface CreateNotificationParams {
  recipientId: string
  recipientRole: 'doctor' | 'frontdesk' | 'patient'
  type: NotificationType
  title: string
  body?: string
  clinicId?: string
  appointmentId?: string
  patientId?: string
}

/**
 * Create a single notification.
 * Gracefully fails if the notifications table doesn't exist yet.
 */
export async function createNotification(params: CreateNotificationParams): Promise<boolean> {
  try {
    const admin = createAdminClient('notifications-create')

    const { error } = await admin
      .from('notifications')
      .insert({
        recipient_id: params.recipientId,
        recipient_role: params.recipientRole,
        type: params.type,
        title: params.title,
        body: params.body || null,
        clinic_id: params.clinicId || null,
        appointment_id: params.appointmentId || null,
        patient_id: params.patientId || null,
        read: false,
      })

    if (error) {
      console.error('Failed to create notification:', error)
      return false
    }

    return true
  } catch (err) {
    // Gracefully fail — notifications are non-critical
    console.error('Notification creation error:', err)
    return false
  }
}

/**
 * Create notifications for multiple recipients at once.
 */
export async function createBulkNotifications(
  notifications: CreateNotificationParams[]
): Promise<number> {
  if (notifications.length === 0) return 0

  try {
    const admin = createAdminClient('notifications-bulk')

    const rows = notifications.map(n => ({
      recipient_id: n.recipientId,
      recipient_role: n.recipientRole,
      type: n.type,
      title: n.title,
      body: n.body || null,
      clinic_id: n.clinicId || null,
      appointment_id: n.appointmentId || null,
      patient_id: n.patientId || null,
      read: false,
    }))

    const { error, count } = await admin
      .from('notifications')
      .insert(rows)

    if (error) {
      console.error('Bulk notification error:', error)
      return 0
    }

    return notifications.length
  } catch (err) {
    console.error('Bulk notification creation error:', err)
    return 0
  }
}

// ============================================================================
// PRE-BUILT NOTIFICATION TEMPLATES
// ============================================================================

/** Notify doctor: patient has arrived (front desk checked them in) */
export function notifyPatientArrived(
  doctorId: string,
  patientName: string,
  clinicId?: string,
  appointmentId?: string,
  patientId?: string
) {
  return createNotification({
    recipientId: doctorId,
    recipientRole: 'doctor',
    type: 'patient_arrived',
    title: `وصل المريض: ${patientName}`,
    body: 'المريض في الانتظار',
    clinicId,
    appointmentId,
    patientId,
  })
}

/** Notify doctor: new appointment was booked */
export function notifyAppointmentBooked(
  doctorId: string,
  patientName: string,
  dateStr: string,
  clinicId?: string,
  appointmentId?: string
) {
  return createNotification({
    recipientId: doctorId,
    recipientRole: 'doctor',
    type: 'appointment_booked',
    title: `موعد جديد: ${patientName}`,
    body: `تم حجز موعد بتاريخ ${dateStr}`,
    clinicId,
    appointmentId,
  })
}

/** Notify doctor: appointment was cancelled */
export function notifyAppointmentCancelled(
  doctorId: string,
  patientName: string,
  clinicId?: string,
  appointmentId?: string
) {
  return createNotification({
    recipientId: doctorId,
    recipientRole: 'doctor',
    type: 'appointment_cancelled',
    title: `تم إلغاء موعد: ${patientName}`,
    clinicId,
    appointmentId,
  })
}

/** Notify doctor: emergency patient added to queue */
export function notifyEmergencyAdded(
  doctorId: string,
  patientName: string,
  clinicId?: string,
  patientId?: string
) {
  return createNotification({
    recipientId: doctorId,
    recipientRole: 'doctor',
    type: 'emergency_added',
    title: `حالة طوارئ: ${patientName}`,
    body: 'تمت إضافة مريض طوارئ إلى قائمة الانتظار',
    clinicId,
    patientId,
  })
}

/** Notify front desk: doctor completed a session */
export function notifySessionCompleted(
  frontdeskId: string,
  patientName: string,
  clinicId?: string,
  patientId?: string
) {
  return createNotification({
    recipientId: frontdeskId,
    recipientRole: 'frontdesk',
    type: 'session_completed',
    title: `انتهت الجلسة: ${patientName}`,
    body: 'المريض جاهز للخروج',
    clinicId,
    patientId,
  })
}

/** Notify doctor: front desk accepted invite and joined the clinic */
export function notifyInviteAccepted(
  doctorId: string,
  staffName: string,
  clinicId?: string
) {
  return createNotification({
    recipientId: doctorId,
    recipientRole: 'doctor',
    type: 'invite_accepted',
    title: `${staffName} انضم إلى العيادة`,
    body: 'تم قبول دعوة المساعد',
    clinicId,
  })
}

/** Notify clinic OWNER: a staff/patient phone-change request needs manual approval */
export function notifyPhoneChangePendingApproval(
  ownerUserId: string,
  subjectName: string,
  clinicId?: string
) {
  return createNotification({
    recipientId: ownerUserId,
    recipientRole: 'doctor',
    type: 'phone_change_pending_approval',
    title: 'طلب تغيير رقم جديد محتاج موافقتك',
    body: `${subjectName} طالب تغيير رقم. اضغط لمراجعة الطلب.`,
    clinicId,
  })
}

/** Notify subject: their phone change has been committed (post-commit confirmation) */
export function notifyPhoneChangeCompleted(
  subjectUserId: string,
  subjectRole: 'doctor' | 'frontdesk' | 'patient',
  maskedNewPhone: string,
  clinicId?: string
) {
  return createNotification({
    recipientId: subjectUserId,
    recipientRole: subjectRole,
    type: 'phone_change_completed',
    title: 'تم تغيير رقم الهاتف',
    body: `الرقم الجديد فعّال: ${maskedNewPhone}`,
    clinicId,
  })
}

/** Notify subject: clinic owner approved their phone-change fallback */
export function notifyPhoneChangeApproved(
  subjectUserId: string,
  subjectRole: 'doctor' | 'frontdesk' | 'patient',
  maskedNewPhone: string,
  clinicId?: string
) {
  return createNotification({
    recipientId: subjectUserId,
    recipientRole: subjectRole,
    type: 'phone_change_approved',
    title: 'تم الموافقة على طلب تغيير الرقم',
    body: `الرقم الجديد فعّال دلوقتي: ${maskedNewPhone}`,
    clinicId,
  })
}

/** Notify subject: clinic owner rejected their phone-change fallback (with reason) */
export function notifyPhoneChangeRejected(
  subjectUserId: string,
  subjectRole: 'doctor' | 'frontdesk' | 'patient',
  rejectionReason: string,
  clinicId?: string
) {
  return createNotification({
    recipientId: subjectUserId,
    recipientRole: subjectRole,
    type: 'phone_change_rejected',
    title: 'تم رفض طلب تغيير الرقم',
    body: `الرقم القديم هيفضل شغال. السبب: ${rejectionReason}`,
    clinicId,
  })
}
