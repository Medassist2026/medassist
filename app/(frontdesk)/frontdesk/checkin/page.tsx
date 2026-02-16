import { requireRole } from '@/lib/auth/session'
import CheckInForm from '@/components/frontdesk/CheckInForm'

export default async function CheckInPage() {
  await requireRole('frontdesk')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Patient Check-In
        </h1>
        <p className="text-gray-600">
          Search for existing patient or register new walk-in patient
        </p>
      </div>

      {/* Check-In Form */}
      <CheckInForm />
    </div>
  )
}
