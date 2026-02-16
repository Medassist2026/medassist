import { requireApiRole, toApiErrorResponse } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

function normalizeDiagnosisList(input: any): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item: any) => {
      if (typeof item === 'string') return item.trim()
      if (item && typeof item === 'object') {
        const text = item.text || item.name || item.diagnosis
        return typeof text === 'string' ? text.trim() : ''
      }
      return ''
    })
    .filter(Boolean)
}

export async function GET() {
  try {
    const user = await requireApiRole('patient')
    const admin = createAdminClient()

    const [
      patientMedicationsResult,
      reminderResult,
      labOrdersResult,
      visitsResult,
      vitalsResult,
      diagnosisRecordsResult
    ] = await Promise.all([
      admin
        .from('patient_medications')
        .select('id, medication_name, dosage, is_active, created_at')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('medication_reminders')
        .select('id, medication, status, created_at')
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('lab_orders')
        .select(`
          id,
          ordered_at,
          completed_at,
          results:lab_results (
            id,
            is_abnormal,
            abnormal_flag,
            test:lab_tests (test_name)
          )
        `)
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(50),
      admin
        .from('clinical_notes')
        .select(`
          id,
          created_at,
          chief_complaint,
          diagnosis,
          doctor:doctors (full_name)
        `)
        .eq('patient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .from('vital_signs')
        .select('measured_at, systolic_bp, diastolic_bp, heart_rate, weight, height')
        .eq('patient_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1),
      admin
        .from('patient_medical_records')
        .select('id, title, date')
        .eq('patient_id', user.id)
        .eq('record_type', 'diagnosis')
        .order('date', { ascending: false })
        .limit(50)
    ])

    if (patientMedicationsResult.error) throw patientMedicationsResult.error
    if (reminderResult.error) throw reminderResult.error
    if (labOrdersResult.error) throw labOrdersResult.error
    if (visitsResult.error) throw visitsResult.error
    if (vitalsResult.error) throw vitalsResult.error
    if (diagnosisRecordsResult.error) throw diagnosisRecordsResult.error

    const patientMedications = patientMedicationsResult.data || []
    const reminders = reminderResult.data || []
    const labOrders = labOrdersResult.data || []
    const visits = visitsResult.data || []
    const vitals = vitalsResult.data?.[0]
    const diagnosisRecords = diagnosisRecordsResult.data || []

    const reminderStatusToUi = (status: string) => {
      if (status === 'accepted') return 'active'
      if (status === 'pending') return 'pending'
      if (status === 'rejected') return 'declined'
      return status || 'pending'
    }

    const medicationRecentFromManual = patientMedications.map((medication: any) => ({
      id: medication.id,
      name: medication.medication_name,
      dosage: medication.dosage || '',
      status: medication.is_active ? 'active' : 'inactive',
      created_at: medication.created_at
    }))

    const medicationRecentFromReminders = reminders.map((reminder: any) => {
      const medication = reminder.medication && typeof reminder.medication === 'object'
        ? reminder.medication
        : {}
      const dosageParts = [medication.frequency, medication.duration].filter(Boolean)
      return {
        id: reminder.id,
        name: medication.drug || 'Medication',
        dosage: dosageParts.join(' · '),
        status: reminderStatusToUi(reminder.status),
        created_at: reminder.created_at
      }
    })

    const recentMedications = [...medicationRecentFromManual, ...medicationRecentFromReminders]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map(({ created_at, ...rest }) => rest)

    const abnormalLabCount = labOrders.reduce((count: number, order: any) => {
      const results = Array.isArray(order.results) ? order.results : []
      return count + results.filter((result: any) => !!result.is_abnormal).length
    }, 0)

    const recentLabs = labOrders.slice(0, 5).map((order: any) => {
      const results = Array.isArray(order.results) ? order.results : []
      const firstResult = results[0]
      const hasAbnormal = results.some((result: any) => !!result.is_abnormal)
      return {
        id: order.id,
        name: firstResult?.test?.test_name || 'Lab Panel',
        date: order.completed_at || order.ordered_at || new Date().toISOString(),
        status: hasAbnormal ? 'abnormal' : 'normal'
      }
    })

    const recentVisits = visits.slice(0, 5).map((visit: any) => {
      const complaint = Array.isArray(visit.chief_complaint) ? visit.chief_complaint[0] : null
      return {
        id: visit.id,
        doctor_name: visit.doctor?.full_name || 'Doctor',
        date: visit.created_at,
        reason: complaint || 'Consultation'
      }
    })

    const conditionByName = new Map<string, { id: string; name: string; diagnosed_date: string; status: 'active' | 'resolved' }>()
    visits.forEach((visit: any) => {
      const list = normalizeDiagnosisList(visit.diagnosis)
      list.forEach((name) => {
        if (!conditionByName.has(name)) {
          conditionByName.set(name, {
            id: `note-${visit.id}-${name}`,
            name,
            diagnosed_date: visit.created_at,
            status: 'active'
          })
        }
      })
    })
    diagnosisRecords.forEach((record: any) => {
      const name = String(record.title || '').trim()
      if (!name) return
      if (!conditionByName.has(name)) {
        conditionByName.set(name, {
          id: `record-${record.id}`,
          name,
          diagnosed_date: record.date,
          status: 'active'
        })
      }
    })

    const summary = {
      medications: {
        active:
          patientMedications.filter((medication: any) => !!medication.is_active).length +
          reminders.filter((reminder: any) => reminder.status === 'accepted').length,
        pending: reminders.filter((reminder: any) => reminder.status === 'pending').length,
        total: patientMedications.length + reminders.length,
        recent: recentMedications
      },
      labs: {
        total: labOrders.length,
        recent: recentLabs,
        abnormal: abnormalLabCount
      },
      visits: {
        total: visits.length,
        recent: recentVisits
      },
      vitals: {
        lastUpdated: vitals?.measured_at,
        blood_pressure:
          vitals?.systolic_bp && vitals?.diastolic_bp
            ? `${vitals.systolic_bp}/${vitals.diastolic_bp}`
            : undefined,
        heart_rate: vitals?.heart_rate ?? undefined,
        weight: vitals?.weight ?? undefined,
        height: vitals?.height ?? undefined
      },
      conditions: Array.from(conditionByName.values()),
      allergies: [] as Array<{
        id: string
        allergen: string
        reaction: string
        severity: 'mild' | 'moderate' | 'severe'
      }>
    }

    return NextResponse.json({ success: true, summary })
  } catch (error: any) {
    console.error('Health summary error:', error)
    return toApiErrorResponse(error, 'Failed to load health summary')
  }
}
