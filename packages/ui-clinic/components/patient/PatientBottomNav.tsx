'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Home, Pill, Calendar, HeartPulse, MessageCircle } from 'lucide-react'

/**
 * PatientBottomNav — Mobile bottom navigation for the patient section.
 *
 * Figma / design tokens:
 * - Bar: fixed, h-16, bg-white, border-top 0.8px #E5E7EB
 * - 5 items, evenly spaced inside max-w-md container
 * - Active color: #16A34A (primary green)
 * - Inactive color: #9CA3AF
 * - Font: Cairo, 10px labels
 *
 * The 5 primary destinations map 1:1 to Phases 2–6 of the patient rebuild:
 *   Home        → /patient/dashboard   (Phase 2)
 *   Rx          → /patient/prescriptions (Phase 3, consolidated)
 *   Appointments→ /patient/appointments (Phase 4)
 *   Health      → /patient/health       (Phase 5, merged)
 *   Messages    → /patient/messages     (Phase 6)
 *
 * The "More" page (/patient/more) is reached via the PatientHeader, not the
 * bottom nav, so the bar stays scannable at 5 items max.
 */

const NAV_ITEMS = [
  { href: '/patient/dashboard', label: 'الرئيسية', icon: Home },
  { href: '/patient/prescriptions', label: 'الوصفات', icon: Pill },
  { href: '/patient/appointments', label: 'المواعيد', icon: Calendar },
  { href: '/patient/health', label: 'صحتي', icon: HeartPulse },
  { href: '/patient/messages', label: 'الرسائل', icon: MessageCircle, showBadge: true },
]

export function PatientBottomNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)

  // Poll unread count every 30s so the badge stays fresh
  useEffect(() => {
    let cancelled = false

    async function fetchUnread() {
      try {
        const res = await fetch('/api/patient/messages/unread-count')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setUnreadCount(data.total_unread || 0)
      } catch {
        /* silent */
      }
    }

    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <nav
      dir="rtl"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-[0.8px] border-[#E5E7EB] safe-area-bottom"
    >
      <div className="flex items-center justify-around h-16 max-w-md mx-auto px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/')
          const Icon = item.icon
          const showMessageBadge =
            item.showBadge && unreadCount > 0 && !isActive

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-14 rounded-xl transition-colors ${
                isActive ? 'text-[#16A34A]' : 'text-[#9CA3AF] hover:text-[#4B5563]'
              }`}
            >
              <Icon
                className="w-[22px] h-[22px]"
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span
                className={`font-cairo text-[10px] leading-tight ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {item.label}
              </span>

              {showMessageBadge && (
                <span className="absolute top-1 left-2 min-w-[16px] h-[16px] bg-[#EF4444] text-white font-cairo text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
