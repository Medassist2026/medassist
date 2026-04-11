export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { getClinicContext } from '@shared/lib/data/clinic-context'
import { generateUniqueInviteCode } from '@shared/lib/utils/invite-code'
import { NextResponse } from 'next/server'

/**
 * GET: Get current invite code for the doctor's active clinic
 */
export async function GET() {
  try {
    const user = await requireApiRole('doctor')
    const context = await getClinicContext(user.id, 'doctor')

    if (!context?.clinic) {
      return NextResponse.json({ error: 'لا توجد عيادة' }, { status: 404 })
    }

    const admin = createAdminClient('invite-code-get')
    const { data: clinic } = await admin
      .from('clinics')
      .select('invite_code')
      .eq('id', context.clinic.id)
      .single()

    // If no invite code yet, generate one and persist it
    if (!clinic?.invite_code) {
      const code = await generateUniqueInviteCode()
      const { error: updateError } = await admin
        .from('clinics')
        .update({ invite_code: code })
        .eq('id', context.clinic.id)

      if (updateError) {
        console.error('[invite-code] Failed to persist invite code:', updateError)
        return NextResponse.json(
          { error: 'فشل في حفظ رمز الدعوة — تأكد من تطبيق migration 034' },
          { status: 500 }
        )
      }

      return NextResponse.json({ inviteCode: code })
    }

    return NextResponse.json({ inviteCode: clinic.invite_code })
  } catch (error: any) {
    return toApiErrorResponse(error, 'فشل في جلب رمز الدعوة')
  }
}

/**
 * POST: Regenerate invite code
 */
export async function POST() {
  try {
    const user = await requireApiRole('doctor')
    const context = await getClinicContext(user.id, 'doctor')

    if (!context?.clinic) {
      return NextResponse.json({ error: 'لا توجد عيادة' }, { status: 404 })
    }

    const admin = createAdminClient('invite-code-regen')
    const code = await generateUniqueInviteCode()

    const { error } = await admin
      .from('clinics')
      .update({ invite_code: code })
      .eq('id', context.clinic.id)

    if (error) {
      return NextResponse.json({ error: 'فشل في تجديد رمز الدعوة' }, { status: 500 })
    }

    return NextResponse.json({ inviteCode: code })
  } catch (error: any) {
    return toApiErrorResponse(error, 'فشل في تجديد رمز الدعوة')
  }
}
