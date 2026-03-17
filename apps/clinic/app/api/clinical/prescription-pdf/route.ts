import { requireApiRole, toApiErrorResponse } from '@shared/lib/auth/session'
import { createAdminClient } from '@shared/lib/supabase/admin'
import { createClient } from '@shared/lib/supabase/server'
import { NextResponse } from 'next/server'

function diagnosisToText(diagnosis: any): string {
  if (!diagnosis) return ''
  if (typeof diagnosis === 'string') return diagnosis
  if (Array.isArray(diagnosis)) {
    return diagnosis
      .map((d) => {
        if (typeof d === 'string') return d
        if (!d) return ''
        const code = d.icd10_code ? `${d.icd10_code}: ` : ''
        return `${code}${d.text || ''}`.trim()
      })
      .filter(Boolean)
      .join(', ')
  }
  return ''
}

function medicationsToUi(medications: any): Array<{
  name: string
  type: string
  strength?: string
  frequency: string
  duration: string
  quantity?: number
  instructions?: string
}> {
  if (!Array.isArray(medications)) return []
  return medications.map((m) => ({
    name: m?.name || m?.drug || 'Unnamed Medication',
    type: m?.type || m?.form || 'pill',
    strength: m?.strength,
    frequency: m?.frequency || '',
    duration: m?.duration || '',
    quantity: m?.quantity,
    instructions: m?.instructions || m?.notes
  }))
}

