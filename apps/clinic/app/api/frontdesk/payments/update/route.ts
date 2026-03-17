export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { getFrontdeskClinicId, getClinicDoctorIds } from '@shared/lib/data/frontdesk-scope'
import { NextRequest, NextResponse } from 'next/server'
import type { PaymentStatus } from '@shared/lib/data/frontdesk'

/**
 * PATCH /api/frontdesk/payments/update
 *
 * Edit or void a payment. Only same-day payments can be modified.
 * Body: { paymentId, action: 'void' | 'edit', amount?, paymentMethod?, notes? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()

    const body = await request.json()
    const { paymentId, action, amount, paymentMethod, notes } = body

    if (!paymentId || !action) {
      return NextResponse.json(
        { error: 'معرّف الدفع والإجراء مطلوبان' },
        { status: 400 }
      )
    }

    if (!['void', 'edit'].includes(action)) {
      return NextResponse.json(
        { error: 'إجراء غير صالح — استخدم void أو edit' },
        { status: 400 }
      )
    }

    // ── Scope check: payment must belong to clinic's doctors ──
    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json(
        { error: 'لا توجد عيادة مرتبطة' },
        { status: 403 }
      )
    }

    const doctorIds = await getClinicDoctorIds(supabase as any, clinicId)

    // ── Fetch existing payment ──
    const { data: existing, error: fetchError } = await supabase
      .from('payments')
      .select('id, doctor_id, payment_status, created_at, amount, payment_method, notes')
      .eq('id', paymentId)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'الدفعة غير موجودة' },
        { status: 404 }
      )
    }

    // Verify clinic scope
    if (!doctorIds.includes(existing.doctor_id)) {
      return NextResponse.json(
        { error: 'ليس لديك صلاحية على هذه الدفعة' },
        { status: 403 }
      )
    }

    // ── Same-day restriction ──
    const paymentDate = new Date(existing.created_at)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (paymentDate < today || paymentDate >= tomorrow) {
      return NextResponse.json(
        { error: 'لا يمكن تعديل دفعات الأيام السابقة' },
        { status: 400 }
      )
    }

    // Already voided?
    if (existing.payment_status === 'cancelled' || existing.payment_status === 'refunded') {
      return NextResponse.json(
        { error: 'هذه الدفعة ملغية بالفعل' },
        { status: 400 }
      )
    }

    // ── Execute action ──
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (action === 'void') {
      updates.payment_status = 'cancelled' as PaymentStatus
      updates.notes = [existing.notes, `[ملغي بواسطة ${user.id}]`].filter(Boolean).join(' | ')
    } else if (action === 'edit') {
      // At least one field must change
      if (amount === undefined && !paymentMethod && notes === undefined) {
        return NextResponse.json(
          { error: 'لا توجد تعديلات' },
          { status: 400 }
        )
      }

      if (amount !== undefined) {
        if (typeof amount !== 'number' || amount <= 0) {
          return NextResponse.json(
            { error: 'المبلغ يجب أن يكون رقم موجب' },
            { status: 400 }
          )
        }
        updates.amount = amount
      }

      if (paymentMethod) {
        const validMethods = ['cash', 'card', 'insurance', 'transfer', 'other']
        if (!validMethods.includes(paymentMethod)) {
          return NextResponse.json(
            { error: 'طريقة دفع غير صالحة' },
            { status: 400 }
          )
        }
        updates.payment_method = paymentMethod
      }

      if (notes !== undefined) {
        updates.notes = notes || null
      }
    }

    // ── Optimistic locking: only update if status hasn't changed since we read it ──
    const { data: updated, error: updateError } = await supabase
      .from('payments')
      .update(updates)
      .eq('id', paymentId)
      .eq('payment_status', existing.payment_status) // prevents concurrent modification
      .select()
      .single()

    if (updateError || !updated) {
      // If no row matched, another request modified this payment concurrently
      return NextResponse.json(
        { error: 'تم تعديل هذه الدفعة من مستخدم آخر — أعد تحميل الصفحة' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      payment: updated,
      action,
    })

  } catch (error: any) {
    console.error('Payment update error:', error)
    return toApiErrorResponse(error, 'فشل تعديل الدفعة')
  }
}
