'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Condition {
  id: string
  name: string
  diagnosed_date: string
  status: 'active' | 'resolved'
}

interface Allergy {
  id: string
  allergen: string
  reaction: string
  severity: 'mild' | 'moderate' | 'severe'
  recorded_date: string
}

interface Immunization {
  id: string
  vaccine_name: string
  administered_date: string
  provider_name?: string | null
}

export default function PatientConditionsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [conditions, setConditions] = useState<Condition[]>([])
  const [allergies, setAllergies] = useState<Allergy[]>([])
  const [immunizations, setImmunizations] = useState<Immunization[]>([])
  const [saving, setSaving] = useState(false)

  const [newCondition, setNewCondition] = useState({ name: '', status: 'active' as 'active' | 'resolved' })
  const [newAllergy, setNewAllergy] = useState({ allergen: '', reaction: '', severity: 'moderate' as 'mild' | 'moderate' | 'severe' })
  const [newImmunization, setNewImmunization] = useState({ vaccine_name: '', provider_name: '' })

  const loadAll = async () => {
    try {
      setError('')
      const [conditionsRes, allergiesRes, immunizationsRes] = await Promise.all([
        fetch('/api/patient/conditions'),
        fetch('/api/patient/allergies'),
        fetch('/api/patient/immunizations')
      ])

      const [conditionsData, allergiesData, immunizationsData] = await Promise.all([
        conditionsRes.json(),
        allergiesRes.json(),
        immunizationsRes.json()
      ])

      if (!conditionsRes.ok) throw new Error(conditionsData.error || 'Failed to load conditions')
      if (!allergiesRes.ok) throw new Error(allergiesData.error || 'Failed to load allergies')
      if (!immunizationsRes.ok) throw new Error(immunizationsData.error || 'Failed to load immunizations')

      setConditions(conditionsData.conditions || [])
      setAllergies(allergiesData.allergies || [])
      setImmunizations(immunizationsData.immunizations || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load health history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const submitCondition = async () => {
    if (!newCondition.name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/patient/conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCondition)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add condition')
      setNewCondition({ name: '', status: 'active' })
      await loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to add condition')
    } finally {
      setSaving(false)
    }
  }

  const submitAllergy = async () => {
    if (!newAllergy.allergen.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/patient/allergies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAllergy)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add allergy')
      setNewAllergy({ allergen: '', reaction: '', severity: 'moderate' })
      await loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to add allergy')
    } finally {
      setSaving(false)
    }
  }

  const submitImmunization = async () => {
    if (!newImmunization.vaccine_name.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/patient/immunizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newImmunization)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add immunization')
      setNewImmunization({ vaccine_name: '', provider_name: '' })
      await loadAll()
    } catch (err: any) {
      setError(err.message || 'Failed to add immunization')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[320px]">
        <div className="animate-spin w-8 h-8 border-4 border-secondary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Conditions & Safety</h1>
          <p className="text-gray-600 mt-1">Track conditions, allergies, and immunizations in one place</p>
        </div>
        <Link
          href="/patient/records"
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Back to Records
        </Link>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Conditions</h2>
          <div className="space-y-2">
            <input
              value={newCondition.name}
              onChange={(e) => setNewCondition((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Add condition (e.g., Hypertension)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <select
              value={newCondition.status}
              onChange={(e) => setNewCondition((prev) => ({ ...prev, status: e.target.value as 'active' | 'resolved' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
            </select>
            <button
              onClick={submitCondition}
              disabled={saving}
              className="w-full px-3 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 disabled:opacity-50"
            >
              Add Condition
            </button>
          </div>
          <div className="space-y-2">
            {conditions.length === 0 ? (
              <p className="text-sm text-gray-500">No conditions recorded.</p>
            ) : (
              conditions.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.status === 'active' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{new Date(item.diagnosed_date).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Allergies</h2>
          <div className="space-y-2">
            <input
              value={newAllergy.allergen}
              onChange={(e) => setNewAllergy((prev) => ({ ...prev, allergen: e.target.value }))}
              placeholder="Allergen (e.g., Penicillin)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              value={newAllergy.reaction}
              onChange={(e) => setNewAllergy((prev) => ({ ...prev, reaction: e.target.value }))}
              placeholder="Reaction (e.g., Rash)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <select
              value={newAllergy.severity}
              onChange={(e) => setNewAllergy((prev) => ({ ...prev, severity: e.target.value as 'mild' | 'moderate' | 'severe' }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="mild">Mild</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
            <button
              onClick={submitAllergy}
              disabled={saving}
              className="w-full px-3 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 disabled:opacity-50"
            >
              Add Allergy
            </button>
          </div>
          <div className="space-y-2">
            {allergies.length === 0 ? (
              <p className="text-sm text-gray-500">No allergies recorded.</p>
            ) : (
              allergies.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">{item.allergen}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.severity === 'severe' ? 'bg-red-100 text-red-700' : item.severity === 'moderate' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                      {item.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{item.reaction}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Immunizations</h2>
          <div className="space-y-2">
            <input
              value={newImmunization.vaccine_name}
              onChange={(e) => setNewImmunization((prev) => ({ ...prev, vaccine_name: e.target.value }))}
              placeholder="Vaccine name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <input
              value={newImmunization.provider_name}
              onChange={(e) => setNewImmunization((prev) => ({ ...prev, provider_name: e.target.value }))}
              placeholder="Provider / Clinic (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              onClick={submitImmunization}
              disabled={saving}
              className="w-full px-3 py-2 bg-secondary-600 text-white rounded-lg hover:bg-secondary-700 disabled:opacity-50"
            >
              Add Immunization
            </button>
          </div>
          <div className="space-y-2">
            {immunizations.length === 0 ? (
              <p className="text-sm text-gray-500">No immunizations recorded.</p>
            ) : (
              immunizations.map((item) => (
                <div key={item.id} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <p className="font-medium text-gray-900">{item.vaccine_name}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(item.administered_date).toLocaleDateString()}</p>
                  {item.provider_name && <p className="text-sm text-gray-700 mt-1">{item.provider_name}</p>}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
