'use client'

/**
 * AccountSwitcher — B07 Phase F (Section 1, Mo ruling 21).
 *
 * Persistent header dropdown showing:
 *   - 'self'              : the user's own account
 *   - 'guardian_of_minor' : each minor they're guardian of (with age badge)
 *   - 'delegated'         : each accepted delegation they hold
 *
 * Self-only state (no dependents, no accepted delegations) renders as a
 * non-interactive avatar+name (no dropdown affordance) per ruling 21.
 *
 * Mobile (< 640px): collapses to avatar + chevron only when closed.
 *
 * Active context comes from the URL `?as=<gpId>` param via AccountContext.
 * Switching emits a router.push to update the param; existing patient pages
 * remain self-only data-wise (Phase F.5 finding #1 covers cross-context
 * fetching).
 */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, User as UserIcon, Users } from 'lucide-react'
import { useAccountSwitcher, type AccountContext } from '@patient/lib/contexts/account-context'
import { AgeBadge } from './AgeBadge'

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stable color hue from a string (deterministic per gp). Used for the
 * avatar circle background so each context has a recognizable color.
 */
function avatarColors(seed: string): { bg: string; fg: string } {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  // 6 distinct (bg, fg) pairs that pass contrast against white text.
  const palette = [
    { bg: '#16A34A', fg: '#FFFFFF' }, // green (matches app primary)
    { bg: '#2563EB', fg: '#FFFFFF' }, // blue
    { bg: '#9333EA', fg: '#FFFFFF' }, // purple
    { bg: '#DB2777', fg: '#FFFFFF' }, // pink
    { bg: '#EA580C', fg: '#FFFFFF' }, // orange
    { bg: '#0891B2', fg: '#FFFFFF' }, // cyan
  ]
  return palette[Math.abs(hash) % palette.length]
}

function initialsOf(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '؟'
  // Take first character (handles Arabic + Latin uniformly)
  const codepoints = Array.from(trimmed)
  return codepoints[0] ?? '؟'
}

function activeKey(active: AccountContext): string {
  if (active.kind === 'self') return 'self'
  return active.gpId
}

function contextLabel(acc: AccountContext): string {
  if (acc.kind === 'self') return acc.displayName || 'حسابي'
  return acc.displayName || 'بدون اسم'
}

// ──────────────────────────────────────────────────────────────────────────
// Avatar
// ──────────────────────────────────────────────────────────────────────────

function Avatar({ acc, size = 36 }: { acc: AccountContext; size?: number }) {
  const seed = acc.kind === 'self' ? 'self' : acc.gpId
  const { bg, fg } = avatarColors(seed)
  const fontSize = Math.round(size * 0.42)
  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0 font-cairo font-semibold"
      style={{ width: size, height: size, backgroundColor: bg, color: fg, fontSize }}
      aria-hidden="true"
    >
      {initialsOf(contextLabel(acc))}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// AccountSwitcher
// ──────────────────────────────────────────────────────────────────────────

export function AccountSwitcher() {
  const { active, available, loading, pendingReceivedCount, switchTo } =
    useAccountSwitcher()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Loading state — skeleton avatar
  if (loading) {
    return (
      <div className="flex items-center gap-1.5">
        <div
          className="w-9 h-9 rounded-full bg-[#E5E7EB] animate-pulse"
          aria-label="جاري تحميل الحسابات"
        />
      </div>
    )
  }

  const isSelfOnly = available.length <= 1

  // Self-only — non-interactive (Mo ruling 21: no dropdown when nothing to
  // switch to)
  if (isSelfOnly) {
    return (
      <div
        className="flex items-center gap-1.5"
        aria-label={`الحساب الحالي: ${contextLabel(active)}`}
      >
        <Avatar acc={active} size={36} />
      </div>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="تبديل الحساب"
        className="flex items-center gap-1.5 h-9 px-1.5 rounded-full border-[0.8px] border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] transition-colors relative"
      >
        <Avatar acc={active} size={28} />
        <span className="hidden sm:inline font-cairo text-[13px] font-medium text-[#030712] max-w-[120px] truncate">
          {contextLabel(active)}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#6B7280] transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
        {pendingReceivedCount > 0 && (
          <span
            aria-label={`${pendingReceivedCount} طلب رعاية معلق`}
            className="absolute -top-0.5 -left-0.5 min-w-[16px] h-[16px] px-1 bg-[#EF4444] text-white text-[10px] font-bold rounded-full flex items-center justify-center"
          >
            {pendingReceivedCount > 9 ? '9+' : pendingReceivedCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          dir="rtl"
          className="absolute top-full left-0 mt-2 w-[260px] bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] shadow-lg overflow-hidden z-50"
        >
          <div className="px-3 py-2 border-b-[0.8px] border-[#F3F4F6]">
            <p className="font-cairo text-[11px] font-medium text-[#9CA3AF]">
              تبديل الحساب
            </p>
          </div>
          <ul className="py-1 max-h-[320px] overflow-y-auto">
            {available.map((acc) => {
              const accKey = acc.kind === 'self' ? 'self' : acc.gpId
              const isActive = accKey === activeKey(active)
              return (
                <li key={accKey}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false)
                      switchTo(acc.kind === 'self' ? null : acc.gpId)
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 transition-colors text-right ${
                      isActive ? 'bg-[#F0FDF4]' : 'hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <Avatar acc={acc} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-cairo text-[13px] font-medium text-[#030712] truncate">
                          {contextLabel(acc)}
                        </span>
                        {acc.kind === 'guardian_of_minor' && (
                          <AgeBadge dateOfBirth={acc.dateOfBirth} compact />
                        )}
                      </div>
                      <p className="font-cairo text-[10px] text-[#6B7280] truncate">
                        {acc.kind === 'self'
                          ? 'حسابي'
                          : acc.kind === 'guardian_of_minor'
                            ? 'تابع — وليّ الأمر'
                            : 'حساب مفوّض'}
                      </p>
                    </div>
                    {isActive && (
                      <Check
                        className="w-4 h-4 text-[#16A34A] flex-shrink-0"
                        strokeWidth={2.5}
                        aria-label="الحساب النشط"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          {pendingReceivedCount > 0 && (
            <div className="border-t-[0.8px] border-[#F3F4F6] px-3 py-2 bg-[#FFFBEB]">
              <a
                href="/patient/settings/caregiving"
                className="flex items-center gap-2 font-cairo text-[12px] text-[#92400E] hover:underline"
              >
                <Users className="w-3.5 h-3.5" strokeWidth={2} />
                <span>{pendingReceivedCount} طلب رعاية معلق</span>
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Re-export an icon-only fallback for places that just need a marker
export function AccountSwitcherFallbackIcon() {
  return (
    <div className="w-9 h-9 rounded-full bg-[#F1F5F9] flex items-center justify-center">
      <UserIcon className="w-[18px] h-[18px] text-[#64748B]" strokeWidth={1.5} />
    </div>
  )
}
