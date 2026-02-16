import { createWalkInPatient } from '@/lib/data/patients'
import { requireRole } from '@/lib/auth/session'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    // Verify doctor is logged in
    const user = await requireRole('doctor')
    
    const body = await request.json()
    const phone = body.phone
    const fullName = body.fullName || body.full_name
    const isDependent = body.isDependent ?? body.is_dependent
    const parentPhone = body.parentPhone || body.parent_phone || body.guardian_phone
    const dateOfBirth = body.dateOfBirth || body.date_of_birth
    const rawSex = body.sex || body.gender

    const sex =
      rawSex && String(rawSex).toLowerCase() === 'male'
        ? 'Male'
        : rawSex && String(rawSex).toLowerCase() === 'female'
        ? 'Female'
        : rawSex && String(rawSex).toLowerCase() === 'other'
        ? 'Other'
        : undefined

    let age: number | undefined
    if (body.age !== undefined && body.age !== null && body.age !== '') {
      const parsedAge = parseInt(body.age, 10)
      if (!Number.isNaN(parsedAge)) {
        age = parsedAge
      }
    } else if (dateOfBirth) {
      const dob = new Date(dateOfBirth)
      if (!Number.isNaN(dob.getTime())) {
        const now = new Date()
        let derivedAge = now.getFullYear() - dob.getFullYear()
        const m = now.getMonth() - dob.getMonth()
        if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
          derivedAge--
        }
        age = Math.max(derivedAge, 0)
      }
    }
    
    // Validate required fields
    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }
    
    if (!fullName || fullName.trim().length < 2) {
      return NextResponse.json(
        { error: 'Full name is required (at least 2 characters)' },
        { status: 400 }
      )
    }
    
    // Validate dependent logic
    if (isDependent && !parentPhone) {
      return NextResponse.json(
        { error: 'Parent phone number is required for dependent patients' },
        { status: 400 }
      )
    }
    
    // Get doctor ID from user
    const supabase = await (await import('@/lib/supabase/server')).createClient()
    const { data: doctorData } = await supabase
      .from('doctors')
      .select('id')
      .eq('id', user.id)
      .single()
    
    if (!doctorData) {
      return NextResponse.json(
        { error: 'Doctor profile not found' },
        { status: 404 }
      )
    }
    
    const result = await createWalkInPatient(doctorData.id, {
      phone,
      fullName,
      age,
      sex,
      isDependent,
      parentPhone
    })

    if (!result.patient) {
      throw new Error('Failed to create patient record')
    }
    
    return NextResponse.json({
      success: true,
      patient: result.patient
    })
    
  } catch (error: any) {
    console.error('Create patient error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create patient' },
      { status: 500 }
    )
  }
}
