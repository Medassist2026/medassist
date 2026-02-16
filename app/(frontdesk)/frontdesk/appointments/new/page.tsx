import { requireRole } from '@/lib/auth/session'
import AppointmentBookingForm from '@/components/frontdesk/AppointmentBookingForm'

export default async function NewAppointmentPage() {
  await requireRole('frontdesk')

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Schedule New Appointment
        </h1>
        <p className="text-gray-600">
          Book patient appointment with available doctor time slots
        </p>
      </div>

      {/* Booking Form */}
      <AppointmentBookingForm />
    </div>
  )
}
