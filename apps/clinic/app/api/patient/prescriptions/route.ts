export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getPatientPrescriptionHistory } from '@shared/lib/data/prescription-sync'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { logAuditEvent } from '@shared/lib/data/audit'

// ============================================================================
// GET /api/patient/prescriptions — Get patient's prescription history
// ============================================================================

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const prescriptions = await getPatientPrescriptionHistory(user.id)

    // Get doctor names for the prescriptions
    const doctorIds = [...new Set(prescriptions.map(p => p.doctor_id).filter(Boolean))]
    let doctorMap: Record<string, string> = {}

    if (doctorIds.length > 0) {
      const admin = createAdminClient('patient-prescriptions')
      const { data: doctors } = await admin
        .from('doctors')
        .select('id, full_name')
        .in('id', doctorIds)

      if (doctors) {
        doctorMap = Object.fromEntries(doctors.map(d => [d.id, d.full_name || 'Doctor']))
      }
    }

    // Group prescriptions by clinical_note_id (visit)
    const visitMap = new Map<string, {
      noteId: string
      date: string
      doctorName: string
      items: typeof prescriptions
    }>()

    for (const rx of prescriptions) {
      const key = rx.clinical_note_id || rx.id
      if (!visitMap.has(key)) {
        visitMap.set(key, {
          noteId: key,
          date: rx.prescribed_at,
          doctorName: doctorMap[rx.doctor_id] || 'Doctor',
          items: [],
        })
      }
      visitMap.get(key)!.items.push(rx)
    }

    const visits = Array.from(visitMap.values()).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    // Audit: patient viewed prescriptions
    logAuditEvent({
      actorUserId: user.id,
      action: 'VIEW_PRESCRIPTION',
      entityType: 'prescription_list',
      metadata: { count: prescriptions.length }
    })

    return NextResponse.json({ visits, total: prescriptions.length })
  } catch (error) {
    return toApiErrorResponse(error, 'Failed to fetch prescriptions')
  }
}
