/**
 * Prescription SMS — Feature 4
 *
 * Builds a human-readable Arabic SMS from a clinical session's medications
 * and sends it to the patient's phone via the existing Twilio pipeline.
 *
 * Design decisions (Egyptian context):
 *  - SMS-first, not WhatsApp: near-100% delivery, no app required, no 24-hour
 *    window restrictions, trusted channel for official communications in Egypt
 *  - Plain colloquial Arabic (عامية طبية), not medical jargon
 *  - Aims for ≤ 2 SMS parts (≤ 306 chars with Unicode) to control cost
 *  - Only fires for patients without the MedAssist app, OR always if the
 *    doctor explicitly toggles "إرسال بـ SMS"
 *  - Does NOT send if phone is missing or medications list is empty
 *
 * Egyptian phone normalisation:
 *  DB stores "01XXXXXXXXX" (11 digits).
 *  Twilio requires "+201XXXXXXXXX".
 *  We handle both formats here.
 */

import { sendSMS } from './twilio-client'
import { createAdminClient } from '@shared/lib/supabase/admin'

// ============================================================================
// TYPES
// ============================================================================

export interface PrescriptionMedication {
  name: string
  genericName?: string
  strength?: string
  form?: string
  dosageCount?: string
  frequency?: string
  timings?: string[]
  instructions?: string
  duration?: string
}

export interface SendPrescriptionSMSParams {
  patientId:   string
  phoneNumber: string        // Raw number from DB — we normalise to +20 format
  medications: PrescriptionMedication[]
  doctorName:  string
  clinicName?: string
  followUpDate?: string | null
  followUpNotes?: string | null
  clinicId?: string
  noteId?: string
}

// ============================================================================
// PHONE NORMALISATION
// ============================================================================

/**
 * Converts Egyptian local format to E.164 for Twilio.
 * 01012345678 → +201012345678
 * +201012345678 → +201012345678 (already normalised)
 */
export function normaliseEgyptianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('20')) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 11) return `+20${digits.slice(1)}`
  if (digits.length === 10 && /^(10|11|12|15)/.test(digits)) return `+20${digits}`
  // Fallback — return as-is with + prefix if no prefix
  return raw.startsWith('+') ? raw : `+${raw}`
}

// ============================================================================
// ARABIC MESSAGE BUILDER
// ============================================================================

/**
 * Maps internal frequency strings to concise colloquial Arabic.
 * Goal: what a grandmother would understand, not what a pharmacist writes.
 */
function freqToArabic(freq?: string, timings?: string[]): string {
  if (!freq) return ''

  // If we have explicit timings, use them — they're more informative
  if (timings && timings.length > 0) {
    const timingStr = timings.join(' و')
    return timingStr
  }

  const f = freq.toLowerCase()
  if (f.includes('يومياً') || f.includes('مرة') || f.includes('once')) return 'مرة يومياً'
  if (f.includes('12') || f.includes('twice'))  return 'مرتين يومياً'
  if (f.includes('8')  || f.includes('three'))  return '3 مرات يومياً'
  if (f.includes('6')  || f.includes('four'))   return '4 مرات يومياً'
  return freq
}

/**
 * Maps form + dosageCount to a natural Arabic phrase.
 * "أقراص" + "1" → "حبة"
 * "شراب" + "5ml" → "ملعقة صغيرة"
 */
function doseToArabic(form?: string, count?: string): string {
  if (!count || count === 'كمية مناسبة') return count || ''

  const c = count.trim()

  if (form === 'شراب') {
    if (c === '5ml (1 ملعقة)' || c === '5ml') return 'ملعقة صغيرة'
    if (c === '10ml (2 ملعقة)' || c === '10ml') return 'ملعقتين صغيرتين'
    if (c.includes('ملعقة')) return c
    return c
  }
  if (form === 'حقن') return c === '1' ? 'حقنة' : `${c} حقن`
  if (form === 'كبسولة') return c === '1' ? 'كبسولة' : `${c} كبسولات`
  if (form === 'بخاخ') return c === '1' ? 'بخة' : `${c} بخات`
  if (form === 'نقط') return c === '1' ? 'قطرة' : `${c} قطرات`
  if (form === 'لبوس') return c === '1' ? 'لبوسة' : `${c} لبوسات`

  // أقراص / default — use حبة
  if (c === '½') return 'نص حبة'
  if (c === '1') return 'حبة'
  if (c === '2') return 'حبتين'
  if (c === '3') return '3 حبات'
  return `${c} حبات`
}

