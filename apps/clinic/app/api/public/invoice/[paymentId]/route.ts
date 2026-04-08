export const dynamic = 'force-dynamic'

/**
 * GET /api/public/invoice/[paymentId]
 *
 * Public (no-auth) invoice data endpoint.
 * Returns only non-sensitive display fields needed to render the invoice.
 * The payment ID (UUID) is sufficiently random to be unguessable.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@shared/lib/supabase/admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const admin = createAdminClient()
    const { paymentId } = params

    // Must have an issued invoice_request to be publicly accessible
    const { data: invoiceReq } = await admin
      .from('invoice_requests')
      .select('invoice_number, clinic_id, created_at')
      .eq('payment_id', paymentId)
      .single()

    if (!invoiceReq) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    const { data: payment } = await admin
      .from('payments')
      .select(`
        id, amount, payment_method, notes,
        insurance_company, insurance_policy_number,
        created_at, patient_id, doctor_id, clinical_note_id
      `)
      .eq('id', paymentId)
      .single()

    if (!payment) {
      return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 })
    }

    const { data: patient } = await admin
      .from('patients')
      .select('full_name, age, sex')
      .eq('id', payment.patient_id)
      .single()

    const { data: doctorUser } = await admin
      .from('users')
      .select('full_name')
      .eq('id', payment.doctor_id)
      .single()

    const { data: doctor } = await admin
      .from('doctors')
      .select('specialty')
      .eq('id', payment.doctor_id)
      .maybeSingle()

    const { data: clinic } = await admin
      .from('clinics')
      .select('name, address, phone')
      .eq('id', invoiceReq.clinic_id)
      .single()

    // Medications
    let medications: Array<{ name: string; dosage: string; frequency: string; duration: string }> = []
    if (payment.clinical_note_id) {
      const { data: note } = await admin
        .from('clinical_notes')
        .select('prescription')
        .eq('id', payment.clinical_note_id)
        .single()
      if (note?.prescription) {
        try {
          const rx = typeof note.prescription === 'string'
            ? JSON.parse(note.prescription)
            : note.prescription
          if (Array.isArray(rx)) {
            medications = rx.map((m: any) => ({
              name: m.brandNameAr || m.brandNameEn || m.genericName || m.name || '',
              dosage: m.dosage || m.dose || '',
              frequency: m.frequency || m.freq || '',
              duration: m.duration || '',
            }))
          }
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({
      invoiceNumber: invoiceReq.invoice_number,
      issuedAt: invoiceReq.created_at,
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.payment_method,
        notes: payment.notes,
        insuranceCompany: payment.insurance_company,
        insurancePolicyNumber: payment.insurance_policy_number,
        date: payment.created_at,
      },
      patient: {
        name: patient?.full_name || 'مريض',
        age: patient?.age,
        sex: patient?.sex,
      },
      doctor: {
        name: doctorUser?.full_name || 'طبيب',
        specialty: doctor?.specialty || '',
      },
      clinic: {
        name: clinic?.name || '',
        address: clinic?.address || '',
        phone: clinic?.phone || '',
      },
      medications,
    })

  } catch (error: any) {
    return NextResponse.json({ error: 'خطأ في تحميل الفاتورة' }, { status: 500 })
  }
}
