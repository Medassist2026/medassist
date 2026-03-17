'use client'

import { useState } from 'react'

interface VitalSignsInputProps {
  onVitalsRecorded?: (vitals: any) => void
  initialVitals?: {
    systolicBp?: number
    diastolicBp?: number
    heartRate?: number
    temperature?: number
    respiratoryRate?: number
    oxygenSaturation?: number
    weight?: number
    height?: number
    notes?: string
  }
  previousVitals?: {
    weight?: number
    height?: number
  }
}

export default function VitalSignsInput({ onVitalsRecorded, initialVitals, previousVitals }: VitalSignsInputProps) {
  const [vitals, setVitals] = useState({
    systolicBp: initialVitals?.systolicBp || '',
    diastolicBp: initialVitals?.diastolicBp || '',
    heartRate: initialVitals?.heartRate || '',
    temperature: initialVitals?.temperature || '',
    respiratoryRate: initialVitals?.respiratoryRate || '',
    oxygenSaturation: initialVitals?.oxygenSaturation || '',
    weight: initialVitals?.weight || '',
    height: initialVitals?.height || '',
    notes: initialVitals?.notes || ''
  })

  const [bmi, setBmi] = useState<number | null>(null)

  const calculateBMI = (weight: number, height: number) => {
    if (!weight || !height || height === 0) return null
    const heightInMeters = height / 100
    return Number((weight / (heightInMeters * heightInMeters)).toFixed(1))
  }

  const handleChange = (field: string, value: string) => {
    const newVitals = { ...vitals, [field]: value }
    setVitals(newVitals)

    // Auto-calculate BMI
    if (field === 'weight' || field === 'height') {
      const weight = parseFloat(newVitals.weight as string)
      const height = parseFloat(newVitals.height as string)
      setBmi(calculateBMI(weight, height))
    }

    if (onVitalsRecorded) {
      onVitalsRecorded(newVitals)
    }
  }

  const getBMICategory = (bmiValue: number) => {
    if (bmiValue < 18.5) return { text: 'Underweight', color: 'text-blue-600' }
    if (bmiValue < 25) return { text: 'Normal', color: 'text-green-600' }
    if (bmiValue < 30) return { text: 'Overweight', color: 'text-yellow-600' }
    return { text: 'Obese', color: 'text-red-600' }
  }

  // Check if values are abnormal (VT-009)
  const isAbnormal = {
    systolicBp: vitals.systolicBp ? (parseFloat(vitals.systolicBp as string) > 140 || parseFloat(vitals.systolicBp as string) < 90) : false,
    diastolicBp: vitals.diastolicBp ? (parseFloat(vitals.diastolicBp as string) > 90 || parseFloat(vitals.diastolicBp as string) < 60) : false,
    heartRate: vitals.heartRate ? (parseFloat(vitals.heartRate as string) > 100 || parseFloat(vitals.heartRate as string) < 60) : false,
    temperature: vitals.temperature ? (parseFloat(vitals.temperature as string) > 38 || parseFloat(vitals.temperature as string) < 36) : false,
    respiratoryRate: vitals.respiratoryRate ? (parseFloat(vitals.respiratoryRate as string) > 20 || parseFloat(vitals.respiratoryRate as string) < 12) : false,
    oxygenSaturation: vitals.oxygenSaturation ? parseFloat(vitals.oxygenSaturation as string) < 95 : false,
  }

  const getAbnormalityWarning = (field: string): string => {
    switch (field) {
      case 'systolicBp':
        return vitals.systolicBp ? (parseFloat(vitals.systolicBp as string) > 140 ? 'High systolic BP' : 'Low systolic BP') : ''
      case 'diastolicBp':
        return vitals.diastolicBp ? (parseFloat(vitals.diastolicBp as string) > 90 ? 'High diastolic BP' : 'Low diastolic BP') : ''
      case 'heartRate':
        return vitals.heartRate ? (parseFloat(vitals.heartRate as string) > 100 ? 'Tachycardia' : 'Bradycardia') : ''
      case 'temperature':
        return vitals.temperature ? (parseFloat(vitals.temperature as string) > 38 ? 'Fever' : 'Hypothermia') : ''
      case 'respiratoryRate':
        return vitals.respiratoryRate ? (parseFloat(vitals.respiratoryRate as string) > 20 ? 'Tachypnea' : 'Bradypnea') : ''
      case 'oxygenSaturation':
        return 'Low oxygen saturation'
      default:
        return ''
    }
  }

  // Quick fill presets (VT-008)
  const fillNormalAdult = () => {
    const newVitals = {
      ...vitals,
      systolicBp: 120,
      diastolicBp: 80,
      heartRate: 72,
      temperature: 37.0,
      respiratoryRate: 16,
      oxygenSaturation: 98,
    }
    setVitals(newVitals)
    if (onVitalsRecorded) {
      onVitalsRecorded(newVitals)
    }
  }

  const fillPediatricNormal = () => {
    const newVitals = {
      ...vitals,
      systolicBp: 100,
      diastolicBp: 60,
      heartRate: 100,
      temperature: 37.0,
      respiratoryRate: 24,
      oxygenSaturation: 98,
    }
    setVitals(newVitals)
    if (onVitalsRecorded) {
      onVitalsRecorded(newVitals)
    }
  }

  // Load previous visit vitals (VT-010)
  const loadPreviousVitals = () => {
    if (previousVitals?.weight || previousVitals?.height) {
      const newVitals = {
        ...vitals,
        weight: previousVitals.weight || vitals.weight,
        height: previousVitals.height || vitals.height,
      }
      setVitals(newVitals)
      if (previousVitals.weight && previousVitals.height) {
        const weight = parseFloat(previousVitals.weight as unknown as string)
        const height = parseFloat(previousVitals.height as unknown as string)
        setBmi(calculateBMI(weight, height))
      }
      if (onVitalsRecorded) {
        onVitalsRecorded(newVitals)
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Vital Signs</h3>
          <p className="text-sm text-gray-600">Record patient measurements</p>
        </div>
      </div>

      {/* Quick-Fill Presets (VT-008) */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={fillNormalAdult}
          className="px-4 py-2 rounded-full text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
        >
          Normal Adult
        </button>
        <button
          onClick={fillPediatricNormal}
          className="px-4 py-2 rounded-full text-sm font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
        >
          Pediatric Normal
        </button>
      </div>

      {/* Vital Signs Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Blood Pressure */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            BP (mmHg)
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                type="number"
                value={vitals.systolicBp}
                onChange={(e) => handleChange('systolicBp', e.target.value)}
                placeholder="120"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none ${
                  isAbnormal.systolicBp ? 'border-red-500 bg-red-50' : 'border-gray-300'
                }`}
              />
              {isAbnormal.systolicBp && <div className="text-xs text-red-600 mt-1">{getAbnormalityWarning('systolicBp')}</div>}
            </div>
            <span className="text-gray-500">/</span>
            <div className="flex-1">
              <input
                type="number"
                value={vitals.diastolicBp}
                onChange={(e) => handleChange('diastolicBp', e.target.value)}
                placeholder="80"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none ${
                  isAbnormal.diastolicBp ? 'border-red-500 bg-red-50' : 'border-gray-300'
                }`}
              />
              {isAbnormal.diastolicBp && <div className="text-xs text-red-600 mt-1">{getAbnormalityWarning('diastolicBp')}</div>}
            </div>
          </div>
        </div>

        {/* Heart Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Heart Rate (bpm)
          </label>
          <input
            type="number"
            value={vitals.heartRate}
            onChange={(e) => handleChange('heartRate', e.target.value)}
            placeholder="72"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none ${
              isAbnormal.heartRate ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
          />
          {isAbnormal.heartRate && <div className="text-xs text-red-600 mt-1">{getAbnormalityWarning('heartRate')}</div>}
        </div>

        {/* Temperature */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Temp (°C)
          </label>
          <input
            type="number"
            step="0.1"
            value={vitals.temperature}
            onChange={(e) => handleChange('temperature', e.target.value)}
            placeholder="37.0"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none ${
              isAbnormal.temperature ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
          />
          {isAbnormal.temperature && <div className="text-xs text-red-600 mt-1">{getAbnormalityWarning('temperature')}</div>}
        </div>

        {/* Respiratory Rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            RR (breaths/min)
          </label>
          <input
            type="number"
            value={vitals.respiratoryRate}
            onChange={(e) => handleChange('respiratoryRate', e.target.value)}
            placeholder="16"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none ${
              isAbnormal.respiratoryRate ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
          />
          {isAbnormal.respiratoryRate && <div className="text-xs text-red-600 mt-1">{getAbnormalityWarning('respiratoryRate')}</div>}
        </div>

        {/* Oxygen Saturation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            SpO₂ (%)
          </label>
          <input
            type="number"
            value={vitals.oxygenSaturation}
            onChange={(e) => handleChange('oxygenSaturation', e.target.value)}
            placeholder="98"
            max="100"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 outline-none ${
              isAbnormal.oxygenSaturation ? 'border-red-500 bg-red-50' : 'border-gray-300'
            }`}
          />
          {isAbnormal.oxygenSaturation && <div className="text-xs text-red-600 mt-1">{getAbnormalityWarning('oxygenSaturation')}</div>}
        </div>

        {/* Weight */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Weight (kg)
          </label>
          <input
            type="number"
            step="0.1"
            value={vitals.weight}
            onChange={(e) => handleChange('weight', e.target.value)}
            placeholder="70.0"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>

        {/* Height */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Height (cm)
          </label>
          <input
            type="number"
            value={vitals.height}
            onChange={(e) => handleChange('height', e.target.value)}
            placeholder="170"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
          />
        </div>

        {/* BMI (Auto-calculated) */}
        {bmi && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BMI
            </label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="font-semibold text-gray-900">{bmi}</div>
              <div className={`text-xs ${getBMICategory(bmi).color}`}>
                {getBMICategory(bmi).text}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Load Previous Visit Vitals (VT-010) */}
      {previousVitals && (previousVitals.weight || previousVitals.height) && (
        <button
          onClick={loadPreviousVitals}
          className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
        >
          Load from last visit
        </button>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes (Optional)
        </label>
        <textarea
          value={vitals.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={2}
          placeholder="Additional observations..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        />
      </div>

      {/* Quick Reference Ranges */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="text-sm font-medium text-blue-900 mb-2">📊 Normal Ranges</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-blue-800">
          <div>BP: 90-120/60-80 mmHg</div>
          <div>HR: 60-100 bpm</div>
          <div>Temp: 36.5-37.5°C</div>
          <div>RR: 12-20 /min</div>
          <div>SpO₂: ≥95%</div>
          <div>BMI: 18.5-24.9</div>
        </div>
      </div>
    </div>
  )
}
