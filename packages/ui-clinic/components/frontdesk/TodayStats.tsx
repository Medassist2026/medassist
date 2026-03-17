'use client'

interface TodayStatsProps {
  queue: any[]
  payments: any[]
  stats: {
    total: number
    count: number
  }
}

export default function TodayStats({ queue, payments, stats }: TodayStatsProps) {
  const waitingCount = queue.filter(q => q.status === 'waiting').length
  const inProgressCount = queue.filter(q => q.status === 'in_progress').length

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {/* Patients Waiting */}
      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6 border border-yellow-200">
        <div className="flex items-center justify-between mb-2">
          <div className="w-12 h-12 bg-yellow-200 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-yellow-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-3xl font-bold text-yellow-700">{waitingCount}</span>
        </div>
        <p className="text-sm font-medium text-yellow-800">Patients Waiting</p>
      </div>

      {/* Currently Seeing */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <div className="w-12 h-12 bg-blue-200 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <span className="text-3xl font-bold text-blue-700">{inProgressCount}</span>
        </div>
        <p className="text-sm font-medium text-blue-800">Currently Seeing</p>
      </div>

      {/* Total Patients */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-6 border border-primary-200">
        <div className="flex items-center justify-between mb-2">
          <div className="w-12 h-12 bg-primary-200 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-primary-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <span className="text-3xl font-bold text-primary-700">{queue.length}</span>
        </div>
        <p className="text-sm font-medium text-primary-800">Total Today</p>
      </div>

      {/* Revenue */}
      <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
        <div className="flex items-center justify-between mb-2">
          <div className="w-12 h-12 bg-green-200 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-3xl font-bold text-green-700">
            {stats.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} EGP
          </span>
        </div>
        <p className="text-sm font-medium text-green-800">Today's Revenue ({stats.count} payments)</p>
      </div>
    </div>
  )
}
