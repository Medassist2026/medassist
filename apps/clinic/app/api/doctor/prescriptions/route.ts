export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

// FIX 1b: Get recent prescriptions for doctor
export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const admin = createAdminClient('prescriptions-list')

    // Query clinical notes where doctor_id = user.id, ordered by created_at DESC, limit 30
    const { data: notes, error: notesError } = await admin
      .from('clinical_notes')
      .select(`
        id,
        created_at,
        chief_complaint,
        diagnosis,
        medications,
        note_data,
        patient:patients (
          id,
          full_name,
          age,
          sex
        )
      `)
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)

    if (notesError) {
      console.error('Prescriptions fetch error:', notesError?.message)
      return NextResponse.json(
        { error: 'Failed to fetch prescriptions' },
        { status: 500 }
      )
    }

    // Transform notes to prescriptions list
    const prescriptions = (notes || []).map((note: any) => {
      const patient = note.patient?.[0] || note.patient
      const diagnosis = Array.isArray(note.diagnosis)
        ? note.diagnosis
            .map((d: any) => (typeof d === 'string' ? d : d?.text || d?.icd10_code || ''))
            .filter(Boolean)
            .join('، ')
        : typeof note.diagnosis === 'string'
        ? note.diagnosis
        : ''

      const medicationsCount = Array.isArray(note.medications) ? note.medications.length : 0

      return {
        id: note.id,
        patient_name: patient?.full_name || 'مريض',
        patient_age: patient?.age,
        diagnosis: diagnosis || 'بدون تشخيص',
        medications_count: medicationsCount,
        created_at: note.created_at,
        chief_complaint: Array.isArray(note.chief_complaint)
          ? note.chief_complaint.join('، ')
          : note.chief_complaint || '',
      }
    })

    return NextResponse.json({
      success: true,
      prescriptions,
    })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to fetch prescriptions')
  }
}
