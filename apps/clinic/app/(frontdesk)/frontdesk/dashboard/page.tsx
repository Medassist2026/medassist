'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Bell,
  ChevronRight,
  RefreshCw,
  UserCheck,
  CalendarPlus,
  Banknote,
  UserPlus,
  Users,
  User,
  Clock,
  Stethoscope,
  TrendingUp,
} from 'lucide-react'
import { DoctorStatusCard } from '@ui-clinic/components/frontdesk/DoctorStatusCard'
import type { CheckInQueueItem } from '@shared/lib/data/frontdesk'

// ============================================================================
// TYPES
// ============================================================================

type QueueItem = CheckInQueueItem

interface DoctorStatus {
  doctorId: string
  doctorName: string
  specialty: string
  currentPatient?: {
    name: string
    queueNumber: number
    startedAt: string
  }
  waitingCount: number
  nextPatient?: {
    name: string
    queueNumber: number
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function deriveDoctorStatuses(queue: QueueItem[]): DoctorStatus[] {
  const doctorMap = new Map<string, DoctorStatus>()

  for (const item of queue) {
    const doctorId = item.doctor_id
    if (!doctorMap.has(doctorId)) {
      doctorMap.set(doctorId, {
        doctorId,
        doctorName: item.doctor?.full_name || 'طبيب',
        specialty: item.doctor?.specialty || '',
        waitingCount: 0,
      })
    }

    const doc = doctorMap.get(doctorId)!

    if (item.status === 'in_progress') {
      doc.currentPatient = {
        name: item.patient?.full_name || 'مريض',
        queueNumber: item.queue_number,
        startedAt: item.called_at || item.checked_in_at,
      }
    } else if (item.status === 'waiting') {
      doc.waitingCount++
      // First waiting patient = next patient
      if (!doc.nextPatient) {
        doc.nextPatient = {
          name: item.patient?.full_name || 'مريض',
          queueNumber: item.queue_number,
        }
      }
    }
  }

  return Array.from(doctorMap.values())
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'in_progress':
      return { label: 'مع الطبيب', dot: 'bg-blue-500', bg: 'bg-blue-50 text-blue-700' }
    case 'waiting':
      return { label: 'انتظار', dot: 'bg-yellow-500', bg: 'bg-yellow-50 text-yellow-700' }
    case 'completed':
      return { label: 'مكتمل', dot: 'bg-green-500', bg: 'bg-green-50 text-green-700' }
    default:
      return { label: status, dot: 'bg-gray-400', bg: 'bg-gray-50 text-gray-700' }
  }
}

function getTypeLabel(type: string) {
  switch (type) {
    case 'walkin': return 'حضور'
    case 'appointment': return 'موعد'
    case 'emergency': return 'طوارئ'
    default: return type
  }
}

function formatElapsedMinutes(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / 60000))
}

// ============================================================================
// QUICK ACTIONS GRID
// ============================================================================

function QuickActionsGrid() {
  const actions = [
    { href: '/frontdesk/checkin', label: 'تسجيل وصول', icon: UserCheck, color: 'text-[#16A34A]', bg: 'bg-[#F0FDF4]' },
    { href: '/frontdesk/appointments/new', label: 'حجز موعد', icon: CalendarPlus, color: 'text-[#2563EB]', bg: 'bg-[#EFF6FF]' },
    { href: '/frontdesk/payments/new', label: 'تحصيل دفع', icon: Banknote, color: 'text-[#D97706]', bg: 'bg-[#FFFBEB]' },
    { href: '/frontdesk/patients/register', label: 'تسجيل مريض', icon: UserPlus, color: 'text-[#7C3AED]', bg: 'bg-[#F5F3FF]' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.href}
            href={action.href}
            className="flex flex-col items-center gap-2 py-4 px-3 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] active:scale-[0.97] transition-transform"
          >
            <div className={`w-11 h-11 rounded-full flex items-center justify-center ${action.bg}`}>
              <Icon className={`w-5 h-5 ${action.color}`} />
            </div>
            <span className="font-cairo text-[13px] font-semibold text-[#030712]">
              {action.label}
            </span>
          </Link>
        )
      })}
    </div>
  )
}

// ============================================================================
// TODAY STATS ROW
// ============================================================================

