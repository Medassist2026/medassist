export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@shared/lib/supabase/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
type DayKey = (typeof DAYS)[number]

function defaultAvailability() {
  return {
    sunday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
    monday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
    tuesday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
    wednesday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
    thursday: { enabled: true, slots: [{ start: '09:00', end: '17:00' }] },
    friday: { enabled: false, slots: [] as Array<{ start: string; end: string }> },
    saturday: { enabled: false, slots: [] as Array<{ start: string; end: string }> }
  }
}

function toHm(timeValue: string | null): string {
  if (!timeValue) return '00:00'
  return timeValue.slice(0, 5)
}

function toWeeklyAvailability(rows: any[]) {
  const weekly = DAYS.reduce((acc, day) => {
    acc[day] = { enabled: false, slots: [] as Array<{ start: string; end: string }> }
    return acc
  }, {} as Record<DayKey, { enabled: boolean; slots: Array<{ start: string; end: string }> }>)

  rows.forEach((row) => {
    const day = DAYS[row.day_of_week as number]
    if (!day) return
    weekly[day].enabled = row.is_active !== false
    weekly[day].slots.push({
      start: toHm(row.start_time),
      end: toHm(row.end_time)
    })
  })

  // Ensure deterministic ordering
  DAYS.forEach((day) => {
    weekly[day].slots.sort((a, b) => a.start.localeCompare(b.start))
  })

  return weekly
}

// ============================================================================
// GET /api/doctor/availability
// ============================================================================

export async function GET(_request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('doctor_availability')
      .select('day_of_week, start_time, end_time, is_active')
      .eq('doctor_id', user.id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching availability:', error)
      return NextResponse.json(
        { error: 'Failed to fetch availability' },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        availability: defaultAvailability(),
        isDefault: true
      })
    }

    return NextResponse.json({
      availability: toWeeklyAvailability(data),
      isDefault: false
    })
  } catch (error) {
    console.error('Availability fetch error:', error)
    return toApiErrorResponse(error, 'Failed to fetch availability')
  }
}

// ============================================================================
// POST /api/doctor/availability
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiRole('doctor')
    const supabase = await createClient()

    const body = await request.json()
    const { availability } = body

    if (!availability) {
      return NextResponse.json(
        { error: 'Availability data required' },
        { status: 400 }
      )
    }

    // Validate + flatten to row-based schema
    const rows: Array<{
      doctor_id: string
      day_of_week: number
      start_time: string
      end_time: string
      slot_duration_minutes: number
      is_active: boolean
    }> = []

    for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex++) {
      const day = DAYS[dayIndex]
      const dayValue = availability[day]

      if (!dayValue || typeof dayValue.enabled !== 'boolean' || !Array.isArray(dayValue.slots)) {
        return NextResponse.json(
          { error: `Invalid availability format for ${day}` },
          { status: 400 }
        )
      }

      if (!dayValue.enabled || dayValue.slots.length === 0) continue

      for (const slot of dayValue.slots) {
        if (!slot.start || !slot.end) {
          return NextResponse.json(
            { error: `Invalid time slot for ${day}` },
            { status: 400 }
          )
        }

        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
        if (!timeRegex.test(slot.start) || !timeRegex.test(slot.end)) {
          return NextResponse.json(
            { error: `Invalid time format for ${day}` },
            { status: 400 }
          )
        }

        rows.push({
          doctor_id: user.id,
          day_of_week: dayIndex,
          start_time: `${slot.start}:00`,
          end_time: `${slot.end}:00`,
          slot_duration_minutes: 15,
          is_active: true
        })
      }
    }

    // Replace all doctor rows with submitted state.
    const { error: deleteError } = await supabase
      .from('doctor_availability')
      .delete()
      .eq('doctor_id', user.id)

    if (deleteError) {
      console.error('Error clearing availability:', deleteError)
      return NextResponse.json(
        { error: 'Failed to save availability' },
        { status: 500 }
      )
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('doctor_availability')
        .insert(rows)

      if (insertError) {
        console.error('Error saving availability:', insertError)
        return NextResponse.json(
          { error: 'Failed to save availability' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
      availability
    })
  } catch (error) {
    console.error('Availability save error:', error)
    return toApiErrorResponse(error, 'Failed to save availability')
  }
}
