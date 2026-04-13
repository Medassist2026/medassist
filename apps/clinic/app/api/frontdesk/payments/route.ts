export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { getFrontdeskClinicId, getClinicDoctorIds } from '@shared/lib/data/frontdesk-scope'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/frontdesk/payments
 *
 * Fetch payments for frontdesk's clinic.
 * Query params:
 *   range: 'today' | 'yesterday' | 'week' (default: today)
 *   method: 'cash' | 'card' | 'insurance' | 'transfer' | 'other' (optional filter)
 *   doctorId: string (optional filter)
 *   page: number (default: 1)
 *   limit: number (default: 50, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || 'today'
    const rawMethodFilter = searchParams.get('method')
    // FD-018: validate method filter against allowed values
    const ALLOWED_METHODS = ['cash', 'card', 'insurance', 'transfer', 'other']
    const methodFilter = rawMethodFilter && ALLOWED_METHODS.includes(rawMethodFilter) ? rawMethodFilter : null
    const doctorFilter = searchParams.get('doctorId')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))

    // Get clinic scope
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json({ payments: [], totals: { total: 0, count: 0, by_method: {} } })
    }

    const doctorIds = await getClinicDoctorIds(supabase as any, clinicId)
    if (doctorIds.length === 0) {
      return NextResponse.json({ payments: [], totals: { total: 0, count: 0, by_method: {} } })
    }

    // Calculate date range
    const now = new Date()
    let dateFrom: Date
    let dateTo: Date

    if (range === 'yesterday') {
      dateFrom = new Date(now)
      dateFrom.setDate(dateFrom.getDate() - 1)
      dateFrom.setHours(0, 0, 0, 0)
      dateTo = new Date(now)
      dateTo.setDate(dateTo.getDate() - 1)
      dateTo.setHours(23, 59, 59, 999)
    } else if (range === 'week') {
      // Start of current week (Saturday in Egypt)
      const dayOfWeek = now.getDay() // 0=Sun … 6=Sat
      const daysSinceSaturday = (dayOfWeek + 1) % 7 // Sat=0, Sun=1, …, Fri=6
      dateFrom = new Date(now)
      dateFrom.setDate(dateFrom.getDate() - daysSinceSaturday)
      dateFrom.setHours(0, 0, 0, 0)
      dateTo = new Date(now)
      dateTo.setHours(23, 59, 59, 999)
    } else {
      // today (default)
      dateFrom = new Date(now)
      dateFrom.setHours(0, 0, 0, 0)
      dateTo = new Date(now)
      dateTo.setHours(23, 59, 59, 999)
    }

    // Build query with pagination
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
      .from('payments')
      .select('id, patient_id, doctor_id, amount, payment_method, payment_status, notes, created_at, appointment_id', { count: 'exact' })
      .in('doctor_id', doctorFilter ? [doctorFilter] : doctorIds)
      .gte('created_at', dateFrom.toISOString())
      .lte('created_at', dateTo.toISOString())
      .order('created_at', { ascending: false })
      .range(from, to)

    if (methodFilter) {
      query = query.eq('payment_method', methodFilter)
    }

    const { data: payments, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    const list = payments || []
    const total = count ?? list.length

    // Fetch patient names
    const patientIds = [...new Set(list.map(p => p.patient_id).filter(Boolean))]
    let patientsMap: Record<string, string> = {}
    if (patientIds.length > 0) {
      const { data: patients } = await supabase
        .from('patients')
        .select('id, full_name')
        .in('id', patientIds)
      if (patients) {
        patientsMap = Object.fromEntries(patients.map(p => [p.id, p.full_name || 'مريض']))
      }
    }

    // Fetch doctor names
    const docIds = [...new Set(list.map(p => p.doctor_id).filter(Boolean))]
    let doctorsMap: Record<string, string> = {}
    if (docIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', docIds)
      if (users) {
        doctorsMap = Object.fromEntries(users.map(u => [u.id, u.full_name || 'طبيب']))
      }
    }

    // Calculate totals
    const totalAmount = list.reduce((s, p) => s + Number(p.amount ?? 0), 0)
    const byMethod: Record<string, number> = {}
    list.forEach(p => {
      const method = p.payment_method || 'other'
      byMethod[method] = (byMethod[method] || 0) + Number(p.amount)
    })

    // Enrich payments with names
    const enriched = list.map(p => ({
      ...p,
      patient: { full_name: patientsMap[p.patient_id] || null },
      doctor: { full_name: doctorsMap[p.doctor_id] || null }
    }))

    return NextResponse.json({
      payments: enriched,
      totals: {
        total: totalAmount,
        count: total,
        by_method: byMethod
      },
      pagination: {
        page,
        limit,
        total,
        hasMore: from + list.length < total,
      },
      // Doctor name list — used only for the filter dropdown on the payments list page.
      // This contains no revenue data; per-doctor revenue aggregation is not exposed.
      doctors: docIds.map(id => ({ id, full_name: doctorsMap[id] || 'طبيب' }))
    })

  } catch (error: any) {
    console.error('Payments fetch error:', error)
    return toApiErrorResponse(error, 'Failed to load payments')
  }
}
