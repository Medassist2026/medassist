import { requireRole } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireRole('doctor')
    const supabase = await createClient()
    const admin = createAdminClient()

    // Primary source: explicit doctor-patient relationships
    const { data: relationships, error: relError } = await admin
      .from('doctor_patient_relationships')
      .select('status, relationship_type, patient_id, created_at')
      .eq('doctor_id', user.id)
      .order('created_at', { ascending: false })

    if (relError) {
      throw relError
    }

    const relationshipRows = (relationships || []) as any[]
    const relationshipPatients = relationshipRows
      .map((r) => ({
        relationship_status: (r.status || 'active') as 'active' | 'pending' | 'inactive',
        relationship_type: r.relationship_type || null,
        patient_id: r.patient_id as string
      }))
      .filter((r) => r.patient_id)

    const relationshipPatientIds = relationshipPatients.map((r) => r.patient_id)
    const relationshipPatientMap = new Map<string, any>()
    if (relationshipPatientIds.length > 0) {
      const { data: patientRows, error: patientRowsError } = await admin
        .from('patients')
        .select('id, full_name, phone, sex, registered, created_at')
        .in('id', relationshipPatientIds)

      if (patientRowsError) throw patientRowsError
      ;(patientRows || []).forEach((p: any) => relationshipPatientMap.set(p.id, p))
    }

    // Fallback source for legacy doctors without relationship rows:
    // patients inferred from clinical notes.
    let basePatients = relationshipPatients
    if (basePatients.length === 0) {
      const { data: notes, error: notesError } = await supabase
        .from('clinical_notes')
        .select('patient_id')
        .eq('doctor_id', user.id)

      if (notesError) throw notesError

      const inferredPatientIds = Array.from(new Set((notes || []).map((n) => n.patient_id)))
      if (inferredPatientIds.length > 0) {
        const { data: inferredPatients, error: inferredError } = await admin
          .from('patients')
          .select('id, full_name, phone, sex, registered, created_at')
          .in('id', inferredPatientIds)

        if (inferredError) throw inferredError

        basePatients = (inferredPatients || []).map((p) => ({
          relationship_status: 'active' as const,
          relationship_type: null,
          patient_id: p.id
        }))

        ;(inferredPatients || []).forEach((p: any) => relationshipPatientMap.set(p.id, p))
      }
    }

    if (basePatients.length === 0) {
      return NextResponse.json({ success: true, patients: [] })
    }

    const patientIds = basePatients
      .map((r) => r.patient_id)
      .filter((id): id is string => !!id)

    // Build visit stats from clinical notes
    const { data: noteStats, error: noteStatsError } = await supabase
      .from('clinical_notes')
      .select('patient_id, created_at')
      .eq('doctor_id', user.id)
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false })

    if (noteStatsError) throw noteStatsError

    const statsByPatient: Record<string, { count: number; lastVisit: string | null }> = {}
    ;(noteStats || []).forEach((note) => {
      if (!statsByPatient[note.patient_id]) {
        statsByPatient[note.patient_id] = { count: 0, lastVisit: note.created_at || null }
      }
      statsByPatient[note.patient_id].count += 1
    })

    const patients = basePatients
      .map((row) => {
        const patient = relationshipPatientMap.get(row.patient_id)
        if (!patient) return null
        const stats = statsByPatient[patient.id]
        return {
          id: patient.id,
          name: patient.full_name || 'Unknown Patient',
          phone: patient.phone,
          gender: patient.sex ? patient.sex.toLowerCase() : undefined,
          relationship_status: row.relationship_status,
          is_walkin: patient.registered === false,
          last_visit: stats?.lastVisit || null,
          visit_count: stats?.count || 0,
          created_at: patient.created_at
        }
      })
      .filter((p): p is {
        id: string
        name: string
        phone: string
        gender: string | undefined
        relationship_status: 'active' | 'pending' | 'inactive'
        is_walkin: boolean
        last_visit: string | null
        visit_count: number
        created_at: string
      } => !!p)
      .sort((a, b) => {
        const aTime = a.last_visit ? new Date(a.last_visit).getTime() : 0
        const bTime = b.last_visit ? new Date(b.last_visit).getTime() : 0
        return bTime - aTime
      })

    return NextResponse.json({ success: true, patients })
  } catch (error: any) {
    console.error('Get doctor patients error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch patients' },
      { status: 500 }
    )
  }
}
