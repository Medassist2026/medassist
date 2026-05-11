'use client'

/**
 * /patient/settings/family/[id] — B07 Phase F + F.5 (Section 5, detail view).
 *
 * Detail view for a single dependent. Phase F.5 (Section 3) enables inline
 * editing of `display_name` + `preferred_language` via the PATCH endpoint
 * shipped in this phase (Phase F finding #2 closure). Identity fields
 * (date_of_birth, sex) remain locked post-registration.
 *
 * Quick actions thread `?as=<minorGpId>` into deep links for records,
 * appointments, prescriptions. Phase F.5 (Section 1) plumbs cross-context
 * fetching end-to-end (Phase F finding #1 closure).
 *
 * Per Mo ruling 8.6 / Section 5 prompt: NO transfer-guardianship UI in MVP
 * (deferred to Phase 2 custody-dispute work).
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  Check,
  FileText,
  HeartPulse,
  Pencil,
  Pill,
  X,
} from 'lucide-react'
import { PatientHeader } from '@ui-clinic/components/patient/PatientHeader'
import { AccountSwitcher } from '@patient/components/AccountSwitcher'
import { AgeBadge } from '@patient/components/AgeBadge'

interface DependentDetail {
  id: string
  display_name: string | null
  date_of_birth: string | null
  sex: string | null
  preferred_language: string
  is_minor: boolean
  guardian_global_patient_id: string | null
  created_at: string
}

function formatArabicDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('ar-EG', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

export default function FamilyDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [dependent, setDependent] = useState<DependentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftLang, setDraftLang] = useState<'ar' | 'en'>('ar')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/patient/dependents/${id}`)
        if (cancelled) return
        if (res.status === 404) {
          setError('التابع غير موجود')
        } else if (res.status === 403) {
          setError('لا تمتلك صلاحية على هذا التابع')
        } else if (!res.ok) {
          setError('فشل تحميل بيانات التابع')
        } else {
          const json = await res.json()
          setDependent(json.dependent ?? null)
        }
      } catch (err) {
        if (!cancelled) setError('فشل الاتصال بالخادم')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div className="font-cairo">
      <PatientHeader
        title="تفاصيل التابع"
        showBack
        leadingAction={<AccountSwitcher />}
      />

      <div className="px-4 pt-4 pb-24">
        {loading && (
          <div className="space-y-3">
            <div className="h-32 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
            <div className="h-24 bg-[#E5E7EB] rounded-[12px] animate-pulse" />
          </div>
        )}

        {!loading && error && (
          <div className="bg-[#FEF2F2] border-[0.8px] border-[#FECACA] rounded-[12px] p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[#B91C1C] flex-shrink-0" strokeWidth={2} />
            <div>
              <p className="font-cairo text-[13px] text-[#B91C1C] mb-2">{error}</p>
              <button
                type="button"
                onClick={() => router.back()}
                className="font-cairo text-[12px] font-semibold text-[#B91C1C] underline"
              >
                رجوع
              </button>
            </div>
          </div>
        )}

        {!loading && !error && dependent && (
          <>
            {/* Profile card */}
            <section className="bg-white border-[0.8px] border-[#E5E7EB] rounded-[12px] p-4 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                  <span className="font-cairo text-[20px] font-bold text-[#16A34A]">
                    {(dependent.display_name ?? '؟').trim().charAt(0) || '؟'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h2 className="font-cairo text-[18px] font-bold text-[#030712] truncate">
                      {dependent.display_name || 'بدون اسم'}
                    </h2>
                    <AgeBadge dateOfBirth={dependent.date_of_birth} />
                  </div>
                  <p className="font-cairo text-[11px] text-[#6B7280] mt-0.5">
                    مسجَّل منذ {formatArabicDate(dependent.created_at)}
                  </p>
                </div>
              </div>

              {/* Profile fields */}
              {!editing ? (
                <>
                  <dl className="space-y-2.5 text-[13px] font-cairo">
                    <div className="flex items-center justify-between">
                      <dt className="text-[#6B7280]">تاريخ الميلاد</dt>
                      <dd className="text-[#030712] font-medium">
                        {formatArabicDate(dependent.date_of_birth)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-[#6B7280]">النوع</dt>
                      <dd className="text-[#030712] font-medium">
                        {dependent.sex === 'Male' || dependent.sex === 'male'
                          ? 'ذكر'
                          : dependent.sex === 'Female' ||
                              dependent.sex === 'female'
                            ? 'أنثى'
                            : '—'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="text-[#6B7280]">اللغة المفضلة</dt>
                      <dd className="text-[#030712] font-medium">
                        {dependent.preferred_language === 'en'
                          ? 'English'
                          : 'العربية'}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 pt-3 border-t-[0.8px] border-[#F3F4F6] flex items-center justify-between gap-3">
                    <p className="font-cairo text-[11px] text-[#9CA3AF] leading-[16px]">
                      تاريخ الميلاد والنوع غير قابلين للتعديل بعد التسجيل.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName(dependent.display_name ?? '')
                        setDraftLang(
                          dependent.preferred_language === 'en'
                            ? 'en'
                            : 'ar'
                        )
                        setSaveError(null)
                        setEditing(true)
                      }}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[0.8px] border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] font-cairo text-[11px] font-semibold text-[#030712]"
                      aria-label="تعديل الملف"
                    >
                      <Pencil className="w-3 h-3" strokeWidth={2} />
                      تعديل
                    </button>
                  </div>
                </>
              ) : (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!dependent) return
                    const trimmed = draftName.trim()
                    if (trimmed.length === 0) {
                      setSaveError('الاسم مطلوب')
                      return
                    }
                    if (trimmed.length > 200) {
                      setSaveError(
                        'الاسم يجب أن يكون 200 حرف أو أقل'
                      )
                      return
                    }
                    setSaving(true)
                    setSaveError(null)
                    try {
                      const res = await fetch(
                        `/api/patient/dependents/${dependent.id}`,
                        {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            displayName: trimmed,
                            preferredLanguage: draftLang,
                          }),
                        }
                      )
                      const data = await res.json()
                      if (!res.ok) {
                        throw new Error(data.error || 'فشل الحفظ')
                      }
                      setDependent(data.dependent ?? null)
                      setEditing(false)
                    } catch (err) {
                      setSaveError(
                        err instanceof Error ? err.message : 'فشل الحفظ'
                      )
                    } finally {
                      setSaving(false)
                    }
                  }}
                  className="space-y-3 text-[13px] font-cairo"
                >
                  <div>
                    <label className="block text-[#6B7280] mb-1.5">
                      الاسم
                    </label>
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      maxLength={200}
                      disabled={saving}
                      className="w-full px-3 py-2 border-[0.8px] border-[#E5E7EB] rounded-[8px] font-cairo text-[14px] text-[#030712] disabled:bg-[#F9FAFB]"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[#6B7280] mb-1.5">
                      اللغة المفضلة
                    </label>
                    <select
                      value={draftLang}
                      onChange={(e) =>
                        setDraftLang(e.target.value as 'ar' | 'en')
                      }
                      disabled={saving}
                      className="w-full px-3 py-2 border-[0.8px] border-[#E5E7EB] rounded-[8px] font-cairo text-[14px] text-[#030712] disabled:bg-[#F9FAFB]"
                    >
                      <option value="ar">العربية</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  {saveError && (
                    <p className="text-[#B91C1C] text-[12px]">{saveError}</p>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] bg-[#16A34A] hover:bg-[#15803D] disabled:bg-[#9CA3AF] text-white font-cairo text-[13px] font-semibold"
                    >
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                      {saving ? 'يحفظ…' : 'حفظ'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false)
                        setSaveError(null)
                      }}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[8px] border-[0.8px] border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] font-cairo text-[13px] font-semibold text-[#030712]"
                    >
                      <X className="w-4 h-4" strokeWidth={2} />
                      إلغاء
                    </button>
                  </div>
                </form>
              )}
            </section>

            {/* Quick actions */}
            <section>
              <h3 className="font-cairo text-[15px] font-semibold text-[#030712] mb-2.5">
                إجراءات سريعة
              </h3>
              <div className="bg-white rounded-[12px] border-[0.8px] border-[#E5E7EB] divide-y divide-[#F3F4F6] overflow-hidden">
                <QuickActionRow
                  href={`/patient/health?as=${dependent.id}`}
                  icon={<HeartPulse className="w-4 h-4" strokeWidth={1.8} />}
                  label="السجلات الصحية"
                />
                <QuickActionRow
                  href={`/patient/appointments?as=${dependent.id}`}
                  icon={<Calendar className="w-4 h-4" strokeWidth={1.8} />}
                  label="المواعيد"
                />
                <QuickActionRow
                  href={`/patient/prescriptions?as=${dependent.id}`}
                  icon={<Pill className="w-4 h-4" strokeWidth={1.8} />}
                  label="الوصفات الطبية"
                />
                <QuickActionRow
                  href={`/patient/health?as=${dependent.id}`}
                  icon={<FileText className="w-4 h-4" strokeWidth={1.8} />}
                  label="نتائج التحاليل"
                />
              </div>
              <p className="font-cairo text-[10px] text-[#9CA3AF] mt-2 leading-[14px]">
                تنبيه: عرض السجلات بالنيابة قيد التطوير. ستتمكن قريباً من رؤية
                بيانات التابع كاملة في كل قسم.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function QuickActionRow({
  href,
  icon,
  label,
}: {
  href: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 hover:bg-[#F9FAFB] transition-colors"
    >
      <div className="w-9 h-9 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
        <span className="text-[#16A34A]">{icon}</span>
      </div>
      <span className="flex-1 font-cairo text-[14px] font-medium text-[#030712]">
        {label}
      </span>
      <ChevronLeft className="w-4 h-4 text-[#9CA3AF] flex-shrink-0" strokeWidth={2} />
    </Link>
  )
}
