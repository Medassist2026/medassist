export const dynamic = 'force-dynamic'

import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const adminClient = createAdminClient('patient-visits')

    // Query clinical_notes table for patient visits
    const { data: visitsData, error: visitsError } = await adminClient
      .from('clinical_notes')
      .select(`
        id,
        created_at,
        chief_complaint,
        diagnosis,
        medications,
        plan,
        doctor:doctors (
          id,
          users (
            full_name
          )
        )
      `)
      .eq('patient_id', user.id)
      .order('created_at', { ascending: false })

    if (visitsError) {
      throw visitsError
    }

    const visits = (visitsData || []).map((visit: any) => {
      // Extract chief complaint
      const chiefComplaintArray = Array.isArray(visit.chief_complaint)
        ? visit.chief_complaint
        : []
      const chiefComplaint = chiefComplaintArray.length > 0
        ? chiefComplaintArray[0]
        : 'Consultation'

      // Extract diagnosis - can be array or JSONB with structure
      let diagnosis: string[] = []
      if (Array.isArray(visit.diagnosis)) {
        diagnosis = visit.diagnosis
          .map((d: any) => {
            if (typeof d === 'string') return d
            if (d && d.text) return d.text
            if (d && d.name) return d.name
            return ''
          })
          .filter((d: string) => d.length > 0)
      }

      // Extract medications
      let medications: Array<{ drug: string; frequency?: string; duration?: string }> = []
      if (Array.isArray(visit.medications)) {
        medications = visit.medications
          .map((m: any) => ({
            drug: m.drug || 'Medication',
            frequency: m.frequency,
            duration: m.duration
          }))
      }

      // Get doctor name - handle nested structure
      const doctorName = visit.doctor?.users?.full_name ||
                        visit.doctor?.full_name ||
                        'Unknown Doctor'

      return {
        id: visit.id,
        date: visit.created_at,
        doctor_name: doctorName,
        chief_complaint: chiefComplaint,
        diagnosis,
        medications,
        plan: visit.plan || ''
      }
    })

    return NextResponse.json({
      success: true,
      visits
    })
  } catch (error: any) {
    console.error('Visits fetch error:', error)
    return toApiErrorResponse(error, 'Failed to load visit history')
  }
}
