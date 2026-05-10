'use client'

/**
 * DependentRegistrationForm — B07 Phase F (Section 4).
 *
 * Form for a parent (authenticated patient) to register a minor dependent.
 * On 201 success: switches active context to the new minor's gp via the
 * AccountProvider's `?as=<minorGpId>` URL param. Toast and redirect to
 * dashboard.
 *
 * Validation:
 *   - displayName required, 1..200 chars
 *   - dateOfBirth required (Phase F UX choice — server allows undefined,
 *     but Mo's age-badge ruling 26 only works with a known DOB; making it
 *     required avoids a silent UX cliff)
 *   - dateOfBirth must be in the past AND result in age < 18 (parent
 *     dependents only; adults handled via "Trusted caregivers" flow)
 *   - sex optional radio (male/female)
 *   - preferredLanguage optional, default 'ar'
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccountSwitcher } from '@patient/lib/contexts/account-context'
import { calculateAge } from '@patient/components/AgeBadge'

interface DependentRegistrationFormProps {
  /** Optional callback after success — used by parent for toast + redirect. */
  onSuccess?: (params: { minorGlobalPatientId: string; displayName: string }) => void
  /** Optional cancel handler — defaults to router.back(). */
  onCancel?: () => void
}

export function DependentRegistrationForm({
  onSuccess,
  onCancel,
}: DependentRegistrationFormProps) {
  const router = useRouter()
  const { refetch, switchTo } = useAccountSwitcher()

  const [displayName, setDisplayName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [sex, setSex] = useState<'' | 'male' | 'female'>('')
  const [preferredLanguage, setPreferredLanguage] = useState<'ar' | 'en'>('ar')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {}
    const name = displayName.trim()
    if (!name) next.displayName = 'الاسم مطلوب'
    else if (name.length > 200) next.displayName = 'الاسم طويل جداً (الحد الأقصى 200 حرف)'

    if (!dateOfBirth) {
      next.dateOfBirth = 'تاريخ الميلاد مطلوب'
    } else {
      const age = calculateAge(dateOfBirth)
      if (age === null) {
        next.dateOfBirth = 'تاريخ الميلاد غير صحيح أو في المستقبل'
      } else if (age >= 18) {
        next.dateOfBirth =
          'هذا التابع عمره ١٨ سنة أو أكثر — استخدم "إضافة مقدم رعاية" من الإعدادات بدلاً من ذلك'
      }
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }, [displayName, dateOfBirth])

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      setServerError(null)
      if (!validate()) return
      setSubmitting(true)
      try {
        const res = await fetch('/api/patient/dependents/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            displayName: displayName.trim(),
            dateOfBirth,
            ...(sex ? { sex } : {}),
            preferredLanguage,
          }),
        })
        if (res.status === 201) {
          const json = await res.json()
          await refetch()
          if (onSuccess) {
            onSuccess({
              minorGlobalPatientId: json.minorGlobalPatientId,
              displayName: json.displayName,
            })
          } else {
            // Default behavior: switch context to the new minor and go to dashboard
            switchTo(json.minorGlobalPatientId)
            router.push(`/patient/dashboard?as=${json.minorGlobalPatientId}`)
          }
          return
        }

        const errJson = await res.json().catch(() => ({}))
        if (res.status === 400) {
          const msg: string = errJson?.error ?? 'تحقق من البيانات المدخلة'
          // Map known server-side validation messages into field errors
          if (msg.includes('displayName')) {
            setErrors({ displayName: msg })
          } else if (msg.includes('dateOfBirth')) {
            setErrors({ dateOfBirth: msg })
          } else if (msg.includes('register your own patient account')) {
            setServerError(
              'يجب إكمال ملفك الشخصي أولاً قبل تسجيل تابع. اذهب إلى الإعدادات > الملف الشخصي.'
            )
          } else {
            setServerError(msg)
          }
        } else if (res.status === 401) {
          setServerError('الجلسة منتهية، أعد تسجيل الدخول')
        } else if (res.status === 403) {
          setServerError(
            errJson?.error ?? 'لا تمتلك صلاحية تسجيل تابع'
          )
        } else {
          setServerError('فشل تسجيل التابع، حاول مرة أخرى')
        }
      } catch (err) {
        console.error('register dependent failed:', err)
        setServerError('فشل الاتصال بالخادم — تحقق من الإنترنت')
      } finally {
        setSubmitting(false)
      }
    },
    [
      displayName,
      dateOfBirth,
      sex,
      preferredLanguage,
      validate,
      refetch,
      switchTo,
      router,
      onSuccess,
    ]
  )

  const formInvalid =
    !displayName.trim() || !dateOfBirth || Object.keys(errors).length > 0

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 font-cairo"
      dir="rtl"
      noValidate
    >
      {/* Above-form info text */}
      <div className="bg-[#F0FDF4] border-[0.8px] border-[#BBF7D0] rounded-[12px] p-3.5">
        <p className="font-cairo text-[12px] text-[#166534] leading-[18px]">
          عند تسجيل تابع، تصبح ولي الأمر القانوني له داخل MedAssist. ستتمكن من
          الاطلاع على سجلاته الصحية، حجز مواعيده، واستلام الإشعارات الخاصة به.
        </p>
      </div>

      {/* Server error */}
      {serverError && (
        <div
          role="alert"
          className="bg-[#FEF2F2] border-[0.8px] border-[#FECACA] rounded-[10px] p-3"
        >
          <p className="font-cairo text-[13px] text-[#B91C1C]">{serverError}</p>
        </div>
      )}

      {/* Display name */}
      <div>
        <label
          htmlFor="dep-displayName"
          className="block font-cairo text-[13px] font-medium text-[#030712] mb-1.5"
        >
          اسم التابع <span className="text-[#B91C1C]">*</span>
        </label>
        <input
          id="dep-displayName"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={200}
          className={`w-full h-[44px] px-3 rounded-[10px] border-[0.8px] bg-white font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 ${
            errors.displayName ? 'border-[#FCA5A5]' : 'border-[#E5E7EB]'
          }`}
          placeholder="الاسم الكامل"
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'dep-displayName-err' : undefined}
        />
        {errors.displayName && (
          <p id="dep-displayName-err" className="mt-1.5 font-cairo text-[12px] text-[#B91C1C]">
            {errors.displayName}
          </p>
        )}
      </div>

      {/* Date of birth */}
      <div>
        <label
          htmlFor="dep-dob"
          className="block font-cairo text-[13px] font-medium text-[#030712] mb-1.5"
        >
          تاريخ الميلاد <span className="text-[#B91C1C]">*</span>
        </label>
        <input
          id="dep-dob"
          type="date"
          required
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          className={`w-full h-[44px] px-3 rounded-[10px] border-[0.8px] bg-white font-cairo text-[14px] text-[#030712] focus:outline-none focus:ring-2 focus:ring-[#16A34A]/30 ${
            errors.dateOfBirth ? 'border-[#FCA5A5]' : 'border-[#E5E7EB]'
          }`}
          aria-invalid={!!errors.dateOfBirth}
          aria-describedby={errors.dateOfBirth ? 'dep-dob-err' : undefined}
        />
        {errors.dateOfBirth && (
          <p id="dep-dob-err" className="mt-1.5 font-cairo text-[12px] text-[#B91C1C]">
            {errors.dateOfBirth}
          </p>
        )}
      </div>

      {/* Sex */}
      <div>
        <span className="block font-cairo text-[13px] font-medium text-[#030712] mb-1.5">
          النوع
        </span>
        <div className="flex gap-2">
          {(['male', 'female'] as const).map((v) => {
            const label = v === 'male' ? 'ذكر' : 'أنثى'
            const checked = sex === v
            return (
              <label
                key={v}
                className={`flex-1 h-[40px] rounded-[10px] border-[0.8px] flex items-center justify-center cursor-pointer transition-colors ${
                  checked
                    ? 'bg-[#F0FDF4] border-[#16A34A] text-[#16A34A]'
                    : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:bg-[#F9FAFB]'
                }`}
              >
                <input
                  type="radio"
                  name="sex"
                  value={v}
                  checked={checked}
                  onChange={() => setSex(v)}
                  className="sr-only"
                />
                <span className="font-cairo text-[13px] font-medium">{label}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Preferred language */}
      <div>
        <span className="block font-cairo text-[13px] font-medium text-[#030712] mb-1.5">
          اللغة المفضلة
        </span>
        <div className="flex gap-2">
          {(['ar', 'en'] as const).map((v) => {
            const label = v === 'ar' ? 'العربية' : 'English'
            const checked = preferredLanguage === v
            return (
              <label
                key={v}
                className={`flex-1 h-[40px] rounded-[10px] border-[0.8px] flex items-center justify-center cursor-pointer transition-colors ${
                  checked
                    ? 'bg-[#F0FDF4] border-[#16A34A] text-[#16A34A]'
                    : 'bg-white border-[#E5E7EB] text-[#4B5563] hover:bg-[#F9FAFB]'
                }`}
              >
                <input
                  type="radio"
                  name="preferredLanguage"
                  value={v}
                  checked={checked}
                  onChange={() => setPreferredLanguage(v)}
                  className="sr-only"
                />
                <span className="font-cairo text-[13px] font-medium">{label}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : router.back())}
          disabled={submitting}
          className="flex-1 h-[44px] rounded-[10px] border-[0.8px] border-[#E5E7EB] bg-white font-cairo text-[14px] font-semibold text-[#4B5563] hover:bg-[#F9FAFB] disabled:opacity-50 transition-colors"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={submitting || formInvalid}
          className="flex-1 h-[44px] rounded-[10px] bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 disabled:cursor-not-allowed font-cairo text-[14px] font-semibold text-white transition-colors"
        >
          {submitting ? 'جاري التسجيل...' : 'تسجيل التابع'}
        </button>
      </div>
    </form>
  )
}
