import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()

    const { data: records, error } = await supabase
      .from('patient_medical_records')
      .select('*')
      .eq('patient_id', user.id)
      .order('date', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, records: records || [] })
  } catch (error: any) {
    console.error('Get records error:', error)
    return toApiErrorResponse(error, 'Failed to fetch records')
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiRole('patient')
    const supabase = await createClient()
    const body = await request.json()

    // Validate required fields
    const validTypes = ['lab_result', 'diagnosis', 'procedure', 'imaging', 'other']
    if (!validTypes.includes(body.record_type)) {
      return NextResponse.json(
        { error: 'Invalid record type' },
        { status: 400 }
      )
    }

    if (!body.title || body.title.length < 2) {
      return NextResponse.json(
        { error: 'Title must be at least 2 characters' },
        { status: 400 }
      )
    }

    if (!body.date) {
      return NextResponse.json(
        { error: 'Date is required' },
        { status: 400 }
      )
    }

    const { data: record, error } = await supabase
      .from('patient_medical_records')
      .insert({
        patient_id: user.id,
        record_type: body.record_type,
        title: body.title,
        description: body.description || null,
        date: body.date,
        provider_name: body.provider_name || null,
        facility_name: body.facility_name || null
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, record })
  } catch (error: any) {
    console.error('Create record error:', error)
    return toApiErrorResponse(error, 'Failed to create record')
  }
}
