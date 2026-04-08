export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { getFrontdeskClinicId } from '@shared/lib/data/frontdesk-scope'
import { createClient } from '@shared/lib/supabase/server'

// ============================================================================
// GET /api/frontdesk/invoice/[paymentId]
//
// Returns all data needed to render a printable invoice for a given payment.
// Also creates/returns the invoice_requests record (idempotent).
// ============================================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    const user = await requireApiRole('frontdesk')
    const supabase = await createClient()
    const admin = createAdminClient()

    const clinicId = await getFrontdeskClinicId(supabase as any, user.id)
    if (!clinicId) {
      return NextResponse.json({ error: 'لا يوجد عيادة مرتبطة' }, { status: 403 })
    }

    const { paymentId } = params

    // ── Fetch payment (must belong to this clinic) ──
    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select(`
        id, amount, payment_method, payment_status, notes,
        insurance_company, insurance_policy_number,
        created_at, clinic_id,
        patient_id, doctor_id, appointment_id, clinical_note_id,
        collected_by
      `)
      .eq('id', paymentId)
      .eq('clinic_id', clinicId)
      .single()

    if (paymentError || !payment) {
      return NextResponse.json({ error: 'الدفع غير موجود' }, { status: 404 })
    }

    // ── Fetch patient ──
    const { data: patient } = await admin
      .from('patients')
      .select('id, full_name, age, sex, phone')
      .eq('id', payment.patient_id)
      .single()

    // ── Fetch doctor ──
    const { data: doctor } = await admin
      .from('doctors')
      .select('id, specialty, consultation_fee_egp, followup_fee_egp')
      .eq('id', payment.doctor_id)
      .maybeSingle()

    const { data: doctorUser } = await admin
      .from('users')
      .select('full_name')
      .eq('id', payment.doctor_id)
      .single()

    // ── Fetch clinic ──
    const { data: clinic } = await admin
      .from('clinics')
      .select('id, name, address, phone, logo_url')
      .eq('id', clinicId)
      .single()

    // ── Fetch medications from clinical note (if exists) ──
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
        } catch { /* ignore parse errors */ }
      }
    }

    // ── Upsert invoice_requests (idempotent — one invoice per payment) ──
    let invoiceNumber: string
    const { data: existing } = await admin
      .from('invoice_requests')
      .select('invoice_number')
      .eq('payment_id', paymentId)
      .maybeSingle()

    if (existing) {
      invoiceNumber = existing.invoice_number
    } else {
      // Generate sequential invoice number: INV-YYYY-NNNNNN
      const { data: seqRow } = await admin.rpc('nextval', { seq_name: 'invoice_seq' }).single()
      const seqNum = seqRow ? String(seqRow).padStart(6, '0') : Date.now().toString().slice(-6)
      const year = new Date().getFullYear()
      invoiceNumber = `INV-${year}-${seqNum}`

      await admin.from('invoice_requests').insert({
        payment_id: paymentId,
        clinic_id: clinicId,
        invoice_number: invoiceNumber,
        issued_by: user.id,
      })
    }

    // ── Return consolidated invoice data ──
    return NextResponse.json({
      invoiceNumber,
      issuedAt: new Date().toISOString(),
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.payment_method,
        status: payment.payment_status,
        notes: payment.notes,
        insuranceCompany: payment.insurance_company,
        insurancePolicyNumber: payment.insurance_policy_number,
        date: payment.created_at,
      },
      patient: {
        id: patient?.id,
        name: patient?.full_name || 'مريض',
        age: patient?.age,
        sex: patient?.sex,
        phone: patient?.phone,
      },
      doctor: {
        name: doctorUser?.full_name || 'طبيب',
        specialty: doctor?.specialty || '',
      },
      clinic: {
        name: clinic?.name || '',
        address: clinic?.address || '',
        phone: clinic?.phone || '',
        logoUrl: clinic?.logo_url || null,
      },
      medications,
    })

  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to load invoice')
  }
}

// ============================================================================
// POST /api/frontdesk/invoice/[paymentId]
//
// Marks SMS as sent for an invoice_request.
// ============================================================================

export async function POST(
  _req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  try {
    await requireApiRole('frontdesk')
    const admin = createAdminClient()

    await admin
      .from('invoice_requests')
      .update({ sms_sent: true, sms_sent_at: new Date().toISOString() })
      .eq('payment_id', params.paymentId)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return toApiErrorResponse(error, 'Failed to update SMS status')
  }
}
