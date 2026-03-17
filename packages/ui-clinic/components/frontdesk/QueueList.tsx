'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface QueueItem {
  id: string
  queue_number: number
  queue_type: string
  status: string
  checked_in_at: string
  patient: {
    full_name: string | null
    phone: string
    age: number | null
    sex: string | null
  }
  doctor: {
    full_name: string | null
    specialty: string
  }
}

interface QueueListProps {
  queue: QueueItem[]
}

export default function QueueList({ queue }: QueueListProps) {
  const router = useRouter()
  const [updating, setUpdating] = useState<string | null>(null)
  const [doctorFilter, setDoctorFilter] = useState<string>('all')

  // Get unique doctors from queue for filter tabs
  const uniqueDoctors = Array.from(
    new Map(
      queue.map(item => [
        item.doctor?.full_name || 'Unknown',
        { name: item.doctor?.full_name || 'Unknown', specialty: item.doctor?.specialty || '' }
      ])
    ).entries()
  ).map(([name, info]) => ({ name, specialty: info.specialty }))

  // Filter queue by selected doctor
  const filteredQueue = doctorFilter === 'all'
    ? queue
    : queue.filter(item => (item.doctor?.full_name || 'Unknown') === doctorFilter)

  // Count waiting per doctor
  const getWaitingCount = (doctorName: string) =>
    queue.filter(item =>
      (item.doctor?.full_name || 'Unknown') === doctorName && item.status === 'waiting'
    ).length

  const updateStatus = async (queueId: string, status: string) => {
    setUpdating(queueId)
    try {
      const response = await fetch('/api/frontdesk/queue/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, status })
      })

      if (!response.ok) {
        throw new Error('Failed to update status')
      }

      router.refresh()
    } catch (error) {
      console.error('Update error:', error)
      alert('Failed to update status')
    } finally {
      setUpdating(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'waiting':
        return 'bg-yellow-100 text-yellow-800'
      case 'in_progress':
        return 'bg-blue-100 text-blue-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'appointment':
        return 'bg-primary-100 text-primary-800'
      case 'walkin':
        return 'bg-primary-100 text-primary-800'
      case 'emergency':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (queue.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          No Patients in Queue
        </h3>
        <p className="text-gray-600">
          Check in patients to see them here
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Check-In Queue
          </h2>
          <span className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium">
            {filteredQueue.length} patients
          </span>
        </div>

        {/* Doctor Filter Tabs */}
        {uniqueDoctors.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setDoctorFilter('all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                doctorFilter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All ({queue.filter(q => q.status === 'waiting').length})
            </button>
            {uniqueDoctors.map(doc => (
              <button
                key={doc.name}
                onClick={() => setDoctorFilter(doc.name)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  doctorFilter === doc.name
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Dr. {doc.name.replace(/^Dr\.?\s*/i, '')} ({getWaitingCount(doc.name)})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Queue List */}
      <div className="divide-y divide-gray-100">
        {filteredQueue.map((item) => (
          <div key={item.id} className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              {/* Left: Patient Info */}
              <div className="flex items-start gap-4 flex-1">
                {/* Queue Number */}
                <div className="w-12 h-12 bg-primary-600 text-white rounded-lg flex items-center justify-center font-bold text-lg">
                  {item.queue_number}
                </div>

                {/* Patient Details */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">
                      {item.patient.full_name || 'Unnamed Patient'}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getTypeColor(item.queue_type)}`}>
                      {item.queue_type.toUpperCase()}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                      {item.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                    <div>
                      <span className="font-medium">Phone:</span> {item.patient.phone}
                    </div>
                    {item.patient.age && (
                      <div>
                        <span className="font-medium">Age:</span> {item.patient.age} years
                      </div>
                    )}
                    {item.patient.sex && (
                      <div>
                        <span className="font-medium">Sex:</span> {item.patient.sex}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Doctor:</span> {item.doctor.full_name || 'Dr. Unknown'}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    Checked in: {new Date(item.checked_in_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex gap-2 ml-4">
                {item.status === 'waiting' && (
                  <button
                    onClick={() => updateStatus(item.id, 'in_progress')}
                    disabled={updating === item.id}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {updating === item.id ? 'Calling...' : 'Call Next'}
                  </button>
                )}
                {item.status === 'in_progress' && (
                  <button
                    onClick={() => updateStatus(item.id, 'completed')}
                    disabled={updating === item.id}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {updating === item.id ? 'Completing...' : 'Complete'}
                  </button>
                )}
                {item.status !== 'completed' && item.status !== 'cancelled' && (
                  <button
                    onClick={() => updateStatus(item.id, 'cancelled')}
                    disabled={updating === item.id}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
