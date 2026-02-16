import { requireRole } from '@/lib/auth/session'
import PatientRegistrationForm from '@/components/frontdesk/PatientRegistrationForm'

export default async function FrontdeskPatientRegisterPage() {
  await requireRole('frontdesk')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Register New Patient
        </h1>
        <p className="text-gray-600">
          Create a walk-in patient profile and assign the primary doctor.
        </p>
      </div>

      <PatientRegistrationForm />
    </div>
  )
}
