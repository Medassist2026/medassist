import { requireRole } from '@/lib/auth/session'
import { getDoctorProfile } from '@/lib/data/users'
import Link from 'next/link'
import { DoctorAILayout } from '@/components/ai/DoctorAI'

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireRole('doctor')
  const profile = await getDoctorProfile(user.id)

  return (
    <DoctorAILayout doctorName={user.phone}>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-8">
                <Link href="/doctor/dashboard" className="text-2xl font-bold text-primary-600">
                  MedAssist
                </Link>
                <nav className="hidden md:flex gap-6">
                  <Link
                    href="/doctor/dashboard"
                    className="text-gray-700 hover:text-primary-600 font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/doctor/patients"
                    className="text-gray-700 hover:text-primary-600 font-medium"
                  >
                    Patients
                  </Link>
                  <Link
                    href="/doctor/schedule"
                    className="text-gray-700 hover:text-primary-600 font-medium"
                  >
                    Schedule
                  </Link>
                  <Link
                    href="/doctor/imaging-orders"
                    className="text-gray-700 hover:text-primary-600 font-medium"
                  >
                    Imaging
                  </Link>
                  <Link
                    href="/doctor/messages"
                    className="text-gray-700 hover:text-primary-600 font-medium"
                  >
                    Messages
                  </Link>
                </nav>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">Dr. {user.phone}</p>
                  <p className="text-xs text-gray-500 capitalize">
                    {profile.specialty.replace('-', ' ')}
                  </p>
                </div>
                <form action="/api/auth/logout" method="POST">
                  <button
                    type="submit"
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </DoctorAILayout>
  )
}
