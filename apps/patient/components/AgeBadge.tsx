'use client'

/**
 * AgeBadge — B07 Phase F (Mo ruling 26: pediatric flag visibility = age badge).
 *
 * Renders "(عمر N)" / "(Age N)" derived from `dateOfBirth` at render time.
 * Age is calculated dynamically; never stored. Returns `null` for missing or
 * future dates so callers can compose `<>{name} <AgeBadge ... /></>` without
 * conditional wrapping.
 *
 * Used in: AccountSwitcher list items, DependentList rows, DependentDetailCard,
 * CaregiverBanner. Per Mo ruling 26, this is the ONLY pediatric indicator —
 * no "MINOR" tag, no birth-year-only output.
 */

interface AgeBadgeProps {
  /** ISO date string (YYYY-MM-DD or full ISO). May be null/undefined. */
  dateOfBirth?: string | null
  /** Locale for the label. Defaults to 'ar' (app default). */
  locale?: 'ar' | 'en'
  /** Compact form drops the parens — useful inside small chips. */
  compact?: boolean
  /** Optional className passthrough for layout tweaks. */
  className?: string
}

/**
 * Compute integer years between dateOfBirth and now.
 * Returns null if dateOfBirth is missing, malformed, or in the future.
 */
export function calculateAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return null
  const now = new Date()
  if (dob.getTime() > now.getTime()) return null
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age -= 1
  }
  return Math.max(0, age)
}

export function AgeBadge({
  dateOfBirth,
  locale = 'ar',
  compact = false,
  className = '',
}: AgeBadgeProps) {
  const age = calculateAge(dateOfBirth)
  if (age === null) return null

  // Egyptian Arabic uses "عمر N" (lit. "age N"); English uses "Age N".
  // Compact form drops parens for inline use inside chips.
  const inner =
    locale === 'ar' ? `عمر ${age}` : `Age ${age}`
  const text = compact ? inner : `(${inner})`

  // B07 Phase G.5 — narrow-viewport polish. `whitespace-nowrap` keeps
  // "(عمر N)" / "(Age N)" as a single non-breaking token so the badge
  // never wraps mid-word inside a tight flex container. Truncating
  // siblings already enforce ellipsis on long names; this guard
  // protects the badge itself.
  return (
    <span
      className={`font-cairo text-[11px] text-[#6B7280] whitespace-nowrap ${className}`}
      aria-label={locale === 'ar' ? `العمر ${age} سنة` : `Age ${age} years`}
    >
      {text}
    </span>
  )
}
