export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { getFrontdeskClinicId, getClinicDoctorIds } from '@shared/lib/data/frontdesk-scope'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/frontdesk/doctors/fees
 *
 * Returns consultation fees for all doctors in the frontdesk's clinic.
 */
export async function GET() {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json({ doctors: [] })
    }

    const doctorIds = await getClinicDoctorIds(supabase as any, clinicId)
    if (doctorIds.length === 0) {
      return NextResponse.json({ doctors: [] })
    }

    const admin = createAdminClient('fee-lookup')
    const { data, error } = await admin
      .from('doctors')
      .select('id, full_name, consultation_fee_egp, followup_fee_egp, followup_window_days')
      .in('id', doctorIds)

    if (error) throw error

    return NextResponse.json({
      doctors: (data || []).map(d => ({
        id: d.id,
        full_name: d.full_name,
        consultation_fee_egp: d.consultation_fee_egp || 0,
        followup_fee_egp: d.followup_fee_egp || 0,
        followup_window_days: d.followup_window_days || 14,
      }))
    })
  } catch (error: any) {
    console.error('Fee fetch error:', error)
    return toApiErrorResponse(error, 'فشل تحميل رسوم الأطباء')
  }
}

/**
 * PATCH /api/frontdesk/doctors/fees
 *
 * Update consultation fees for a doctor in the frontdesk's clinic.
 * Body: { doctorId, consultation_fee_egp?, followup_fee_egp?, followup_window_days? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { doctorId, consultation_fee_egp, followup_fee_egp, followup_window_days } = body

    if (!doctorId) {
      return NextResponse.json({ error: 'معرّف الطبيب مطلوب' }, { status: 400 })
    }

    // Verify doctor belongs to this clinic
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json({ error: 'لا توجد عيادة مرتبطة' }, { status: 403 })
    }

    const doctorIds = await getClinicDoctorIds(supabase as any, clinicId)
    if (!doctorIds.includes(doctorId)) {
      return NextResponse.json({ error: 'الطبيب خارج نطاق العيادة' }, { status: 403 })
    }

    // Build updates
    const updates: Record<string, any> = {}

    if (consultation_fee_egp !== undefined) {
      const fee = Number(consultation_fee_egp)
      if (isNaN(fee) || fee < 0) {
        return NextResponse.json({ error: 'رسم الكشف يجب أن يكون رقم صحيح' }, { status: 400 })
      }
      updates.consultation_fee_egp = Math.round(fee)
    }

    if (followup_fee_egp !== undefined) {
      const fee = Number(followup_fee_egp)
      if (isNaN(fee) || fee < 0) {
        return NextResponse.json({ error: 'رسم المتابعة يجب أن يكون رقم صحيح' }, { status: 400 })
      }
      updates.followup_fee_egp = Math.round(fee)
    }

    if (followup_window_days !== undefined) {
      const days = Number(followup_window_days)
      if (isNaN(days) || days < 1 || days > 90) {
        return NextResponse.json({ error: 'فترة المتابعة يجب أن تكون بين ١ و ٩٠ يوم' }, { status: 400 })
      }
      updates.followup_window_days = Math.round(days)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'لا توجد تعديلات' }, { status: 400 })
    }

    const admin = createAdminClient('fee-update')
    const { error: updateError } = await admin
      .from('doctors')
      .update(updates)
      .eq('id', doctorId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, updates })
  } catch (error: any) {
    console.error('Fee update error:', error)
    return toApiErrorResponse(error, 'فشل تحديث رسوم الطبيب')
  }
}
