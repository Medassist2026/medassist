import { requireRole } from '@/lib/auth/session'
import Link from 'next/link'

export default async function FrontDeskLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireRole('frontdesk')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-xl font-bold text-primary-600">MedAssist</h1>
                <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded">
                  Front Desk
                </span>
              </div>
              <div className="ml-6 flex space-x-8">
                <Link
                  href="/frontdesk/dashboard"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 border-b-2 border-transparent hover:border-primary-500"
                >
                  Dashboard
                </Link>
                <Link
                  href="/frontdesk/checkin"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:border-primary-500 hover:text-gray-900"
                >
                  Check-In
                </Link>
                <Link
                  href="/frontdesk/appointments/new"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:border-primary-500 hover:text-gray-900"
                >
                  Appointments
                </Link>
                <Link
                  href="/frontdesk/payments/new"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:border-primary-500 hover:text-gray-900"
                >
                  Payments
                </Link>
              </div>
            </div>
            <div className="flex items-center">
              <form action="/api/auth/logout" method="POST">
                <button
                  type="submit"
                  className="ml-3 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
