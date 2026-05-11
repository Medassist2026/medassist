'use client'

/**
 * PediatricBadge — B07 Phase G (Mo ruling 30).
 *
 * Renders an age badge ("عمر N") + an informational "Pediatric patient" tag
 * for minor patients on clinic-side surfaces (patient search results,
 * doctor session header, patient detail card, patient list rows).
 *
 * Per Mo's Phase G ruling 30:
 *   - Age badge is the universal indicator (same convention as the
 *     patient-app `AgeBadge`, kept visually compatible).
 *   - "Pediatric patient" tag is additive — used only on surfaces where
 *     unambiguous awareness matters (doctor session, patient detail).
 *     Search-result rows and patient-list rows typically use the age
 *     badge alone (set `showTag={false}`).
 *
 * Color is muted blue (#1D4ED8 / #BFDBFE / #EFF6FF) — informational, NOT
 * warning-red. Mirrors the dependent-banner styling in
 * /frontdesk/patients/register.
 *
 * Compose with a guardian-attribution line ("Dependent of <name>") in
 * the parent component; this component renders the badge and optional
 * tag only.
 *
 * Inputs:
 *   - dateOfBirth: ISO date string. If null/invalid/future, the badge
 *     suppresses rendering of the age number but the tag still renders
 *     when isMinor is true.
 *   - isMinor: explicit minor flag (from gp.is_minor). Required because
 *     date_of_birth may be NULL on minor gps (Phase B mig 111 backfill
 *     left some minors with NULL dob).
 *   - showTag: when true, renders the "Pediatric patient" pill alongside
 *     the age badge. Defaults to false (age badge only — patient-list and
 *     search-result rows).
 */

import { UserPlus } from 'lucide-react'

interface PediatricBadgeProps {
  dateOfBirth?: string | null
  isMinor: boolean
  /** Render the "Pediatric patient" tag alongside the age badge. */
  showTag?: boolean
  /** Locale for the label. Defaults to 'ar'. */
  locale?: 'ar' | 'en'
  /** Optional layout tweak. */
  className?: string
}

/**
 * Compute integer years between dateOfBirth and now. Returns null when
 * the input is missing, malformed, or in the future. Mirrors the
 * patient-app `calculateAge` helper.
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

export function PediatricBadge({
  dateOfBirth,
  isMinor,
  showTag = false,
  locale = 'ar',
  className = '',
}: PediatricBadgeProps) {
  if (!isMinor) return null

  const age = calculateAge(dateOfBirth)
  const ageLabel =
    age === null
      ? null
      : locale === 'ar'
      ? `عمر ${age}`
      : `Age ${age}`

  const tagLabel = locale === 'ar' ? 'مريض تابع' : 'Pediatric patient'

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {ageLabel && (
        <span
          className="font-cairo text-[11px] text-[#6B7280]"
          aria-label={locale === 'ar' ? `العمر ${age} سنة` : `Age ${age} years`}
        >
          ({ageLabel})
        </span>
      )}
      {showTag && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#EFF6FF] border-[0.8px] border-[#BFDBFE] text-[#1D4ED8] font-cairo text-[11px] font-medium"
          aria-label={tagLabel}
        >
          <UserPlus className="w-3 h-3" strokeWidth={2} />
          {tagLabel}
        </span>
      )}
    </span>
  )
}
