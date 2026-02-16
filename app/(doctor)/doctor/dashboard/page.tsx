import { requireRole } from '@/lib/auth/session'
import { getDoctorProfile } from '@/lib/data/users'
import { getTodayAppointments } from '@/lib/data/appointments'
import AppointmentsList from '@/components/doctor/AppointmentsList'
import Link from 'next/link'

export default async function DoctorDashboardPage() {
  const user = await requireRole('doctor')
  const profile = await getDoctorProfile(user.id)
  
  // Fetch today's appointments
  const appointments = await getTodayAppointments(user.id)
  const dashboardAppointments = appointments.map((appointment) => ({
    id: appointment.id,
    patient_id: appointment.patient_id,
    patient_name: appointment.patient?.full_name || 'Unknown Patient',
    patient_phone: appointment.patient?.phone || undefined,
    patient_age: appointment.patient?.age || undefined,
    patient_sex: appointment.patient?.sex || undefined,
    start_time: appointment.start_time,
    duration_minutes: appointment.duration_minutes,
    status: appointment.status,
  }))

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Welcome, Dr. {profile.full_name || 'Doctor'}!
        </h1>
        <p className="text-gray-600">
          Your unique ID: <span className="font-mono font-semibold text-primary-600">{profile.unique_id}</span>
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Specialty: {profile.specialty.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
        </p>
      </div>

      {/* Today's Appointments */}
      <AppointmentsList appointments={dashboardAppointments} />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Link
          href="/doctor/session"
          className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">New Clinical Session</h3>
          <p className="text-sm text-white/80">
            Document a patient visit (≤45s target)
          </p>
        </Link>

        <Link
          href="/doctor/patients"
          className="bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-400 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">My Patients</h3>
          <p className="text-sm text-gray-600">
            View patient history and records
          </p>
        </Link>

        <Link
          href="/doctor/lab-orders"
          className="bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-400 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Lab Orders</h3>
          <p className="text-sm text-gray-600">
            Manage lab tests and results
          </p>
        </Link>

        <Link
          href="/doctor/imaging-orders"
          className="bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-400 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Imaging Orders</h3>
          <p className="text-sm text-gray-600">
            Order and track X-ray, CT, MRI, and ultrasound studies
          </p>
        </Link>

        <Link
          href="/doctor/schedule"
          className="bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <svg className="w-5 h-5 text-gray-400 transform group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Schedule</h3>
          <p className="text-sm text-gray-600">
            Manage your appointments
          </p>
        </Link>
      </div>

      {/* Gate 3 Status */}
      <div className="bg-success-50 border-2 border-success-200 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-success-500 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-success-900 mb-2">
              🎉 Gate 3: Clinical Session - Complete!
            </h3>
            <p className="text-success-800 text-sm mb-3">
              Click "New Clinical Session" above to start documenting patient visits.
            </p>
            <div className="space-y-1 text-sm text-success-700">
              <p>✅ Session timer & keystroke counter active</p>
              <p>✅ Patient search ready</p>
              <p>✅ Template-based workflow enabled</p>
              <p>✅ Target: ≤45 seconds, ≤10 keystrokes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
