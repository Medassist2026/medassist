/**
 * Server-side clinic hours validation for appointments.
 * Checks if a requested appointment time falls within the doctor's working hours.
 */

import { SupabaseClient } from '@supabase/supabase-js'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

interface ClinicHoursValidationResult {
  isValid: boolean
  error?: string
  errorAr?: string
}

/**
 * Validate that an appointment falls within the doctor's working hours.
 *
 * @param supabase - Supabase client
 * @param doctorId - The doctor's user ID
 * @param startTime - ISO string of appointment start
 * @param durationMinutes - Duration in minutes
 * @returns Validation result with optional error messages
 */
export async function validateClinicHours(
  supabase: SupabaseClient,
  doctorId: string,
  startTime: string,
  durationMinutes: number
): Promise<ClinicHoursValidationResult> {
  try {
    const aptStart = new Date(startTime)
    const aptEnd = new Date(aptStart.getTime() + durationMinutes * 60_000)
    const dayOfWeek = aptStart.getDay() // 0 = Sunday

    // Fetch doctor's availability for this day
    const { data: slots, error } = await supabase
      .from('doctor_availability')
      .select('day_of_week, start_time, end_time, is_active')
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek)

    if (error) {
      // Non-blocking: if we can't fetch availability, allow the appointment
      console.warn('Could not fetch doctor availability:', error)
      return { isValid: true }
    }

    // If no availability rows at all for this doctor, they haven't set hours yet — allow
    if (!slots || slots.length === 0) {
      // Check if doctor has ANY availability rows (maybe they just don't work this day)
      const { data: anySlots } = await supabase
        .from('doctor_availability')
        .select('day_of_week')
        .eq('doctor_id', doctorId)
        .limit(1)

      // No rows at all = default schedule, allow
      if (!anySlots || anySlots.length === 0) {
        return { isValid: true }
      }

      // Has rows for other days but NOT this day = doctor doesn't work this day
      const dayName = DAYS[dayOfWeek]
      const dayNameAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][dayOfWeek]
      return {
        isValid: false,
        error: `Doctor does not work on ${dayName}`,
        errorAr: `الطبيب لا يعمل يوم ${dayNameAr}`
      }
    }

    // Check active slots only
    const activeSlots = slots.filter(s => s.is_active !== false)
    if (activeSlots.length === 0) {
      const dayNameAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][dayOfWeek]
      return {
        isValid: false,
        error: `Doctor is not available on this day`,
        errorAr: `الطبيب غير متاح يوم ${dayNameAr}`
      }
    }

    // Extract hours and minutes from appointment
    const aptStartHHMM = aptStart.getHours() * 60 + aptStart.getMinutes()
    const aptEndHHMM = aptEnd.getHours() * 60 + aptEnd.getMinutes()

    // Check if appointment fits within any active slot
    const fitsInSlot = activeSlots.some(slot => {
      const [sh, sm] = slot.start_time.split(':').map(Number)
      const [eh, em] = slot.end_time.split(':').map(Number)
      const slotStart = sh * 60 + sm
      const slotEnd = eh * 60 + em

      return aptStartHHMM >= slotStart && aptEndHHMM <= slotEnd
    })

    if (!fitsInSlot) {
      // Build readable hours string
      const hoursStr = activeSlots
        .map(s => `${s.start_time.slice(0, 5)}-${s.end_time.slice(0, 5)}`)
        .join(', ')

      return {
        isValid: false,
        error: `Appointment is outside working hours (${hoursStr})`,
        errorAr: `الموعد خارج ساعات العمل (${hoursStr})`
      }
    }

    return { isValid: true }
  } catch (err) {
    // Non-blocking: if validation fails, allow the appointment
    console.warn('Clinic hours validation error:', err)
    return { isValid: true }
  }
}
