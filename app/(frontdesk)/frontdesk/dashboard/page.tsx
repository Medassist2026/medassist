import { requireRole } from '@/lib/auth/session'
import { getTodayQueue, getTodayPayments, getPaymentStats } from '@/lib/data/frontdesk'
import Link from 'next/link'
import QueueList from '@/components/frontdesk/QueueList'
import TodayStats from '@/components/frontdesk/TodayStats'

export default async function FrontDeskDashboardPage() {
  const user = await requireRole('frontdesk')
  
  // Fetch today's data
  const queue = await getTodayQueue()
  const payments = await getTodayPayments()
  const stats = await getPaymentStats(
    new Date().toISOString().split('T')[0], // today
    new Date().toISOString().split('T')[0]
  )

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Front Desk Dashboard
        </h1>
        <p className="text-gray-600">
          Manage patient check-ins, appointments, and payments
        </p>
      </div>

      {/* Today's Statistics */}
      <TodayStats 
        queue={queue}
        payments={payments}
        stats={stats}
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Link
          href="/frontdesk/checkin"
          className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">Check-In Patient</h3>
          <p className="text-sm text-white/80">
            Register arrival and add to queue
          </p>
        </Link>

        <Link
          href="/frontdesk/appointments/new"
          className="bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">New Appointment</h3>
          <p className="text-sm text-gray-600">
            Schedule patient appointment
          </p>
        </Link>

        <Link
          href="/frontdesk/payments/new"
          className="bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Record Payment</h3>
          <p className="text-sm text-gray-600">
            Collect consultation fee
          </p>
        </Link>

        <Link
          href="/frontdesk/patients/register"
          className="bg-white hover:bg-gray-50 border-2 border-gray-200 rounded-xl p-6 transition-colors group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Register Patient</h3>
          <p className="text-sm text-gray-600">
            Add new patient to system
          </p>
        </Link>
      </div>

      {/* Check-In Queue */}
      <QueueList queue={queue} />
    </div>
  )
}
