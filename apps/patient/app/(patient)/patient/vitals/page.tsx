'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface VitalEntry {
  id: string
  measured_at: string
  blood_pressure: string | null
  heart_rate: number | null
  temperature: number | null
  respiratory_rate: number | null
  oxygen_saturation: number | null
  weight: number | null
  height: number | null
  bmi: number | null
  notes: string | null
}

export default function PatientVitalsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [vitals, setVitals] = useState<VitalEntry[]>([])

  useEffect(() => {
    const loadVitals = async () => {
      try {
        const res = await fetch('/api/patient/vitals')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load vitals')
        setVitals(data.vitals || [])
      } catch (err: any) {
        setError(err.message || 'Failed to load vitals')
      } finally {
        setLoading(false)
      }
    }
    loadVitals()
  }, [])

  const latest = vitals[0] || null

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Vital Signs</h1>
          <p className="text-gray-600 mt-1">Track your recent measurements from clinic visits</p>
        </div>
        <Link
          href="/patient/records"
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Back to Records
        </Link>
      </div>

      {!latest ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500">
          No vital signs have been recorded yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Blood Pressure" value={latest.blood_pressure || '—'} />
            <MetricCard label="Heart Rate" value={latest.heart_rate ? `${latest.heart_rate} bpm` : '—'} />
            <MetricCard label="Weight" value={latest.weight ? `${latest.weight} kg` : '—'} />
            <MetricCard label="BMI" value={latest.bmi ? String(latest.bmi) : '—'} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Vitals History</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {vitals.map((entry) => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {new Date(entry.measured_at).toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {new Date(entry.measured_at).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <div className="text-sm text-gray-700 grid grid-cols-2 gap-x-6 gap-y-1">
                      <span>BP: {entry.blood_pressure || '—'}</span>
                      <span>HR: {entry.heart_rate ? `${entry.heart_rate} bpm` : '—'}</span>
                      <span>Temp: {entry.temperature ? `${entry.temperature} °C` : '—'}</span>
                      <span>SpO2: {entry.oxygen_saturation ? `${entry.oxygen_saturation}%` : '—'}</span>
                      <span>Weight: {entry.weight ? `${entry.weight} kg` : '—'}</span>
                      <span>Height: {entry.height ? `${entry.height} cm` : '—'}</span>
                    </div>
                  </div>
                  {entry.notes && <p className="mt-2 text-sm text-gray-600 italic">"{entry.notes}"</p>}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  )
}