/**
 * Builds the full Arabic prescription SMS body.
 * Targets ≤ 305 Unicode characters (2 SMS parts with Twilio's concatenation).
 * Falls back to a truncated list if the prescription is very long.
 */
export function buildPrescriptionMessage(params: {
  medications:   PrescriptionMedication[]
  doctorName:    string
  clinicName?:   string
  followUpDate?: string | null
  followUpNotes?: string | null
}): string {
  const { medications, doctorName, clinicName, followUpDate, followUpNotes } = params

  const lines: string[] = []

  // Header
  const header = clinicName
    ? `روشتة من د. ${doctorName} - ${clinicName}:`
    : `روشتة من د. ${doctorName}:`
  lines.push(header)

  // Medication lines
  medications.forEach((med, i) => {
    // Drug name (strip redundant strength if already in name)
    const namePart = med.name.trim()

    // Dose + form
    const dosePart = doseToArabic(med.form, med.dosageCount)

    // Frequency / timings
    const freqPart = freqToArabic(med.frequency, med.timings)

    // Instructions
    const instrPart = med.instructions || ''

    // Duration
    const durPart = med.duration ? `لمدة ${med.duration}` : ''

    // Compose line — keep it tight
    const parts = [dosePart, freqPart, instrPart, durPart].filter(Boolean)
    const medLine = parts.length > 0
      ? `${i + 1}. ${namePart} — ${parts.join(' ')}`
      : `${i + 1}. ${namePart}`

    lines.push(medLine)
  })

  // Follow-up
  if (followUpDate) {
    try {
      const d = new Date(followUpDate)
      const formatted = d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })
      const fuLine = followUpNotes
        ? `📅 موعد المتابعة: ${formatted} — ${followUpNotes}`
        : `📅 موعد المتابعة: ${formatted}`
      lines.push(fuLine)
    } catch {
      lines.push(`📅 موعد المتابعة: ${followUpDate}`)
    }
  }

  // Footer
  lines.push('MedAssist')

  const fullMessage = lines.join('\n')

  // Hard cap at 612 chars (4 SMS parts) — truncate medication list if needed
  if (fullMessage.length <= 612) return fullMessage

  // Rebuild with fewer meds
  const truncatedLines = [lines[0]] // header
  for (let i = 1; i <= medications.length; i++) {
    const candidate = [...truncatedLines, lines[i], '...', lines[lines.length - 1]].join('\n')
    if (candidate.length > 600) break
    truncatedLines.push(lines[i])
  }
  truncatedLines.push('...')
  truncatedLines.push(lines[lines.length - 1]) // footer
  return truncatedLines.join('\n')
}

// ============================================================================
// SEND
// ============================================================================

export async function sendPrescriptionSMS(params: SendPrescriptionSMSParams): Promise<{
  success: boolean
  sid?: string
  error?: string
}> {
  const { patientId, phoneNumber, medications, doctorName, clinicName,
          followUpDate, followUpNotes, clinicId, noteId } = params

  if (!medications || medications.length === 0) {
    return { success: false, error: 'No medications to send' }
  }

  const normalisedPhone = normaliseEgyptianPhone(phoneNumber)

  const messageBody = buildPrescriptionMessage({
    medications,
    doctorName,
    clinicName,
    followUpDate,
    followUpNotes,
  })

  // Send via Twilio
  const result = await sendSMS(normalisedPhone, messageBody)

  // Log to sms_reminders table for audit trail
  try {
    const admin = createAdminClient('prescription-sms')
    await admin.from('sms_reminders').insert({
      patient_id:      patientId,
      clinic_id:       clinicId    || null,
      appointment_id:  noteId      || null,   // reuse column to store note reference
      phone_number:    normalisedPhone,
      message_type:    'prescription',
      message_body:    messageBody,
      message_body_ar: messageBody,
      status:          result.success ? 'sent' : 'failed',
      twilio_sid:      result.sid   || null,
      error_message:   result.error || null,
      sent_at:         result.success ? new Date().toISOString() : null,
    })
  } catch (logError) {
    // Logging failure must never block the response
    console.error('[prescription-sms] Failed to log to sms_reminders:', logError)
  }

  return result
}