function generatePrescriptionHTML(payload: any): string {
  const medications = medicationsToUi(payload.medications)
  const prescriptionDate = payload.prescription_date
  const prescriptionNumber = payload.prescription_number || 'N/A'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prescription - ${prescriptionNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }

    .container {
      max-width: 21cm;
      height: 14.8cm;
      background: white;
      margin: 0 auto;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      position: relative;
    }

    .header {
      border-bottom: 2px solid #2c3e50;
      padding-bottom: 12px;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .clinic-info {
      flex: 1;
    }

    .clinic-name {
      font-size: 16px;
      font-weight: bold;
      color: #2c3e50;
      margin-bottom: 4px;
    }

    .doctor-info {
      font-size: 11px;
      color: #555;
      line-height: 1.4;
    }

    .prescription-meta {
      text-align: right;
      font-size: 11px;
    }

    .prescription-number {
      font-weight: bold;
      color: #2c3e50;
      font-size: 12px;
      margin-bottom: 2px;
    }

    .prescription-date {
      color: #666;
    }

    .patient-section {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e0e0e0;
    }

    .patient-header {
      font-weight: bold;
      color: #2c3e50;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .patient-row {
      display: flex;
      gap: 20px;
      font-size: 11px;
    }

    .patient-field {
      flex: 1;
    }

    .field-label {
      font-weight: 600;
      color: #555;
      margin-right: 4px;
    }

    .field-value {
      color: #333;
    }

    .diagnosis-section {
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e0e0e0;
    }

    .section-header {
      font-weight: bold;
      color: #2c3e50;
      font-size: 12px;
      margin-bottom: 6px;
    }

    .diagnosis-text {
      font-size: 11px;
      color: #333;
      line-height: 1.4;
    }

    .medications-section {
      margin-bottom: 12px;
    }

    .medications-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }

    .medications-table thead {
      background-color: #f0f0f0;
    }

    .medications-table th {
      border: 1px solid #ddd;
      padding: 6px;
      text-align: left;
      font-weight: bold;
      color: #2c3e50;
    }

    .medications-table td {
      border: 1px solid #ddd;
      padding: 6px;
      vertical-align: top;
    }

    .med-name {
      font-weight: 600;
      color: #333;
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 12px;
      font-size: 11px;
    }

    .signature-area {
      text-align: center;
      border-top: 1px solid #333;
      padding-top: 4px;
      min-width: 100px;
    }

    .signature-label {
      font-size: 10px;
      color: #666;
      margin-top: 2px;
    }

    .notes {
      font-size: 10px;
      color: #666;
      font-style: italic;
    }

    /* Arabic RTL Styles */
    .rtl {
      direction: rtl;
      text-align: right;
    }

    .ltr {
      direction: ltr;
      text-align: left;
    }

    /* Print Styles - A5 Size */
    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        max-width: 100%;
        height: auto;
        margin: 0;
        padding: 10mm;
        box-shadow: none;
        page-break-after: always;
      }

      /* A5 Paper */
      @page {
        size: A5;
        margin: 5mm;
      }

      .no-print {
        display: none;
      }
    }

    .print-button {
      padding: 10px 20px;
      background-color: #2c3e50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 20px;
    }

    .print-button:hover {
      background-color: #1a252f;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="print-button" onclick="window.print()">Print Prescription</button>
  </div>

  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="clinic-info">
        <div class="clinic-name">MedAssist Clinic</div>
        <div class="doctor-info">
          <div><strong>${payload.doctor.full_name}</strong></div>
          <div>${payload.doctor.specialty || 'General Practitioner'}</div>
          ${payload.doctor.license_number ? `<div>License: ${payload.doctor.license_number}</div>` : ''}
          ${payload.doctor.unique_id ? `<div>ID: ${payload.doctor.unique_id}</div>` : ''}
        </div>
      </div>
      <div class="prescription-meta">
        <div class="prescription-number">Rx: ${prescriptionNumber}</div>
        <div class="prescription-date">Date: ${prescriptionDate}</div>
      </div>
    </div>

    <!-- Patient Information -->
    <div class="patient-section">
      <div class="patient-header">Patient Information</div>
      <div class="patient-row">
        <div class="patient-field">
          <span class="field-label">Name:</span>
          <span class="field-value">${payload.patient.full_name || 'Unknown Patient'}</span>
        </div>
        <div class="patient-field">
          <span class="field-label">Age:</span>
          <span class="field-value">${payload.patient.age ?? '-'}</span>
        </div>
        <div class="patient-field">
          <span class="field-label">Sex:</span>
          <span class="field-value">${payload.patient.sex ? payload.patient.sex.toUpperCase() : '-'}</span>
        </div>
      </div>
    </div>

    <!-- Diagnosis -->
    ${payload.diagnosis ? `
      <div class="diagnosis-section">
        <div class="section-header">Diagnosis</div>
        <div class="diagnosis-text">${payload.diagnosis}</div>
      </div>
    ` : ''}

    <!-- Medications/Prescriptions -->
    <div class="medications-section">
      <div class="section-header">Medications</div>
      <table class="medications-table">
        <thead>
          <tr>
            <th style="width: 25%;">Medication</th>
            <th style="width: 15%;">Strength</th>
            <th style="width: 15%;">Form</th>
            <th style="width: 15%;">Frequency</th>
            <th style="width: 15%;">Duration</th>
            <th style="width: 15%;">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${medications
            .map(
              (med) => `
            <tr>
              <td><span class="med-name">${med.name}</span></td>
              <td>${med.strength || '-'}</td>
              <td>${med.type || '-'}</td>
              <td>${med.frequency || '-'}</td>
              <td>${med.duration || '-'}</td>
              <td>${med.quantity || '-'}</td>
            </tr>
            ${med.instructions ? `
            <tr>
              <td colspan="6" style="background-color: #fafafa; font-style: italic; color: #666;">
                Instructions: ${med.instructions}
              </td>
            </tr>
            ` : ''}
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Footer with Signature -->
    <div class="footer">
      <div class="notes">
        <p>Keep medications at room temperature</p>
        <p>Report any adverse effects to your doctor</p>
      </div>
      <div class="signature-area">
        ________________________
        <div class="signature-label">Doctor's Signature</div>
      </div>
    </div>
  </div>

  <script>
    // Auto-print on load if requested via query parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autoPrint') === 'true') {
      window.addEventListener('load', function() {
        setTimeout(() => window.print(), 500);
      });
    }
  </script>
</body>
</html>`
}

export async function GET(request: Request) {
  try {
    const user = await requireApiRole('doctor')
    const { searchParams } = new URL(request.url)
    const noteId = searchParams.get('noteId')

    if (!noteId) {
      return NextResponse.json(
        { error: 'Missing noteId parameter' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const admin = createAdminClient('prescription-sync')

    // Authorization check: note must belong to current doctor
    const { data: note, error: noteError } = await supabase
      .from('clinical_notes')
      .select(
        `
        id,
        doctor_id,
        patient_id,
        prescription_number,
        prescription_date,
        diagnosis,
        medications,
        chief_complaint,
        created_at,
        doctor:doctors (
          id,
          full_name,
          specialty,
          unique_id
        )
      `
      )
      .eq('id', noteId)
      .eq('doctor_id', user.id)
      .single()

    if (noteError || !note) {
      return NextResponse.json(
        { error: 'Prescription not found' },
        { status: 404 }
      )
    }

    // Use admin for patient read to avoid RLS null joins
    let patient: any = null
    if (note.patient_id) {
      const { data: patientData } = await admin
        .from('patients')
        .select('id, full_name, age, sex')
        .eq('id', note.patient_id)
        .maybeSingle()
      patient = patientData || null
    }

    const payload = {
      id: note.id,
      prescription_number: note.prescription_number || null,
      prescription_date:
        note.prescription_date || note.created_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      chief_complaints: note.chief_complaint || [],
      diagnosis: diagnosisToText(note.diagnosis),
      medications: medicationsToUi(note.medications),
      patient: {
        id: patient?.id || note.patient_id,
        full_name: patient?.full_name || 'Unknown Patient',
        age: patient?.age ?? undefined,
        sex: patient?.sex ?? undefined
      },
      doctor: {
        id: (note.doctor as any)?.id || user.id,
        full_name: (note.doctor as any)?.full_name || 'Doctor',
        specialty: (note.doctor as any)?.specialty || '',
        license_number: null,
        unique_id: (note.doctor as any)?.unique_id || null
      }
    }

    const html = generatePrescriptionHTML(payload)

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    })
  } catch (error: any) {
    console.error('Prescription PDF generation error:', error)
    return toApiErrorResponse(error, 'Failed to generate prescription PDF')
  }
}
