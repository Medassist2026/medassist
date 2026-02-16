import { requireRole } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const user = await requireRole('doctor')
    const { patient_id } = await request.json()

    if (!patient_id) {
      return NextResponse.json(
        { error: 'patient_id is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: existing, error: existingError } = await supabase
      .from('doctor_patient_relationships')
      .select('id')
      .eq('doctor_id', user.id)
      .eq('patient_id', patient_id)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existing) {
      return NextResponse.json({ success: true, alreadyExists: true })
    }

    // Try current schema first.
    let insertError: any = null
    const { error: newSchemaError } = await supabase
      .from('doctor_patient_relationships')
      .insert({
        doctor_id: user.id,
        patient_id,
        status: 'active',
        relationship_type: 'primary'
      })

    insertError = newSchemaError

    // Backward-compatible fallback for older schema variants.
    if (insertError) {
      const { error: oldSchemaError } = await supabase
        .from('doctor_patient_relationships')
        .insert({
          doctor_id: user.id,
          patient_id,
          access_type: 'verified'
        })

      insertError = oldSchemaError
    }

    if (insertError) {
      throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Doctor patient add error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add patient' },
      { status: 500 }
    )
  }
}
