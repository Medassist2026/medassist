'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, MoreHorizontal, ChevronRight } from 'lucide-react'

/**
 * PatientHeader — Top bar used across patient pages.
 *
 * Two modes:
 *  - Root mode (showBack=false): shows greeting / app title on the right,
 *    notification bell + "more" button on the left. Used on tab root pages
 *    like /patient/dashboard, /patient/prescriptions, etc.
 *  - Nested mode (showBack=true): shows a back chevron + page title on the
 *    right, optional action on the left. Used on detail pages.
 *
 * Design tokens (matches DoctorShell header pattern):
 *  - Background: white, border-bottom 0.8px #E5E7EB
 *  - Height: 56px
 *  - Title: Cairo 18px semibold #030712
 *  - Icon buttons: 36x36 rounded-full border-[0.8px] #E5E7EB bg-white
 */

interface PatientHeaderProps {
  /** Title shown on the right side of the header (RTL) */
  title?: string
  /** Small subtitle under the title (e.g. patient name) */
  subtitle?: string
  /** Show back chevron instead of greeting mode */
  showBack?: boolean
  /** Hide the bell/more actions (e.g. on full-screen modals) */
  hideActions?: boolean
  /** Custom action slot (replaces bell + more) */
  action?: React.ReactNode
}

export function PatientHeader({
  title = 'MedAssist',
  subtitle,
  showBack = false,
  hideActions = false,
  action,
}: PatientHeaderProps) {
  const router = useRouter()

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 bg-white border-b-[0.8px] border-[#E5E7EB]"
    >
      <div className="max-w-md mx-auto flex items-center justify-between px-4 h-14">
        {/* Right side (RTL) — back button or title */}
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              aria-label="رجوع"
              className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center flex-shrink-0 hover:bg-[#F9FAFB] transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-[#030712]" strokeWidth={2} />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="font-cairo text-[18px] leading-[22px] font-semibold text-[#030712] truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="font-cairo text-[12px] text-[#6B7280] truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Left side (RTL) — actions */}
        {!hideActions && (
          <div className="flex items-center gap-2">
            {action ?? (
              <>
                <Link
                  href="/patient/notifications"
                  aria-label="الإشعارات"
                  className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center hover:bg-[#F9FAFB] transition-colors"
                >
                  <Bell className="w-[18px] h-[18px] text-[#4B5563]" strokeWidth={1.8} />
                </Link>
                <Link
                  href="/patient/more"
                  aria-label="المزيد"
                  className="w-9 h-9 rounded-full border-[0.8px] border-[#E5E7EB] bg-white flex items-center justify-center hover:bg-[#F9FAFB] transition-colors"
                >
                  <MoreHorizontal className="w-[18px] h-[18px] text-[#4B5563]" strokeWidth={1.8} />
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
