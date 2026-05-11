'use client'

/**
 * /patient/settings/family — B07 Phase F (Section 5, list view).
 *
 * Lists the user's registered dependents. Each row links to the detail
 * page. Empty state surfaces a CTA to register the first dependent.
 *
 * Data source: AccountProvider already fetches /api/patient/dependents on
 * mount; we reuse it via useAccountSwitcher() instead of double-fetching.
 *
 * Mo ruling 23: this page exists at /patient/settings/family. Mo ruling 25:
 * NO grant-flow CTAs here — those live under "Trusted caregivers".
 */

import Link from 'next/link'
import { ChevronLeft, UserPlus, Users } from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { AccountSwitcher } from '@patient/components/AccountSwitcher'
import { AgeBadge } from '@patient/components/AgeBadge'
import { useAccountSwitcher } from '@patient/lib/contexts/account-context'

export default function FamilySettingsPage() {
  const { available, loading } = useAccountSwitcher()
  const dependents = available.filter((a) => a.kind === 'guardian_of_minor')

  return (
    <div className="font-cairo">
      <PatientHeader
        title="عائلتي"
        showBack
        leadingAction={<AccountSwitcher />}
      />

      <div className="px-4 pt-4 pb-24">
        {/* Header / CTA row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-cairo text-[18px] font-bold text-[#030712]">
              التابعون
            </h2>
            <p className="font-cairo text-[12px] text-[#6B7280] mt-0.5">
              أفراد العائلة الذين تديرهم
            </p>
          </div>
          <Link
            href="/patient/dependents/register"
            className="inline-flex items-center gap-1.5 h-[36px] px-3 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] font-cairo text-[12px] font-semibold text-white transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" strokeWidth={2} />
            تسجيل تابع
          </Link>
        </div>

        {loading && (
          <div className="space-y-2">
            <div className="h-16 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
            <div className="h-16 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
          </div>
        )}

        {!loading && dependents.length === 0 && (
          <div className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-6 text-center">
            <div className="w-14 h-14 mx-auto bg-[#F0FDF4] rounded-full flex items-center justify-center mb-3">
              <Users className="w-7 h-7 text-[#16A34A]" strokeWidth={1.8} />
            </div>
            <p className="font-cairo text-[14px] font-semibold text-[#030712] mb-1">
              لا يوجد تابعون بعد
            </p>
            <p className="font-cairo text-[12px] text-[#6B7280] leading-[18px] mb-4">
              سجّل طفلك لتبدأ في إدارة رعايته الصحية ضمن حسابك.
            </p>
            <Link
              href="/patient/dependents/register"
              className="inline-flex items-center gap-1.5 h-[40px] px-4 rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] font-cairo text-[13px] font-semibold text-white transition-colors"
            >
              <UserPlus className="w-4 h-4" strokeWidth={2} />
              تسجيل أول تابع
            </Link>
          </div>
        )}

        {!loading && dependents.length > 0 && (
          <ul className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
            {dependents.map((dep) => {
              if (dep.kind !== 'guardian_of_minor') return null
              return (
                <li key={dep.gpId}>
                  <Link
                    href={`/patient/settings/family/${dep.gpId}`}
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                      <span className="font-cairo text-[14px] font-semibold text-[#16A34A]">
                        {(dep.displayName ?? '؟').trim().charAt(0) || '؟'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-cairo text-[14px] font-medium text-[#030712] truncate">
                          {dep.displayName || 'بدون اسم'}
                        </p>
                        <AgeBadge dateOfBirth={dep.dateOfBirth} compact />
                      </div>
                      <p className="font-cairo text-[11px] text-[#6B7280] mt-0.5">
                        {dep.sex === 'Male' || dep.sex === 'male'
                          ? 'ذكر'
                          : dep.sex === 'Female' || dep.sex === 'female'
                            ? 'أنثى'
                            : 'تابع'}
                      </p>
                    </div>
                    <ChevronLeft
                      className="w-4 h-4 text-[#9CA3AF] flex-shrink-0"
                      strokeWidth={2}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
