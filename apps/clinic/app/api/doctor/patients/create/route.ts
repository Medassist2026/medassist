import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createWalkInPatient } from '@shared/lib/data/patients'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

function calcAgeFromDob(dateOfBirth?: string): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - dob.getFullYear()
  const monthDiff = today.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--
  }
  return Math.max(age, 0)
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const body = await request.json()

    // Accept both modal shape and canonical patient-create shape
    const name = body.name || body.fullName || body.full_name
    const phone = body.phone
    const sexRaw = body.gender || body.sex
    const ageRaw = body.age
    const dateOfBirth = body.date_of_birth || body.dateOfBirth

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    const normalizedSex = sexRaw
      ? String(sexRaw).toLowerCase() === 'male'
        ? 'Male'
        : String(sexRaw).toLowerCase() === 'female'
        ? 'Female'
        : String(sexRaw).toLowerCase() === 'other'
        ? 'Other'
        : null
      : null

    const numericAge =
      ageRaw !== undefined && ageRaw !== null && ageRaw !== ''
        ? Number(ageRaw)
        : calcAgeFromDob(dateOfBirth) ?? undefined

    // Resolve clinic_id from body or doctor's active membership
    let clinicId = body.clinicId || body.clinic_id || null
    if (!clinicId) {
      try {
        const admin = createAdminClient('patient-create-clinic')
        const { data: membership } = await admin
          .from('clinic_memberships')
          .select('clinic_id')
          .eq('user_id', user.id)
          .in('role', ['OWNER', 'DOCTOR'])
          .eq('status', 'ACTIVE')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        clinicId = membership?.clinic_id || null
      } catch {
        // Membership lookup failed — proceed without clinic_id
      }
    }

    const result = await createWalkInPatient(user.id, {
      phone,
      fullName: name.trim(),
      age: Number.isFinite(numericAge as number) ? (numericAge as number) : undefined,
      sex: (normalizedSex || undefined) as 'Male' | 'Female' | 'Other' | undefined,
      isDependent: body.isDependent ?? body.is_dependent ?? false,
      parentPhone: body.parentPhone || body.parent_phone || body.guardian_phone,
      clinicId: clinicId || undefined
    })

    const patient = result.patient
    if (!patient) {
      throw new Error('Patient creation returned no patient payload')
    }

    return NextResponse.json({
      success: true,
      patient: {
        id: patient.id,
        name: patient.full_name || name.trim(),
        phone: patient.phone,
        relationship_status: 'pending',
        is_walkin: patient.registered === false
      }
    })
  } catch (error: any) {
    console.error('Doctor patient create error:', error)
    return toApiErrorResponse(error, 'Failed to create patient')
  }
}
