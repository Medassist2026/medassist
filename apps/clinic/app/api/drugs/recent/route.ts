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

    // Get recent clinical notes with medications (read from medications column, not note_data)
    const { data: notes, error } = await supabase
      .from('clinical_notes')
      .select('medications')
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.error('Recent drugs error:', error)
      return NextResponse.json({ drugs: [] })
    }

    // Extract unique drugs from recent notes
    const drugMap = new Map<string, { id: string; name: string; strength?: string; type?: string }>()

    for (const note of notes || []) {
      const medications = Array.isArray(note.medications) ? note.medications : []
      for (const med of medications) {
        const key = (med.name || '').toLowerCase()
        if (key && !drugMap.has(key)) {
          drugMap.set(key, {
            id: `recent_${key}`,
            name: med.name,
            strength: med.strength || '',
            type: med.type || 'pill',
          })
        }
        if (drugMap.size >= 5) break
      }
      if (drugMap.size >= 5) break
    }

    return NextResponse.json({ drugs: Array.from(drugMap.values()) })
  } catch (error: any) {
    console.error('Recent drugs error:', error)
    return NextResponse.json({ drugs: [] })
  }
}
