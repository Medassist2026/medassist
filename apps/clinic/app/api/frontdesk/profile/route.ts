export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'

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

    // Update users table (phone, email)
    const userUpdates: Record<string, any> = {}
    if (phone !== undefined) {
      const normalized = phone.replace(/[\s\-\(\)]/g, '')
      if (!normalized || normalized.length < 10) {
        errors.push('رقم الهاتف غير صحيح')
      } else {
        userUpdates.phone = normalized
      }
    }
    if (email !== undefined) {
      userUpdates.email = email?.trim() || null
    }

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
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join('. ') }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'تم تحديث الملف الشخصي' })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to update profile')
  }
}
