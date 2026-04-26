export const dynamic = 'force-dynamic'

/**
 * SECURITY NOTE — Phase A patch (2026-04-25):
 * The PATCH handler below writes users.phone WITHOUT OTP verification. Until the
 * Phase B dual-OTP flow ships behind FEATURE_PHONE_CHANGE_V2 (new endpoint
 * /api/auth/change-phone/*, see docs/PHONE_CHANGE_PLAN.md §5), this is the only
 * staff phone-change path. Phase A's job is to close the bleeding gaps:
 *   1) Server-side validation via the canonical Egyptian-phone regex (D-046).
 *   2) Audit log entry on every successful phone change.
 * Both are defenses-in-depth, not a substitute for OTP. A `pathway` marker
 * 'phase_a_legacy_no_otp' is written into audit metadata so we can find these
 * records after the Phase B cutover. Per §9.1 of the plan, this branch is
 * scheduled to be removed 30 days after FEATURE_PHONE_CHANGE_V2 goes live.
 *
 * NOTE on storage format: Phase A intentionally DOES NOT canonicalize the
 * stored phone format. Production currently has 170/288 users stored in the
 * local 11-digit `01XXXXXXXXX` form, and the login handler's phone regex
 * /^\+2001[0125][0-9]{8}$/ uses yet another shape. Storage canonicalization
 * is part of TD-009 and is out of scope for Phase A. We validate the input
 * strictly via getEgyptianPhoneError (which expects local 11-digit form, the
 * same format the existing client submits via normalizeEgyptianDigits) and
 * write back the cleaned input — preserving the predominant storage format.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import {
  getEgyptianPhoneError,
  normalizeEgyptianDigits,
} from '@shared/lib/utils/phone-validation'
import { logAuditEvent } from '@shared/lib/data/audit'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'

// ============================================================================
// GET /api/frontdesk/profile — Get frontdesk user profile + memberships
// ============================================================================

export async function GET() {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = createAdminClient('frontdesk-profile')

    // Fetch user data + front_desk_staff + all memberships with clinic info
    const [userResult, staffResult, membershipsResult] = await Promise.all([
      supabase
        .from('users')
        .select('id, phone, email, role, created_at')
        .eq('id', user.id)
        .single(),
      supabase
        .from('front_desk_staff')
        .select('full_name, unique_id')
        .eq('id', user.id)
        .single(),
      supabase
        .from('clinic_memberships')
        .select('id, clinic_id, role, status, created_at, clinics(id, name, unique_id)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    if (userResult.error || !userResult.data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const profile = {
      id: userResult.data.id,
      phone: userResult.data.phone,
      email: userResult.data.email,
      fullName: staffResult.data?.full_name || '',
      uniqueId: staffResult.data?.unique_id || '',
      role: userResult.data.role,
      createdAt: userResult.data.created_at,
      memberships: (membershipsResult.data || []).map((m: any) => ({
        id: m.id,
        clinicId: m.clinic_id,
        role: m.role,
        status: m.status,
        createdAt: m.created_at,
        clinic: m.clinics ? {
          id: m.clinics.id,
          name: m.clinics.name,
          uniqueId: m.clinics.unique_id,
        } : null,
      })),
    }

    return NextResponse.json(profile)
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch profile')
  }
}

// ============================================================================
// PATCH /api/frontdesk/profile — Update frontdesk user profile
// ============================================================================

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireApiRole('frontdesk')
    const body = await request.json()
    const { fullName, phone, email } = body

    const supabase = createAdminClient('frontdesk-profile-update')

    // Validate at least one field
    if (!fullName && !phone && email === undefined) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const errors: string[] = []

    // Update front_desk_staff (full_name)
    if (fullName !== undefined) {
      if (!fullName || fullName.trim().length < 2) {
        errors.push('الاسم لازم يكون على الأقل حرفين')
      } else {
        const { error } = await supabase
          .from('front_desk_staff')
          .update({ full_name: fullName.trim() })
          .eq('id', user.id)

        if (error) errors.push('فشل تحديث الاسم')
      }
    }

    // ── Capture current phone BEFORE update so we can include it in the
    //    audit metadata if the phone is being changed. Defensive: if the row
    //    is missing for some reason (race during account deletion), skip the
    //    audit but still allow the update to attempt.
    let currentPhone: string | null = null
    if (phone !== undefined) {
      const { data: pre } = await supabase
        .from('users')
        .select('phone')
        .eq('id', user.id)
        .maybeSingle()
      currentPhone = pre?.phone ?? null
    }

    // Update users table (phone, email)
    const userUpdates: Record<string, any> = {}
    if (phone !== undefined) {
      // Defensive: re-normalize on the server even though the client should
      // already have done this via normalizeEgyptianDigits (D-046).
      const cleaned = normalizeEgyptianDigits(String(phone))
      const phoneError = getEgyptianPhoneError(cleaned)
      if (phoneError) {
        errors.push(phoneError)
      } else {
        // Storage shape preserved: write back the cleaned 11-digit local form.
        // See file-top SECURITY NOTE for why we don't canonicalize to E.164 here.
        userUpdates.phone = cleaned
      }
    }
    if (email !== undefined) {
      userUpdates.email = email?.trim() || null
    }

    let phoneActuallyChanged = false
    if (Object.keys(userUpdates).length > 0 && errors.length === 0) {
      const { error } = await supabase
        .from('users')
        .update(userUpdates)
        .eq('id', user.id)

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          errors.push('رقم الهاتف مستخدم من حساب آخر')
        } else {
          errors.push('فشل تحديث البيانات')
        }
      } else if (
        userUpdates.phone &&
        currentPhone !== null &&
        currentPhone !== userUpdates.phone
      ) {
        phoneActuallyChanged = true
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 })
    }

    // ── Audit-log a phone change (fire-and-forget; never blocks the response).
    //    Uses the typed AuditAction enum so an OWNER can see this in the
    //    existing /api/clinic/audit-log UI. Action and metadata pathway match
    //    the Phase B contract so post-cutover queries can union both pathways.
    if (phoneActuallyChanged) {
      const clinicId = await getFrontdeskClinicId(supabase, user.id).catch(
        () => null
      )
      void logAuditEvent({
        clinicId: clinicId || undefined,
        actorUserId: user.id,
        action: 'CHANGE_PHONE_COMMITTED',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          old_phone: currentPhone,
          new_phone: userUpdates.phone,
          actor_role: 'frontdesk',
          pathway: 'phase_a_legacy_no_otp',
        },
      })
    }

    return NextResponse.json({ success: true, message: 'تم تحديث الملف الشخصي' })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to update profile')
  }
}
