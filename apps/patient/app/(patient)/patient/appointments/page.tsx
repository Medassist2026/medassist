'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// ============================================================================
// TYPES
// ============================================================================

interface Appointment {
  id: string
  start_time: string
  duration_minutes: number
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
  doctor_name: string
  doctor_specialty: string
  clinic_name: string
}

// ============================================================================
// STATUS BADGE COMPONENT
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    scheduled: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      label: 'Scheduled'
    },
    completed: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      label: 'Completed'
    },
    cancelled: {
      bg: 'bg-red-100',
      text: 'text-red-700',
      label: 'Cancelled'
    },
    no_show: {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      label: 'No Show'
    }
  }

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.scheduled

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

// ============================================================================
// APPOINTMENT CARD COMPONENT
// ============================================================================

function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const appointmentDate = new Date(appointment.start_time)
  const formattedDate = appointmentDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
  const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })

  // Get specialty badge color
  const getSpecialtyColor = (specialty: string) => {
    switch (specialty) {
      case 'general-practitioner':
        return 'bg-blue-50'
      case 'pediatrics':
        return 'bg-pink-50'
      case 'cardiology':
        return 'bg-red-50'
      case 'endocrinology':
        return 'bg-primary-50'
      default:
        return 'bg-gray-50'
    }
  }

  const getSpecialtyLabel = (specialty: string) => {
    const labels: Record<string, string> = {
      'general-practitioner': 'General Practice',
      'pediatrics': 'Pediatrics',
      'cardiology': 'Cardiology',
      'endocrinology': 'Endocrinology'
    }
    return labels[specialty] || specialty
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {/* Date and Time */}
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium text-gray-900">
              {formattedDate} at {formattedTime}
            </span>
          </div>

          {/* Doctor Information */}
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div>
                <p className="font-medium text-gray-900">Dr. {appointment.doctor_name}</p>
                <p className="text-sm text-gray-500">{getSpecialtyLabel(appointment.doctor_specialty)}</p>
              </div>
            </div>
          </div>

          {/* Clinic Information */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            </svg>
            <span>{appointment.clinic_name}</span>
          </div>

          {/* Duration */}
          <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{appointment.duration_minutes} minutes</span>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex flex-col items-end gap-3">
          <StatusBadge status={appointment.status} />

          {/* Action Button */}
          {appointment.status === 'scheduled' && (
            <button className="text-sm px-3 py-1 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
              Reschedule
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN APPOINTMENTS PAGE
// ============================================================================

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAppointments = async () => {
      try {
        const res = await fetch('/api/patient/appointments')
        if (!res.ok) {
          throw new Error('Failed to load appointments')
        }
        const data = await res.json()
        setAppointments(data.appointments || [])
      } catch (err) {
        console.error('Error loading appointments:', err)
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    loadAppointments()
  }, [])

  // Separate appointments into upcoming and past
  const now = new Date()
  const upcomingAppointments = appointments.filter(
    apt => new Date(apt.start_time) >= now && apt.status === 'scheduled'
  )
  const pastAppointments = appointments.filter(
    apt => new Date(apt.start_time) < now || apt.status !== 'scheduled'
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Appointments</h1>
        <p className="text-gray-600 mt-1">View and manage your doctor visits</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* No Appointments */}
      {appointments.length === 0 && !error && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No appointments yet</h3>
          <p className="text-gray-600 text-sm mb-4">You don't have any scheduled appointments</p>
          <Link
            href="/patient/dashboard"
            className="inline-block px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      )}

      {/* Upcoming Appointments */}
      {upcomingAppointments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Appointments</h2>
          <div className="space-y-3">
            {upcomingAppointments.map(apt => (
              <AppointmentCard key={apt.id} appointment={apt} />
            ))}
          </div>
        </div>
      )}

      {/* Past Appointments */}
      {pastAppointments.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Appointments</h2>
          <div className="space-y-3">
            {pastAppointments.map(apt => (
              <AppointmentCard key={apt.id} appointment={apt} />
            ))}
          </div>
        </div>
      )}

      {/* Quick Links */}
      {appointments.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mt-6">
          <Link
            href="/patient/dashboard"
            className="bg-white rounded-lg border border-gray-200 p-4 text-center hover:border-primary-300 transition-colors"
          >
            <svg className="w-6 h-6 text-primary-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 11l4-4m-9-8l7-4 7 4" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Dashboard</span>
          </Link>

          <Link
            href="/patient/messages"
            className="bg-white rounded-lg border border-gray-200 p-4 text-center hover:border-primary-300 transition-colors"
          >
            <svg className="w-6 h-6 text-primary-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">Messages</span>
          </Link>
        </div>
      )}
    </div>
  )
}
