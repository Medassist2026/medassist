export const dynamic = 'force-dynamic'

import { requireApiAuth, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

/**
 * POST /api/clinic/join
 *
 * Unified join-clinic endpoint that works for ANY role (doctor, frontdesk, assistant).
 * Uses clinic_memberships as the primary membership store.
 *
 * Body: { inviteCode: string }
 *
 * The inviteCode is the rotating 7-char code shown in clinic settings.
 * Regenerating the code only prevents *new* joins via the old code — it does
 * NOT remove existing members.
 */
export async function POST(request: Request) {
  try {
    // Accept any authenticated user (not restricted to frontdesk)
    const user = await requireApiAuth()
    const { inviteCode } = await request.json()

    if (!inviteCode || inviteCode.trim().length < 4) {
      return NextResponse.json(
        { error: 'رمز الدعوة مطلوب' },
        { status: 400 }
      )
    }

    const admin = createAdminClient('clinic-join')

    // Normalize the invite code:
    // Remove spaces; ensure XXXX-XX format (add dash if user omitted it)
    const raw = inviteCode.replace(/\s/g, '').toUpperCase()
    const normalizedCode = raw.includes('-')
      ? raw
      : raw.length === 6
        ? `${raw.slice(0, 4)}-${raw.slice(4)}`
        : raw

    // Find clinic by invite_code (rotating code shared by the owner)
    const { data: clinic, error: findError } = await admin
      .from('clinics')
      .select('id, name, unique_id')
      .eq('invite_code', normalizedCode)
      .maybeSingle()

    if (findError || !clinic) {
      return NextResponse.json(
        { error: 'رمز الدعوة غير صحيح أو منتهي الصلاحية. تحقق من الرمز وحاول مجدداً.' },
        { status: 404 }
      )
    }

    // Determine role based on user's registered role
    let membershipRole: string
    if (user.role === 'doctor') {
      membershipRole = 'DOCTOR'
    } else if (user.role === 'frontdesk') {
      membershipRole = 'ASSISTANT'
    } else {
      return NextResponse.json(
        { error: 'Only doctors and frontdesk staff can join clinics' },
        { status: 403 }
      )
    }

    // Try clinic_memberships first (available if migration 018 has run)
    const { error: cmProbeError } = await admin
      .from('clinic_memberships')
      .select('id')
      .limit(0)

    const hasMembershipsTable = !cmProbeError

    if (hasMembershipsTable) {
      const { data: existingMembership } = await admin
        .from('clinic_memberships')
        .select('id, status, role')
        .eq('clinic_id', clinic.id)
        .eq('user_id', user.id)
        .maybeSingle()

      if (existingMembership) {
        if (existingMembership.status === 'ACTIVE') {
          return NextResponse.json(
            { error: 'You are already a member of this clinic' },
            { status: 409 }
          )
        }
        await admin
          .from('clinic_memberships')
          .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
          .eq('id', existingMembership.id)
        return NextResponse.json({ success: true, clinicId: clinic.id, clinicName: clinic.name, clinicUniqueId: clinic.unique_id, role: existingMembership.role })
      }

      const { error: membershipError } = await admin
        .from('clinic_memberships')
        .insert({ clinic_id: clinic.id, user_id: user.id, role: membershipRole, status: 'ACTIVE' })
      if (membershipError) throw new Error(membershipError.message)
    }

    // Note: legacy clinic_doctors / front_desk_staff.clinic_id writes were
    // removed once clinic_memberships became the canonical store (post mig
    // 045-051). The duplicate-check above (existing membership) covers the
    // 409 case that clinic_doctors was previously checking.

    // ── Notify the clinic owner ────────────────────────────────────────────
    // Fire-and-forget — a failure here must not block the join response.
    ;(async () => {
      try {
        // Find the OWNER of this clinic
        const { data: ownerRow } = await admin
          .from('clinic_memberships')
          .select('user_id')
          .eq('clinic_id', clinic.id)
          .eq('role', 'OWNER')
          .eq('status', 'ACTIVE')
          .limit(1)
          .maybeSingle()

        if (ownerRow?.user_id && ownerRow.user_id !== user.id) {
          const joinerName = user.phone || user.email || 'شخص جديد'
          const roleLabel  = membershipRole === 'DOCTOR' ? 'طبيب' : 'مساعد'
          await admin
            .from('notifications')
            .insert({
              recipient_id:   ownerRow.user_id,
              recipient_role: 'doctor',
              type:           'invite_accepted',
              title:          `${roleLabel} جديد انضم للعيادة`,
              body:           `${joinerName} انضم إلى ${clinic.name} كـ${roleLabel}.`,
              clinic_id:      clinic.id,
              read:           false,
            })
        }
      } catch {
        // Notification failure is non-fatal
      }
    })()
    // ─────────────────────────────────────────────────────────────────────────

    // Determine redirect path
    const redirectPath = user.role === 'doctor' ? '/doctor/dashboard' : '/frontdesk/dashboard'

    return NextResponse.json({
      success: true,
      clinicId: clinic.id,
      clinicName: clinic.name,
      clinicUniqueId: clinic.unique_id,
      role: membershipRole,
      redirectPath,
    })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to join clinic')
  }
}
