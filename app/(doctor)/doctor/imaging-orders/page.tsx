'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type ImagingModality = 'xray' | 'ct' | 'mri' | 'ultrasound' | 'other'
type ImagingPriority = 'routine' | 'urgent' | 'stat'
type ImagingStatus = 'requested' | 'scheduled' | 'completed' | 'cancelled'

interface DoctorPatient {
  id: string
  name: string
  phone: string
}

interface ImagingOrder {
  id: string
  patient_id: string
  modality: ImagingModality
  study_name: string
  clinical_indication: string | null
  priority: ImagingPriority
  status: ImagingStatus
  facility_name: string | null
  ordered_at: string
  scheduled_for: string | null
  completed_at: string | null
  patient?: {
    id: string
    full_name: string
    phone: string
  } | null
}

const MODALITY_LABELS: Record<ImagingModality, string> = {
  xray: 'X-ray',
  ct: 'CT',
  mri: 'MRI',
  ultrasound: 'Ultrasound',
  other: 'Other'
}

export default function DoctorImagingOrdersPage() {
  const [patients, setPatients] = useState<DoctorPatient[]>([])
  const [orders, setOrders] = useState<ImagingOrder[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | ImagingStatus>('all')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    patient_id: '',
    modality: 'xray' as ImagingModality,
    study_name: '',
    clinical_indication: '',
    priority: 'routine' as ImagingPriority,
    facility_name: '',
    scheduled_for: ''
  })

  const loadPatients = useCallback(async () => {
    const res = await fetch('/api/doctor/patients')
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load patients')
    const mapped = (data.patients || []).map((item: any) => ({
      id: item.id,
      name: item.name || item.full_name || 'Unknown Patient',
      phone: item.phone || ''
    }))
    setPatients(mapped)
  }, [])

  const loadOrders = useCallback(async () => {
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)

    const res = await fetch(`/api/doctor/imaging-orders?${params.toString()}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to load imaging orders')
    setOrders(data.orders || [])
  }, [statusFilter])

  useEffect(() => {
    const load = async () => {
      try {
        setError('')
        setLoading(true)
        await Promise.all([loadPatients(), loadOrders()])
      } catch (err: any) {
        setError(err.message || 'Failed to load imaging module')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [loadPatients, loadOrders])

  const statusCounts = useMemo(() => ({
    all: orders.length,
    requested: orders.filter((o) => o.status === 'requested').length,
    scheduled: orders.filter((o) => o.status === 'scheduled').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    cancelled: orders.filter((o) => o.status === 'cancelled').length
  }), [orders])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.patient_id || !form.study_name.trim()) return

    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/doctor/imaging-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          study_name: form.study_name.trim(),
          clinical_indication: form.clinical_indication.trim() || null,
          facility_name: form.facility_name.trim() || null,
          scheduled_for: form.scheduled_for || null
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create imaging order')

      setForm({
        patient_id: '',
        modality: 'xray',
        study_name: '',
        clinical_indication: '',
        priority: 'routine',
        facility_name: '',
        scheduled_for: ''
      })
      await loadOrders()
    } catch (err: any) {
      setError(err.message || 'Failed to create imaging order')
    } finally {
      setSubmitting(false)
    }
  }

  const statusBadgeClass = (status: ImagingStatus) => {
    if (status === 'requested') return 'bg-blue-100 text-blue-700'
    if (status === 'scheduled') return 'bg-purple-100 text-purple-700'
    if (status === 'completed') return 'bg-green-100 text-green-700'
    return 'bg-gray-100 text-gray-700'
  }

  const priorityClass = (priority: ImagingPriority) => {
    if (priority === 'stat') return 'text-red-700 font-semibold'
    if (priority === 'urgent') return 'text-orange-700 font-semibold'
    return 'text-gray-700'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[360px]">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Imaging Orders</h1>
        <p className="text-gray-600 mt-1">Order and track X-ray, CT, MRI, and ultrasound studies</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Create Imaging Order</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <select
            value={form.patient_id}
            onChange={(e) => setForm((prev) => ({ ...prev, patient_id: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
            required
          >
            <option value="">Select patient</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.name} {patient.phone ? `(${patient.phone})` : ''}
              </option>
            ))}
          </select>

          <select
            value={form.modality}
            onChange={(e) => setForm((prev) => ({ ...prev, modality: e.target.value as ImagingModality }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            {Object.entries(MODALITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={form.priority}
            onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as ImagingPriority }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="stat">STAT</option>
          </select>
        </div>

        <input
          value={form.study_name}
          onChange={(e) => setForm((prev) => ({ ...prev, study_name: e.target.value }))}
          placeholder="Study name (e.g., Chest PA/Lateral)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          required
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={form.facility_name}
            onChange={(e) => setForm((prev) => ({ ...prev, facility_name: e.target.value }))}
            placeholder="Preferred facility (optional)"
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
          <input
            type="datetime-local"
            value={form.scheduled_for}
            onChange={(e) => setForm((prev) => ({ ...prev, scheduled_for: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <textarea
          value={form.clinical_indication}
          onChange={(e) => setForm((prev) => ({ ...prev, clinical_indication: e.target.value }))}
          placeholder="Clinical indication / reason for study"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? 'Ordering...' : 'Create Imaging Order'}
        </button>
      </form>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'requested', 'scheduled', 'completed', 'cancelled'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-lg border ${
              statusFilter === status
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {status[0].toUpperCase() + status.slice(1)} ({statusCounts[status]})
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {orders.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No imaging orders found for this filter.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {orders.map((order) => (
              <div key={order.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {MODALITY_LABELS[order.modality]} - {order.study_name}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      Patient: {order.patient?.full_name || 'Unknown'} {order.patient?.phone ? `(${order.patient.phone})` : ''}
                    </p>
                    {order.clinical_indication && (
                      <p className="text-sm text-gray-600 mt-1">{order.clinical_indication}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Ordered: {new Date(order.ordered_at).toLocaleString()}
                      {order.scheduled_for ? ` • Scheduled: ${new Date(order.scheduled_for).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <div className="text-right space-y-2">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusBadgeClass(order.status)}`}>
                      {order.status}
                    </span>
                    <p className={`text-xs ${priorityClass(order.priority)}`}>{order.priority.toUpperCase()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
