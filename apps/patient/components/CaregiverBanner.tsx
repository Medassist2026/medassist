'use client'

/**
 * CaregiverBanner — B07 Phase F (Section 2, Mo ruling 22).
 *
 * Persistent amber banner that appears whenever the active context is NOT
 * 'self'. Provides a constant visual reminder that the user is acting on
 * someone else's records. Per ruling 22, dismissal is per-session
 * (sessionStorage); banner reappears on next sign-in.
 *
 * Copy:
 *  - guardian_of_minor: "تتصفح حساب <name> (التابع، عمر N)"
 *  - delegated:        "تعمل بالنيابة عن <name>"
 *
 * Tap-anywhere behavior: when not dismissed, tapping the banner exposes a
 * "Switch to my own account" affordance. The X button dismisses for the
 * session.
 *
 * Color: amber/orange (#FFFBEB bg, #F59E0B border, #92400E text). NOT red —
 * informational, not alarming. Mo ruling 22 explicitly calls this out.
 */

import { useState } from 'react'
import { ArrowLeftRight, X } from 'lucide-react'
import { useAccountSwitcher, type AccountContext } from '@patient/lib/contexts/account-context'
import { useBannerDismissal } from '@patient/lib/hooks/use-banner-dismissal'
import { calculateAge } from './AgeBadge'

function bannerCopy(active: AccountContext): string {
  if (active.kind === 'self') return ''
  if (active.kind === 'guardian_of_minor') {
    const age = calculateAge(active.dateOfBirth)
    const name = active.displayName || 'بدون اسم'
    if (age !== null) {
      // "Browsing <name>'s account (the dependent, age N)"
      return `تتصفح حساب ${name} (التابع، عمر ${age})`
    }
    return `تتصفح حساب ${name} (التابع)`
  }
  // delegated
  const name = active.displayName || 'بدون اسم'
  return `تعمل بالنيابة عن ${name}`
}

export function CaregiverBanner() {
  const { active, switchTo } = useAccountSwitcher()
  const contextKey = active.kind === 'self' ? null : active.gpId
  const { dismissed, dismiss } = useBannerDismissal(contextKey)
  const [expanded, setExpanded] = useState(false)

  // Hide banner on self context or if user dismissed for this session
  if (active.kind === 'self') return null
  if (dismissed) return null

  const copy = bannerCopy(active)

  return (
    <div
      role="status"
      dir="rtl"
      className="bg-[#FFFBEB] border-b-[0.8px] border-[#F59E0B]"
    >
      <div className="max-w-md mx-auto lg:max-w-none px-4 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 min-w-0 text-right flex items-center gap-2"
          aria-label="تفاصيل تبديل الحساب"
        >
          <ArrowLeftRight
            className="w-4 h-4 text-[#B45309] flex-shrink-0"
            strokeWidth={2}
          />
          <span className="font-cairo text-[12px] font-medium text-[#92400E] truncate">
            {copy}
          </span>
        </button>
        {expanded && (
          <button
            type="button"
            onClick={() => {
              setExpanded(false)
              switchTo(null)
            }}
            className="font-cairo text-[11px] font-semibold text-[#B45309] hover:text-[#92400E] underline whitespace-nowrap"
          >
            العودة لحسابي
          </button>
        )}
        <button
          type="button"
          onClick={() => dismiss()}
          aria-label="إخفاء التنبيه لهذه الجلسة"
          className="w-6 h-6 rounded-full hover:bg-[#FEF3C7] flex items-center justify-center flex-shrink-0"
        >
          <X className="w-3.5 h-3.5 text-[#92400E]" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
