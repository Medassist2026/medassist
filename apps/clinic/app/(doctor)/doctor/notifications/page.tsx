'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Bell, BellOff, UserCheck, CalendarPlus, CalendarX, AlertTriangle, FileCheck, MessageCircle, UserPlus, Clock } from 'lucide-react'
import { ar } from '@shared/lib/i18n/ar'

// ============================================================================
// NOTIFICATION TYPE CONFIG
// ============================================================================

const NOTIFICATION_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  patient_arrived: {
    icon: <UserCheck className="w-5 h-5" />,
    color: 'bg-[#E0F2FE] text-[#082F49]',
  },
  appointment_booked: {
    icon: <CalendarPlus className="w-5 h-5" />,
    color: 'bg-[#F0FDF4] text-[#16A34A]',
  },
  appointment_cancelled: {
    icon: <CalendarX className="w-5 h-5" />,
    color: 'bg-[#FEF3C7] text-[#78350F]',
  },
  emergency_added: {
    icon: <AlertTriangle className="w-5 h-5" />,
    color: 'bg-[#FEE2E2] text-[#991B1B]',
  },
  session_completed: {
    icon: <FileCheck className="w-5 h-5" />,
    color: 'bg-[#F0FDF4] text-[#16A34A]',
  },
  message_received: {
    icon: <MessageCircle className="w-5 h-5" />,
    color: 'bg-[#E0F2FE] text-[#082F49]',
  },
  invite_accepted: {
    icon: <UserPlus className="w-5 h-5" />,
    color: 'bg-[#F0FDF4] text-[#16A34A]',
  },
  daily_summary: {
    icon: <Clock className="w-5 h-5" />,
    color: 'bg-[#F3F4F6] text-[#4B5563]',
  },
  appointment_reminder: {
    icon: <Bell className="w-5 h-5" />,
    color: 'bg-[#FEF3C7] text-[#78350F]',
  },
}

const DEFAULT_ICON = {
  icon: <Bell className="w-5 h-5" />,
  color: 'bg-[#F3F4F6] text-[#4B5563]',
}

interface Notification {
  id: string
  type: string
  title: string
  body?: string
  read: boolean
  created_at: string
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)

  // Fetch notifications
  const loadNotifications = async () => {
    try {
      setLoadError('')
      const res = await fetch('/api/doctor/notifications?limit=50')
      if (!res.ok) throw new Error('فشل تحميل الإشعارات')
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    } catch (err: any) {
      setLoadError(err.message || 'حدث خطأ في تحميل الإشعارات')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadNotifications()
  }, [])

  // Mark all as read
  const markAllRead = async () => {
    try {
      await fetch('/api/doctor/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch { /* ignore */ }
  }

  // Format relative time in Arabic
  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'الآن'
    if (minutes < 60) return `منذ ${minutes} دقيقة`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `منذ ${hours} ساعة`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'أمس'
    return `منذ ${days} أيام`
  }

  // Group notifications by date: Today / Yesterday / Earlier
  const groupNotifications = (items: Notification[]) => {
    const now = new Date()
    const today = now.toDateString()
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayStr = yesterday.toDateString()

    const groups: { label: string; items: Notification[] }[] = []
    let currentGroup: { label: string; items: Notification[] } | null = null

    for (const notif of items) {
      const dateStr = new Date(notif.created_at).toDateString()
      let label: string
      if (dateStr === today) {
        label = 'اليوم'
      } else if (dateStr === yesterdayStr) {
        label = 'أمس'
      } else {
        label = 'سابقاً'
      }

      if (!currentGroup || currentGroup.label !== label) {
        currentGroup = { label, items: [] }
        groups.push(currentGroup)
      }
      currentGroup.items.push(notif)
    }

    return groups
  }

  const grouped = groupNotifications(notifications)

  return (
    <div className="min-h-screen bg-[#F9FAFB]" dir="rtl">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-[36px] h-[36px] rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center"
            >
              <ChevronRight className="w-[20px] h-[20px] text-[#030712]" />
            </button>
            <h1 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712]">
              الإشعارات
            </h1>
            {unreadCount > 0 && (
              <span className="bg-[#EF4444] text-white font-cairo text-[11px] font-bold px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="font-cairo text-[13px] font-medium text-[#16A34A]"
            >
              قراءة الكل
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pb-24">
          {loadError ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <p className="font-cairo text-[14px] text-red-700 mb-3">{loadError}</p>
              <button
                onClick={() => { setLoading(true); loadNotifications() }}
                className="font-cairo text-[14px] font-medium text-[#16A34A] hover:underline"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <p className="font-cairo text-[14px] text-[#4B5563]">{ar.loading}</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16">
              <BellOff className="w-12 h-12 text-[#D1D5DB] mx-auto mb-4" />
              <p className="font-cairo text-[16px] font-semibold text-[#030712] mb-1">
                لا توجد إشعارات
              </p>
              <p className="font-cairo text-[14px] text-[#4B5563]">
                ستظهر الإشعارات هنا عند وصول المرضى أو تحديث المواعيد
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.label}>
                  {/* Date Group Header */}
                  <div className="flex items-center gap-3 mb-2 px-1">
                    <span className="font-cairo text-[13px] font-semibold text-[#6B7280]">
                      {group.label}
                    </span>
                    <div className="flex-1 h-[0.5px] bg-[#E5E7EB]" />
                  </div>

                  {/* Notifications in group */}
                  <div className="space-y-1">
                    {group.items.map((notif) => {
                      const iconConfig = NOTIFICATION_ICONS[notif.type] || DEFAULT_ICON

                      return (
                        <div
                          key={notif.id}
                          className={`flex items-start gap-3 p-4 rounded-[12px] transition-colors ${
                            notif.read ? 'bg-white' : 'bg-[#F0FDF4]'
                          }`}
                        >
                          {/* Icon */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconConfig.color}`}>
                            {iconConfig.icon}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`font-cairo text-[14px] leading-[21px] text-[#030712] ${notif.read ? 'font-normal' : 'font-semibold'}`}>
                                {notif.title}
                              </p>
                              {!notif.read && (
                                <div className="w-2 h-2 rounded-full bg-[#16A34A] flex-shrink-0 mt-2" />
                              )}
                            </div>
                            {notif.body && (
                              <p className="font-cairo text-[13px] text-[#4B5563] mt-0.5">
                                {notif.body}
                              </p>
                            )}
                            <p className="font-cairo text-[12px] text-[#9CA3AF] mt-1">
                              {formatTime(notif.created_at)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
