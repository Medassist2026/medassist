'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, ArrowUp } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface QueueItem {
  id: string
  queue_number: number
  queue_type: string
  status: string
  checked_in_at: string
  called_at?: string | null
  patient: {
    full_name: string | null
    phone: string
    age: number | null
    sex: string | null
  }
  doctor: {
    full_name: string | null
    specialty: string
  }
}

interface QueueListProps {
  queue: QueueItem[]
}

// ============================================================================
// HELPERS
// ============================================================================

function getStatusConfig(status: string) {
  switch (status) {
    case 'in_progress':
      return { label: 'مع الطبيب', bg: 'bg-blue-50 text-blue-700' }
    case 'waiting':
      return { label: 'انتظار', bg: 'bg-yellow-50 text-yellow-700' }
    case 'completed':
      return { label: 'مكتمل', bg: 'bg-green-50 text-green-700' }
    case 'cancelled':
      return { label: 'ملغي', bg: 'bg-gray-50 text-gray-500' }
    default:
      return { label: status, bg: 'bg-gray-50 text-gray-500' }
  }
}

function formatElapsed(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.max(0, Math.floor(diff / 60000))
  return `${mins} د`
}

// ============================================================================
// QUEUE LIST (Mobile-first, RTL Arabic)
// ============================================================================

export default function QueueList({ queue }: QueueListProps) {
  const router = useRouter()
  const [updating, setUpdating] = useState<string | null>(null)

  const activeQueue = queue.filter(
    (q) => q.status === 'waiting' || q.status === 'in_progress'
  )

  const updateStatus = async (queueId: string, status: string) => {
    setUpdating(queueId)
    try {
      const res = await fetch('/api/frontdesk/queue/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, status }),
      })
      if (!res.ok) throw new Error('فشل التحديث')
      router.refresh()
    } catch {
      // no-op — parent should handle errors
    } finally {
      setUpdating(null)
    }
  }

  if (activeQueue.length === 0) {
    return (
      <div className="text-center py-10" dir="rtl">
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
    <div className="space-y-2" dir="rtl">
      {activeQueue.map((item) => {
        const statusConfig = getStatusConfig(item.status)
        const elapsed = formatElapsed(item.called_at || item.checked_in_at)

        return (
          <div
            key={item.id}
            className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] p-3.5"
          >
            <div className="flex items-center gap-3">
              {/* Queue Number */}
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.status === 'in_progress'
                    ? 'bg-blue-500 text-white'
                    : 'bg-[#F3F4F6] text-[#030712]'
                }`}
              >
                <span className="font-cairo text-[14px] font-bold">
                  #{item.queue_number}
                </span>
              </div>

              {/* Patient Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-cairo text-[14px] font-semibold text-[#030712] truncate">
                    {item.patient?.full_name || 'مريض'}
                  </h4>
                  {item.queue_type === 'emergency' && (
                    <span className="font-cairo text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                      🔴 طوارئ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-cairo text-[12px] text-[#6B7280]">
                    د.{' '}
                    {(item.doctor?.full_name || '').replace(/^د\.\s*/, '')}
                  </span>
                  <span className="text-[#D1D5DB]">·</span>
                  <span className="font-cairo text-[12px] text-[#9CA3AF]">
                    {elapsed}
                  </span>
                </div>
              </div>

              {/* Status + Actions */}
              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                <span
                  className={`font-cairo text-[11px] font-medium px-2 py-0.5 rounded-full ${statusConfig.bg}`}
                >
                  {statusConfig.label}
                </span>

                {item.status === 'waiting' && (
                  <button
                    onClick={() => updateStatus(item.id, 'in_progress')}
                    disabled={updating === item.id}
                    className="font-cairo text-[11px] font-medium text-[#16A34A] disabled:opacity-40"
                  >
                    {updating === item.id ? '...' : 'استدعاء'}
                  </button>
                )}

                {item.status === 'in_progress' && (
                  <button
                    onClick={() => updateStatus(item.id, 'completed')}
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
