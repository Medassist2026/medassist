export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/clinical/patient-medications?patientId=xxx
 * Doctor-side endpoint to get a patient's current medication baseline
 * Returns both:
 * 1. Medication intake (what patient reported at first visit)
 * 2. Previously prescribed medications from clinical notes
 */
export async function GET(request: Request) {
  try {
    await requireApiRole('doctor')
    const { searchParams } = new URL(request.url)
    const patientId = searchParams.get('patientId')

    if (!patientId) {
      return NextResponse.json(
        { error: 'patientId is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // 1. Get patient's self-reported intake medications
    let intakeMedications: any[] = []
    let intakeCompleted = false

    try {
      const { data: intakeData, error: intakeError } = await supabase
        .from('patient_medication_intake')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (!intakeError && intakeData) {
        // Filter out the "__NO_MEDICATIONS__" marker
        intakeMedications = intakeData.filter((m: any) => m.drug_name !== '__NO_MEDICATIONS__')
        intakeCompleted = intakeData.length > 0
      }
    } catch {
      // Table might not exist yet — that's ok
    }

    // 2. Get medications from previous clinical sessions (prescribed by doctors)
    let prescribedMedications: any[] = []

    try {
      const { data: notesData, error: notesError } = await supabase
        .from('clinical_notes')
        .select('id, medications, created_at, doctors(name)')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!notesError && notesData) {
        for (const note of notesData) {
          // medications is stored directly in the medications column
          const meds = Array.isArray((note as any).medications) ? (note as any).medications : []
          if (meds.length > 0) {
            for (const med of meds) {
              prescribedMedications.push({
                name: med.name,
                type: med.type,
                frequency: med.frequency,
                duration: med.duration,
                notes: med.notes,
                prescribedDate: note.created_at,
                prescribedBy: (note as any).doctors?.name || 'Unknown',
                source: 'prescription',
              })
            }
          }
        }
      }
    } catch {
      // If clinical_notes doesn't exist or has different shape
    }

    // 3. Get patient's own medication list (self-managed)
    let patientMedications: any[] = []

    try {
      const { data: patientMedData, error: patientMedError } = await supabase
        .from('patient_medications')
        .select('*')
        .eq('patient_id', patientId)
        .eq('is_active', true)

      if (!patientMedError && patientMedData) {
        patientMedications = patientMedData.map((m: any) => ({
          name: m.medication_name,
          dosage: m.dosage,
          frequency: m.frequency,
          startDate: m.start_date,
          source: 'patient_managed',
        }))
      }
    } catch {
      // Table might not exist
    }

    // Combine all sources into a unified "current medications" list
    const currentMedications = [
      ...intakeMedications.filter((m: any) => m.still_taking).map((m: any) => ({
        name: m.drug_name,
        genericName: m.generic_name,
        dosage: m.dosage,
        frequency: m.frequency,
        condition: m.condition,
        duration: m.duration_taking,
        prescriber: m.prescriber,
        source: 'intake' as const,
        stillTaking: true,
      })),
      ...patientMedications.map((m: any) => ({
        ...m,
        source: 'patient_managed' as const,
        stillTaking: true,
      })),
    ]

    // Deduplicate by drug name (case insensitive)
    const seen = new Set<string>()
    const deduped = currentMedications.filter(m => {
      const key = m.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return NextResponse.json({
      success: true,
      intakeCompleted,
      currentMedications: deduped,
      previousPrescriptions: prescribedMedications,
      totalCurrentCount: deduped.length,
    })
  } catch (error: any) {
    console.error('Get patient medications error:', error)
    return toApiErrorResponse(error, 'Failed to fetch patient medications')
  }
}