function TodayStatsRow({
  arrivals,
  waiting,
  revenue,
}: {
  arrivals: number
  waiting: number
  revenue: number
}) {
  return (
    <div className="flex gap-3">
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#030712]">{arrivals}</p>
        <p className="font-cairo text-[11px] text-[#6B7280]">وصول</p>
      </div>
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#D97706]">{waiting}</p>
        <p className="font-cairo text-[11px] text-[#6B7280]">انتظار</p>
      </div>
      <div className="flex-1 bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3 text-center">
        <p className="font-cairo text-[20px] font-bold text-[#16A34A]">{revenue.toLocaleString('ar-EG')}</p>
        <p className="font-cairo text-[11px] text-[#6B7280]">ج.م</p>
      </div>
    </div>
  )
}

// ============================================================================
// QUEUE LIST (Mobile)
// ============================================================================

function MobileQueueList({
  queue,
  onUpdateStatus,
  updating,
}: {
  queue: QueueItem[]
  onUpdateStatus: (id: string, status: string) => void
  updating: string | null
}) {
  const activeQueue = queue.filter(q => q.status === 'waiting' || q.status === 'in_progress')

  if (activeQueue.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mx-auto mb-3">
          <Users className="w-7 h-7 text-[#D1D5DB]" />
        </div>
        <p className="font-cairo text-[15px] font-semibold text-[#030712] mb-1">
          لا يوجد مرضى في الانتظار
        </p>
        <p className="font-cairo text-[13px] text-[#6B7280]">
          سجل وصول المرضى لإضافتهم للقائمة
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activeQueue.map((item) => {
        const statusConfig = getStatusConfig(item.status)
        const elapsed = formatElapsedMinutes(item.called_at || item.checked_in_at)

        return (
          <div
            key={item.id}
            className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5"
          >
            <div className="flex items-center gap-3">
              {/* Queue Number */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                item.status === 'in_progress' ? 'bg-blue-500 text-white' : 'bg-[#F3F4F6] text-[#030712]'
              }`}>
                <span className="font-cairo text-[14px] font-bold">#{item.queue_number}</span>
              </div>

              {/* Patient Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
                    {item.patient?.full_name || 'مريض'}
                  </h4>
                  {item.queue_type === 'emergency' && (
                    <span className="font-cairo text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                      طوارئ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-cairo text-[12px] text-[#6B7280]">
                    د. {(item.doctor?.full_name || '').replace(/^د\.\s*/, '')}
                  </span>
                  <span className="text-[#D1D5DB]">·</span>
                  <span className="font-cairo text-[12px] text-[#9CA3AF]">
                    {elapsed} د
                  </span>
                </div>
              </div>

              {/* Status + Action */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span className={`font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full ${statusConfig.bg}`}>
                  {statusConfig.label}
                </span>

                {item.status === 'waiting' && (
                  <button
                    onClick={() => onUpdateStatus(item.id, 'in_progress')}
                    disabled={updating === item.id}
                    className="font-cairo text-[11px] font-medium text-[#16A34A] disabled:opacity-40"
                  >
                    {updating === item.id ? '...' : 'استدعاء'}
                  </button>
                )}
                {item.status === 'in_progress' && (
                  <button
                    onClick={() => onUpdateStatus(item.id, 'completed')}
                    disabled={updating === item.id}
                    className="font-cairo text-[11px] font-medium text-[#2563EB] disabled:opacity-40"
                  >
                    {updating === item.id ? '...' : 'إنهاء'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// MAIN DASHBOARD PAGE
// ============================================================================

export default function FrontDeskDashboardPage() {
  const router = useRouter()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [revenue, setRevenue] = useState(0)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [pendingInviteCount, setPendingInviteCount] = useState(0)

  const refreshData = useCallback(async () => {
    try {
      const [queueRes, paymentsRes] = await Promise.all([
        fetch('/api/frontdesk/queue/today'),
        fetch('/api/frontdesk/payments?today=true').catch(() => null),
      ])

      if (queueRes.ok) {
        const queueData = await queueRes.json()
        setQueue(queueData.queue || [])
      }

      if (paymentsRes?.ok) {
        const payData = await paymentsRes.json()
        const total = (payData.payments || []).reduce(
          (sum: number, p: any) => sum + Number(p.amount || 0),
          0
        )
        setRevenue(total)
      }

      setLastUpdate(new Date())
    } catch (err) {
      console.error('Dashboard refresh error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshData()
    // Check for pending invites
    fetch('/api/frontdesk/invite').then(res => {
      if (res.ok) return res.json()
    }).then(data => {
      if (data?.invites) setPendingInviteCount(data.invites.length)
    }).catch(() => {})
  }, [refreshData])

  // Poll every 30 seconds
  useEffect(() => {
    const interval = setInterval(refreshData, 30000)
    return () => clearInterval(interval)
  }, [refreshData])

  const updateStatus = async (queueId: string, status: string) => {
    setUpdating(queueId)
    try {
      const res = await fetch('/api/frontdesk/queue/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, status }),
      })
      if (!res.ok) throw new Error('فشل التحديث')
      refreshData()
    } catch (err) {
      console.error('Update error:', err)
    } finally {
      setUpdating(null)
    }
  }

  // Derive doctor statuses from queue
  const doctorStatuses = deriveDoctorStatuses(queue)
  const totalArrivals = queue.length
  const waitingCount = queue.filter(q => q.status === 'waiting').length

  return (
    <div dir="rtl">
      {/* Sticky Header */}
      <div className="sticky top-0 z-40 bg-white border-b-[0.8px] border-[#E5E7EB]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="font-cairo text-[17px] font-bold text-[#030712]">MedAssist</h1>
            <p className="font-cairo text-[12px] text-[#6B7280]">استقبال</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Live indicator */}
            <div className="flex items-center gap-1.5 bg-[#F0FDF4] rounded-full px-2.5 py-1">
              <div className="w-1.5 h-1.5 bg-[#16A34A] rounded-full animate-pulse" />
              <span className="font-cairo text-[11px] text-[#16A34A] font-medium">مباشر</span>
            </div>
            <button
              onClick={refreshData}
              className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center"
            >
              <RefreshCw className="w-[18px] h-[18px] text-[#6B7280]" />
            </button>
            <Link
              href="/frontdesk/profile"
              className="w-[36px] h-[36px] rounded-full bg-[#16A34A] flex items-center justify-center"
              title="الملف الشخصي"
            >
              <User className="w-[18px] h-[18px] text-white" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4 pb-6 space-y-5">
        {loading ? (
          <div className="text-center py-16">
            <div className="w-10 h-10 border-2 border-[#16A34A] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-cairo text-[14px] text-[#6B7280]">جاري التحميل...</p>
          </div>
        ) : (
          <>
            {/* Pending Invitations Banner */}
            {pendingInviteCount > 0 && (
              <Link
                href="/frontdesk/invitations"
                className="flex items-center gap-3 bg-[#EFF6FF] rounded-[12px] border-[0.8px] border-[#BFDBFE] p-3.5 active:scale-[0.98] transition-transform"
              >
                <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
                  <Bell className="w-5 h-5 text-[#2563EB]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-cairo text-[14px] font-semibold text-[#1E40AF]">
                    لديك {pendingInviteCount} {pendingInviteCount === 1 ? 'دعوة' : 'دعوات'} معلقة
                  </p>
                  <p className="font-cairo text-[12px] text-[#3B82F6]">اضغط للمراجعة والقبول</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#93C5FD] rotate-180 flex-shrink-0" />
              </Link>
            )}

            {/* Doctor Status Cards */}
            {doctorStatuses.length > 0 ? (
              <div className="space-y-3">
                {doctorStatuses.map((doc) => (
                  <DoctorStatusCard key={doc.doctorId} doctor={doc} />
                ))}
              </div>
            ) : (
              <div className="bg-[#F0FDF4] rounded-[12px] p-4 text-center">
                <Stethoscope className="w-8 h-8 text-[#16A34A] mx-auto mb-2" />
                <p className="font-cairo text-[14px] font-medium text-[#030712]">
                  لا يوجد أطباء نشطون حالياً
                </p>
                <p className="font-cairo text-[12px] text-[#6B7280] mt-1">
                  سيظهر حالة الأطباء عند تسجيل وصول المرضى
                </p>
              </div>
            )}

            {/* Today Stats */}
            <div>
              <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563] mb-2">
                إحصائيات اليوم
              </h2>
              <TodayStatsRow
                arrivals={totalArrivals}
                waiting={waitingCount}
                revenue={revenue}
              />
            </div>

            {/* Quick Actions */}
            <div>
              <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563] mb-2">
                إجراءات سريعة
              </h2>
              <QuickActionsGrid />
            </div>

            {/* Live Queue List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-cairo text-[14px] font-semibold text-[#4B5563]">
                  قائمة الانتظار
                </h2>
                <span className="font-cairo text-[11px] text-[#9CA3AF]">
                  آخر تحديث {lastUpdate.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              <MobileQueueList
                queue={queue}
                onUpdateStatus={updateStatus}
                updating={updating}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
