export const dynamic = 'force-dynamic'

import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get recent patients from clinical notes
    const { data: notes, error } = await supabase
      .from('clinical_notes')
      .select('patient_id, created_at, patients(id, unique_id, full_name, phone, date_of_birth, sex)')
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('Recent patients error:', error)
      return NextResponse.json({ patients: [] })
    }

    // Deduplicate by patient_id, keeping most recent
    const seen = new Set<string>()
    const patients = (notes || [])
      .filter((note: any) => {
        if (!note.patients || seen.has(note.patient_id)) return false
        seen.add(note.patient_id)
        return true
      })
      .slice(0, 3)
      .map((note: any) => ({
        ...note.patients,
        last_visit_date: note.created_at,
      }))

    return NextResponse.json({ patients })
  } catch (error: any) {
    console.error('Recent patients error:', error)
    return NextResponse.json({ patients: [] })
  }
}
