import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()

    const { data: medications, error } = await supabase
      .from('patient_medications')
      .select('*')
      .eq('patient_id', user.id)
      .order('start_date', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, medications: medications || [] })
  } catch (error: any) {
    console.error('Get medications error:', error)
    return toApiErrorResponse(error, 'Failed to fetch medications')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const body = await request.json()

    // Validate required fields
    if (!body.medication_name || body.medication_name.length < 2) {
      return NextResponse.json(
        { error: 'Medication name must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (!body.dosage || body.dosage.length < 1) {
      return NextResponse.json(
        { error: 'Dosage is required' },
        { status: 400 }
      )
    }

    if (!body.frequency || body.frequency.length < 2) {
      return NextResponse.json(
        { error: 'Frequency is required' },
        { status: 400 }
      )
    }

    if (!body.start_date) {
      return NextResponse.json(
        { error: 'Start date is required' },
        { status: 400 }
      )
    }

    // Calculate is_active based on end_date
    const is_active = !body.end_date || new Date(body.end_date) >= new Date()

    const { data: medication, error } = await supabase
      .from('patient_medications')
      .insert({
        patient_id: user.id,
        medication_name: body.medication_name,
        dosage: body.dosage,
        frequency: body.frequency,
        route: body.route || 'oral',
        start_date: body.start_date,
        end_date: body.end_date || null,
        is_active,
        prescriber_name: body.prescriber_name || null,
        purpose: body.purpose || null,
        notes: body.notes || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, medication })
  } catch (error: any) {
    console.error('Create medication error:', error)
    return toApiErrorResponse(error, 'Failed to create medication')
  }
}
