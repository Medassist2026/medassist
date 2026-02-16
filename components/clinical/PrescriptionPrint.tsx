'use client'

import { useState } from 'react'

interface Medication {
  name: string
  type: string
  frequency: string
  duration: string
  endDate?: string
  notes?: string
  taperingInstructions?: string
}

interface PrescriptionPrintProps {
  patientName: string
  patientAge?: number
  patientSex?: string
  doctorName: string
  doctorLicense?: string
  doctorSpecialty: string
  prescriptionNumber: string
  prescriptionDate: string
  medications: Medication[]
  diagnosis?: string
  onPrint?: () => void
}

export default function PrescriptionPrint({
  patientName,
  patientAge,
  patientSex,
  doctorName,
  doctorLicense,
  doctorSpecialty,
  prescriptionNumber,
  prescriptionDate,
  medications,
  diagnosis,
  onPrint
}: PrescriptionPrintProps) {
  const [isPrinting, setIsPrinting] = useState(false)

  const handlePrint = () => {
    setIsPrinting(true)
    if (onPrint) onPrint()
    
    // Trigger browser print
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 100)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    })
  }

  const getMedicationTypeIcon = (type: string) => {
    const icons: Record<string, string> = {
      'pill': '💊',
      'syrup': '🥤',
      'injection': '💉',
      'cream': '🧴',
      'inhaler': '🫁',
      'drops': '💧',
      'other': '📋'
    }
    return icons[type] || '💊'
  }

  return (
    <div className="bg-white">
      {/* Print Button (hidden when printing) */}
      <div className="mb-6 print:hidden flex gap-3">
        <button
          onClick={handlePrint}
          disabled={isPrinting}
          className="flex-1 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          {isPrinting ? 'Preparing...' : 'Print Prescription'}
        </button>
        <button
          onClick={() => window.history.back()}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium"
        >
          Close
        </button>
      </div>

      {/* Prescription Document (A4 size for printing) */}
      <div className="prescription-document bg-white border-2 border-gray-300 rounded-lg p-8 print:border-0 print:rounded-none print:p-12">
        {/* Header - Doctor Letterhead */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{doctorName}</h1>
              <p className="text-gray-700 mt-1">{doctorSpecialty.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</p>
              {doctorLicense && (
                <p className="text-sm text-gray-600 mt-1">License No: {doctorLicense}</p>
              )}
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">
                <p>Date: {formatDate(prescriptionDate)}</p>
                <p className="mt-1">Rx No: {prescriptionNumber}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Patient Information */}
        <div className="mb-6">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-gray-600 font-medium">Patient:</span>
            <span className="text-lg font-semibold text-gray-900">{patientName}</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-700">
            {patientAge && <span>Age: {patientAge} years</span>}
            {patientSex && <span>Sex: {patientSex}</span>}
          </div>
          {diagnosis && (
            <div className="mt-2 text-sm">
              <span className="font-medium text-gray-600">Diagnosis: </span>
              <span className="text-gray-900">{diagnosis}</span>
            </div>
          )}
        </div>

        {/* Rx Symbol */}
        <div className="mb-4">
          <div className="text-5xl font-serif text-primary-600" style={{ fontFamily: 'Georgia, serif' }}>
            ℞
          </div>
        </div>

        {/* Medications List */}
        <div className="space-y-4 mb-8">
          {medications.map((med, index) => (
            <div key={index} className="border-l-4 border-primary-400 pl-4 py-2">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-lg font-bold text-gray-900">{index + 1}.</span>
                <span className="text-lg font-semibold text-gray-900">{med.name}</span>
                <span className="text-sm text-gray-500">({getMedicationTypeIcon(med.type)} {med.type})</span>
              </div>
              
              <div className="ml-6 space-y-1 text-gray-700">
                <p>
                  <span className="font-medium">Sig:</span> {med.frequency}
                </p>
                <p>
                  <span className="font-medium">Duration:</span> {med.duration}
                  {med.endDate && <span className="text-gray-600"> (until {med.endDate})</span>}
                </p>
                
                {med.taperingInstructions && (
                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded">
                    <p className="text-sm">
                      <span className="font-medium text-amber-900">⚠️ Tapering Instructions:</span>
                      <span className="text-amber-800"> {med.taperingInstructions}</span>
                    </p>
                  </div>
                )}
                
                {med.notes && (
                  <p className="text-sm italic text-gray-600">
                    Note: {med.notes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer - Signature Area */}
        <div className="mt-12 pt-6 border-t border-gray-300">
          <div className="flex justify-between items-end">
            <div className="text-sm text-gray-600">
              <p>This prescription is valid for 30 days from the date of issue.</p>
              <p className="mt-1">For any questions, please contact the clinic.</p>
            </div>
            <div className="text-center">
              <div className="w-48 border-t-2 border-gray-800 pt-2">
                <p className="text-sm font-medium text-gray-900">{doctorName}</p>
                <p className="text-xs text-gray-600">Doctor's Signature & Stamp</p>
              </div>
            </div>
          </div>
        </div>

        {/* Watermark for digital version */}
        <div className="print:hidden mt-6 text-center text-xs text-gray-400">
          This is a digital preview. Official prescription requires doctor's signature and stamp.
        </div>
      </div>

      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          
          .prescription-document {
            margin: 0;
            padding: 2cm 1.5cm;
            box-shadow: none;
          }
          
          @page {
            size: A4;
            margin: 0;
          }
        }
      `}</style>
    </div>
  )
}
