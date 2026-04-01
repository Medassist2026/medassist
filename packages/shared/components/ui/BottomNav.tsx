'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Calendar, MessageCircle } from 'lucide-react'
import { FloatingActionButton } from './FloatingActionButton'
import { useState, useEffect } from 'react'

/**
 * BottomNav — Matches Figma bottom bar design.
 *
 * Figma specs:
 * - Bar: h-64px, bg #F3F4F6, border-top 0.8px #E5E7EB
 * - 3 items: Calendar (24px), FAB (56px, #16A34A, shadow, centered), MessageCircle (24px)
 * - Icon color: #4B5563 (2px stroke)
 * - No text labels — Figma shows icons only
 */

export function BottomNav() {
  const pathname = usePathname()
  const isActive = (path: string) => pathname?.startsWith(path)
  const [unreadCount, setUnreadCount] = useState(0)

  // Poll unread count every 30s to keep badge fresh
  useEffect(() => {
    let cancelled = false

    async function fetchUnread() {
      try {
        const res = await fetch('/api/doctor/messages/unread-count')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setUnreadCount(data.total_unread || 0)
      } catch { /* silent */ }
    }

    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#F3F4F6] border-t-[0.8px] border-[#E5E7EB] safe-area-bottom">
      <div className="flex items-center justify-between h-16 max-w-lg mx-auto px-10">
        {/* Calendar — Figma: 24x24, 2px stroke #4B5563 */}
        <Link
          href="/doctor/schedule"
          className="flex items-center justify-center w-12 h-12"
        >
          <Calendar
            className={`w-6 h-6 ${isActive('/doctor/schedule') ? 'text-[#16A34A]' : 'text-[#4B5563]'}`}
            strokeWidth={2}
          />
        </Link>

        {/* FAB — Center */}
        <FloatingActionButton />

        {/* Messages — with unread badge */}
        <Link
          href="/doctor/messages"
          className="relative flex items-center justify-center w-12 h-12"
        >
          <MessageCircle
            className={`w-6 h-6 ${isActive('/doctor/messages') ? 'text-[#16A34A]' : 'text-[#4B5563]'}`}
            strokeWidth={2}
          />
          {unreadCount > 0 && !isActive('/doctor/messages') && (
            <span className="absolute top-1.5 right-1.5 min-w-[16px] h-[16px] bg-[#EF4444] text-white font-cairo text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
      </div>
    </nav>
  )
}
