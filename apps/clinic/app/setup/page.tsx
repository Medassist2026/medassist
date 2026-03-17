'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Stethoscope, Building2, Users, ChevronLeft, Copy, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Post-Auth Setup Page
 *
 * Shown when an authenticated user has no clinic yet, OR when accessed
 * via settings to join an additional clinic.
 *
 * Three paths:
 *   1. "أنا طبيب" — Doctor creates a new clinic (name + specialty) → shows invite code
 *   2. "انضم لعيادة" — Any role enters an invite code to join existing clinic
 *   3. "clinic-created" — Success screen showing the invite code to share
 */

type SetupStep = 'choose' | 'create-clinic' | 'join-clinic' | 'clinic-created'

const specialties = [
  { value: 'general', label: 'طب عام' },
  { value: 'internal-medicine', label: 'باطنة' },
  { value: 'pediatrics', label: 'أطفال' },
  { value: 'obstetrics-gynecology', label: 'نساء وتوليد' },
  { value: 'cardiology', label: 'قلب وأوعية دموية' },
  { value: 'orthopedics', label: 'عظام' },
  { value: 'dermatology', label: 'جلدية' },
  { value: 'ophthalmology', label: 'عيون' },
  { value: 'ent', label: 'أنف وأذن وحنجرة' },
  { value: 'neurology', label: 'مخ وأعصاب' },
  { value: 'psychiatry', label: 'نفسية' },
  { value: 'urology', label: 'مسالك بولية' },
  { value: 'surgery', label: 'جراحة عامة' },
  { value: 'dentistry', label: 'أسنان' },
  { value: 'radiology', label: 'أشعة' },
  { value: 'laboratory', label: 'تحاليل' },
  { value: 'physiotherapy', label: 'علاج طبيعي' },
  { value: 'nutrition', label: 'تغذية' },
]

export default function SetupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <SetupPageInner />
    </Suspense>
  )
}

function SetupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode')
  const [step, setStep] = useState<SetupStep>(mode === 'join' ? 'join-clinic' : 'choose')

  // Create clinic fields
  const [clinicName, setClinicName] = useState('')
  const [specialty, setSpecialty] = useState('')

  // Join clinic fields
  const [inviteCode, setInviteCode] = useState('')

  // Success state
  const [createdClinicCode, setCreatedClinicCode] = useState('')
  const [createdClinicName, setCreatedClinicName] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Create clinic handler
  const handleCreateClinic = async () => {
    if (!clinicName.trim() || clinicName.trim().length < 2) {
      setError('أدخل اسم العيادة (حرفين على الأقل)')
      return
    }
    if (!specialty) {
      setError('اختر التخصص')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Step 1: Update doctor specialty
      await fetch('/api/doctor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialty }),
      })

      // Step 2: Create clinic
      const res = await fetch('/api/clinic/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clinicName.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'فشل في إنشاء العيادة')
      }

      const data = await res.json()

      // Show success screen with invite code
      setCreatedClinicCode(data.clinicUniqueId || '')
      setCreatedClinicName(clinicName.trim())
      setStep('clinic-created')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Copy invite code
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(createdClinicCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input')
      input.value = createdClinicCode
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  // Join clinic handler
  const handleJoinClinic = async () => {
    if (!inviteCode.trim()) {
      setError('أدخل كود الدعوة')
      return
    }

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/clinic/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicUniqueId: inviteCode.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'كود الدعوة غير صحيح')
      }

      const data = await res.json()

      // Success → redirect based on server response
      const redirectPath = data.redirectPath || '/doctor/dashboard'
      router.push(redirectPath)
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div dir="rtl" className="min-h-screen bg-white flex flex-col">
      {/* Logo */}
      <div className="flex flex-col items-center pt-16">
        <div className="w-[32px] h-[32px] bg-[#16A34A] rounded-lg flex items-center justify-center">
          <Stethoscope className="w-[17px] h-[17px] text-white" strokeWidth={1.5} />
        </div>
        <span className="mt-3 font-inter text-[18px] leading-[22px] font-semibold text-[#030712]">
          MedAssist
        </span>
      </div>

      <AnimatePresence mode="wait">
        {step === 'choose' && (
          <motion.div
            key="choose"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center px-4 mt-10"
          >
            <h1 className="font-cairo text-[22px] leading-[33px] font-bold text-[#030712] text-center">
              أهلاً بيك في MedAssist
            </h1>
            <p className="mt-2 font-cairo text-[14px] leading-[21px] text-[#4B5563] text-center">
              اختر كيف تريد استخدام التطبيق
            </p>

            {/* Create clinic card */}
            <button
              onClick={() => { setStep('create-clinic'); setError('') }}
              className="w-full mt-8 p-5 bg-[#F9FAFB] border-[1.5px] border-[#E5E7EB] rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-all"
            >
              <div className="w-12 h-12 bg-[#DCFCE7] rounded-xl flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-[#16A34A]" />
              </div>
              <div className="flex-1 text-right">
                <h3 className="font-cairo text-[16px] font-bold text-[#030712]">أنشئ عيادة جديدة</h3>
                <p className="font-cairo text-[13px] text-[#4B5563] mt-0.5">أنشئ عيادتك وابدأ استقبال المرضى</p>
              </div>
              <ChevronLeft className="w-5 h-5 text-[#9CA3AF] flex-shrink-0" />
            </button>

            {/* Join clinic card */}
            <button
              onClick={() => { setStep('join-clinic'); setError('') }}
              className="w-full mt-4 p-5 bg-[#F9FAFB] border-[1.5px] border-[#E5E7EB] rounded-2xl flex items-center gap-4 active:scale-[0.98] transition-all"
            >
              <div className="w-12 h-12 bg-[#DBEAFE] rounded-xl flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-[#2563EB]" />
              </div>
              <div className="flex-1 text-right">
                <h3 className="font-cairo text-[16px] font-bold text-[#030712]">انضم لعيادة موجودة</h3>
                <p className="font-cairo text-[13px] text-[#4B5563] mt-0.5">انضم كطبيب أو استقبال بكود الدعوة</p>
              </div>
              <ChevronLeft className="w-5 h-5 text-[#9CA3AF] flex-shrink-0" />
            </button>
          </motion.div>
        )}

        {step === 'create-clinic' && (
          <motion.div
            key="create"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col px-4 mt-8"
          >
            {/* Back */}
            <button
              onClick={() => { setStep('choose'); setError('') }}
              className="font-cairo text-[14px] text-[#16A34A] font-medium mb-6"
            >
              ← رجوع
            </button>

            <h2 className="font-cairo text-[20px] leading-[30px] font-bold text-[#030712]">
              أنشئ عيادتك
            </h2>
            <p className="mt-1 font-cairo text-[14px] text-[#4B5563]">
              أدخل بيانات عيادتك للبدء
            </p>

            {/* Clinic name */}
            <div className="flex flex-col gap-2 mt-6">
              <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
                اسم العيادة
              </label>
              <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <input
                  type="text"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  placeholder="مثال: عيادة التجمع الخامس"
                  className="flex-1 bg-transparent font-cairo text-[14px] leading-[26px] text-[#030712] placeholder:text-[#9CA3AF] outline-none text-right"
                />
              </div>
            </div>

            {/* Specialty */}
            <div className="flex flex-col gap-2 mt-5">
              <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
                التخصص
              </label>
              <div className="bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <select
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="w-full h-full bg-transparent font-cairo text-[14px] text-[#030712] outline-none appearance-none"
                  style={{ direction: 'rtl' }}
                >
                  <option value="">اختر التخصص</option>
                  {specialties.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="mt-4 font-cairo text-[14px] text-red-500 text-center">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleCreateClinic}
              disabled={loading || !clinicName.trim() || !specialty}
              className={`w-full h-[48px] rounded-lg font-cairo font-semibold text-[16px] leading-[24px] transition-all mt-6 ${
                clinicName.trim() && specialty
                  ? 'bg-[#22C55E] text-[#F9FAFB] active:scale-[0.98]'
                  : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              {loading ? '...' : 'إنشاء العيادة'}
            </button>
          </motion.div>
        )}

        {/* ============ SUCCESS: SHOW INVITE CODE ============ */}
        {step === 'clinic-created' && (
          <motion.div
            key="created"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center px-4 mt-10"
          >
            {/* Success icon */}
            <div className="w-16 h-16 bg-[#DCFCE7] rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-[#16A34A]" />
            </div>

            <h2 className="mt-5 font-cairo text-[22px] leading-[33px] font-bold text-[#030712] text-center">
              تم إنشاء العيادة بنجاح
            </h2>
            <p className="mt-2 font-cairo text-[14px] leading-[21px] text-[#4B5563] text-center">
              "{createdClinicName}" جاهزة للاستخدام
            </p>

            {/* Invite code card */}
            <div className="w-full mt-8 bg-[#F0FDF4] border-[1.5px] border-[#BBF7D0] rounded-2xl p-6">
              <p className="font-cairo text-[14px] text-[#15803D] text-center font-medium">
                كود الدعوة الخاص بعيادتك
              </p>
              <p className="font-cairo text-[12px] text-[#4B5563] text-center mt-1">
                شارك هذا الكود مع فريقك للانضمام للعيادة
              </p>

              {/* Code display */}
              <div className="flex items-center justify-center gap-3 mt-4">
                <span className="font-inter text-[28px] font-bold text-[#030712] tracking-[0.2em]" dir="ltr">
                  {createdClinicCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  className="w-10 h-10 rounded-lg bg-white border-[0.8px] border-[#D1D5DB] flex items-center justify-center hover:bg-[#F9FAFB] transition-colors"
                >
                  {codeCopied ? (
                    <Check className="w-5 h-5 text-[#16A34A]" />
                  ) : (
                    <Copy className="w-5 h-5 text-[#4B5563]" />
                  )}
                </button>
              </div>

              {codeCopied && (
                <p className="font-cairo text-[12px] text-[#16A34A] text-center mt-2 font-medium">
                  تم النسخ
                </p>
              )}
            </div>

            {/* Continue to dashboard */}
            <button
              onClick={() => {
                router.push('/doctor/dashboard')
                router.refresh()
              }}
              className="w-full h-[48px] rounded-lg font-cairo font-semibold text-[16px] leading-[24px] bg-[#22C55E] text-[#F9FAFB] active:scale-[0.98] transition-all mt-6"
            >
              الذهاب للوحة التحكم
            </button>

            <p className="mt-3 font-cairo text-[12px] text-[#9CA3AF] text-center">
              يمكنك أيضاً العثور على الكود لاحقاً في إعدادات العيادة
            </p>
          </motion.div>
        )}

        {step === 'join-clinic' && (
          <motion.div
            key="join"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="flex flex-col px-4 mt-8"
          >
            {/* Back */}
            <button
              onClick={() => { setStep('choose'); setError('') }}
              className="font-cairo text-[14px] text-[#16A34A] font-medium mb-6"
            >
              ← رجوع
            </button>

            <h2 className="font-cairo text-[20px] leading-[30px] font-bold text-[#030712]">
              انضم لعيادة
            </h2>
            <p className="mt-1 font-cairo text-[14px] text-[#4B5563]">
              أدخل كود الدعوة الذي حصلت عليه من الطبيب
            </p>

            {/* Invite code */}
            <div className="flex flex-col gap-2 mt-6">
              <label className="font-cairo text-[14px] leading-[21px] text-[#030712]">
                كود الدعوة
              </label>
              <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-YY"
                  className="flex-1 bg-transparent font-inter text-[16px] font-medium text-[#030712] placeholder:text-[#9CA3AF] outline-none text-center tracking-widest"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="mt-4 font-cairo text-[14px] text-red-500 text-center">{error}</p>
            )}

            {/* Submit */}
            <button
              onClick={handleJoinClinic}
              disabled={loading || !inviteCode.trim()}
              className={`w-full h-[48px] rounded-lg font-cairo font-semibold text-[16px] leading-[24px] transition-all mt-6 ${
                inviteCode.trim()
                  ? 'bg-[#22C55E] text-[#F9FAFB] active:scale-[0.98]'
                  : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              {loading ? '...' : 'انضم للعيادة'}
            </button>

            <p className="mt-4 font-cairo text-[12px] text-[#9CA3AF] text-center">
              لو مش معاك كود، اطلبه من الطبيب المسؤول عن العيادة
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1" />
    </div>
  )
}
