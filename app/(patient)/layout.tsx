import { requireRole } from '@/lib/auth/session'
import { getPatientProfile } from '@/lib/data/users'
import Link from 'next/link'
import { TourProvider } from '@/components/ui/OnboardingTour'
import { ShefaPatientLayout } from '@/components/ai/ShefaPatientLayout'

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireRole('patient')
  const profile = await getPatientProfile(user.id)

  return (
    <ShefaPatientLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center gap-8">
                <Link href="/patient/dashboard" className="text-2xl font-bold text-secondary-600">
                  MedAssist
                </Link>
                <nav className="hidden md:flex gap-6">
                  <Link
                    href="/patient/dashboard"
                    className="text-gray-700 hover:text-secondary-600 font-medium"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/patient/diary"
                    className="text-gray-700 hover:text-secondary-600 font-medium"
                  >
                    Diary
                  </Link>
                  <Link
                    href="/patient/medications"
                    className="text-gray-700 hover:text-secondary-600 font-medium"
                  >
                    Medications
                  </Link>
                  <Link
                    href="/patient/labs"
                    className="text-gray-700 hover:text-secondary-600 font-medium"
                  >
                    Lab Results
                  </Link>
                  <Link
                    href="/patient/records"
                    className="text-gray-700 hover:text-secondary-600 font-medium"
                  >
                    Records
                  </Link>
                  <Link
                    href="/patient/sharing"
                    className="text-gray-700 hover:text-secondary-600 font-medium"
                  >
                    Sharing
                  </Link>
                  <Link
                    href="/patient/messages"
                    className="text-gray-700 hover:text-secondary-600 font-medium"
                  >
                    Messages
                  </Link>
                </nav>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">{user.phone}</p>
                  <p className="text-xs text-gray-500">Patient</p>
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
          <TourProvider>
            {children}
          </TourProvider>
        </main>
      </div>
    </ShefaPatientLayout>
  )
}
