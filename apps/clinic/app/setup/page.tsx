'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  Stethoscope, Building2, Users, ChevronLeft, Copy, Check,
  Sparkles, ClipboardList, UserCheck, MessageCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type SetupStep = 'choose' | 'create-clinic' | 'join-clinic' | 'clinic-created'
type UserRole  = 'doctor' | 'frontdesk' | null

const specialties = [
  { value: 'general',                label: 'طب عام' },
  { value: 'internal-medicine',      label: 'باطنة' },
  { value: 'pediatrics',             label: 'أطفال' },
  { value: 'obstetrics-gynecology',  label: 'نساء وتوليد' },
  { value: 'cardiology',             label: 'قلب وأوعية دموية' },
  { value: 'orthopedics',            label: 'عظام' },
  { value: 'dermatology',            label: 'جلدية' },
  { value: 'ophthalmology',          label: 'عيون' },
  { value: 'ent',                    label: 'أنف وأذن وحنجرة' },
  { value: 'neurology',              label: 'مخ وأعصاب' },
  { value: 'psychiatry',             label: 'نفسية' },
  { value: 'urology',                label: 'مسالك بولية' },
  { value: 'surgery',                label: 'جراحة عامة' },
  { value: 'dentistry',              label: 'أسنان' },
  { value: 'radiology',              label: 'أشعة' },
  { value: 'laboratory',             label: 'تحاليل' },
  { value: 'physiotherapy',          label: 'علاج طبيعي' },
  { value: 'nutrition',              label: 'تغذية' },
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
  const roleParam  = (searchParams.get('role') as UserRole) ?? null
  const modeParam  = searchParams.get('mode')
  const codeParam  = searchParams.get('code') ?? ''   // pre-filled invite code from share link

  // Frontdesk: skip choose step entirely — they can only join
  const initialStep: SetupStep =
    roleParam === 'frontdesk' ? 'join-clinic'
    : modeParam === 'join'   ? 'join-clinic'
    : 'choose'

  const [step, setStep] = useState<SetupStep>(initialStep)

  // Create clinic
  const [clinicName,    setClinicName]    = useState('')
  const [clinicAddress, setClinicAddress] = useState('')
  const [specialty,     setSpecialty]     = useState('')

  // Join clinic — pre-fill if a ?code= param was passed via the share link
  const [inviteCode, setInviteCode] = useState(codeParam)

  // Success
  const [createdClinicCode, setCreatedClinicCode] = useState('')
  const [createdClinicName, setCreatedClinicName] = useState('')
  const [codeCopied,        setCodeCopied]        = useState(false)

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  // ── Create clinic ──────────────────────────────────────────────────────────
  const handleCreateClinic = async () => {
    if (!clinicName.trim() || clinicName.trim().length < 2) {
      setError('أدخل اسم العيادة (حرفين على الأقل)')
      return
    }
    if (!clinicAddress.trim() || clinicAddress.trim().length < 5) {
      setError('أدخل عنوان العيادة (خمسة أحرف على الأقل) — يظهر على الروشتة')
      return
    }
    if (!specialty) {
      setError('اختر التخصص')
      return
    }
    setLoading(true)
    setError('')
    try {
      await fetch('/api/doctor/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialty }),
      })
      const res = await fetch('/api/clinic/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clinicName.trim(), address: clinicAddress.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'فشل في إنشاء العيادة')
      }
      const data = await res.json()
      // Show the invite code (not unique_id) so the owner can share it immediately
      setCreatedClinicCode(data.inviteCode || data.clinicUniqueId || '')
      setCreatedClinicName(clinicName.trim())
      setStep('clinic-created')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Copy invite code ───────────────────────────────────────────────────────
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(createdClinicCode)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch {
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

  // ── Join clinic ────────────────────────────────────────────────────────────
  const handleJoinClinic = async () => {
    if (!inviteCode.trim()) {
      setError('أدخل كود الدعوة')
      return
    }
    // Validate invite code format: XXXX-XX (4+2 chars, uppercase alphanumeric)
    // Strip the auto-inserted dash before checking length
    const normalizedForValidation = inviteCode.trim().toUpperCase().replace(/[\s-]/g, '')
    if (normalizedForValidation.length !== 6 || !/^[A-Z0-9]{6}$/.test(normalizedForValidation)) {
      setError('كود الدعوة يجب أن يكون 6 أحرف وأرقام — مثال: ABCD-EF')
      return
    }
    // Doctors must select specialty before joining
    if (roleParam !== 'frontdesk' && !specialty) {
      setError('اختر تخصصك أولاً')
      return
    }
    setLoading(true)
    setError('')
    try {
      // Update specialty for doctor users (fire-and-forget — non-blocking)
      if (roleParam !== 'frontdesk' && specialty) {
        await fetch('/api/doctor/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ specialty }),
        })
      }

      const res = await fetch('/api/clinic/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode: inviteCode.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'كود الدعوة غير صحيح')
      }
      const data = await res.json()
      router.push(data.redirectPath || '/doctor/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Left panel content per step ────────────────────────────────────────────
  const leftPanel = {
    choose: {
      bg: 'from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0]',
      icon: <Stethoscope className="w-[44px] h-[44px] text-[#16A34A]" strokeWidth={1.5} />,
      iconBg: 'bg-white',
      heading: 'أهلاً بك في MedAssist',
      sub: 'نظام إدارة العيادة الأذكى في مصر',
      bullets: [
        { icon: <ClipboardList className="w-4 h-4 text-[#16A34A]" />, text: 'روشتة رقمية بلمسة واحدة' },
        { icon: <UserCheck    className="w-4 h-4 text-[#16A34A]" />, text: 'جدولة المرضى بدون فوضى' },
        { icon: <Sparkles     className="w-4 h-4 text-[#16A34A]" />, text: 'تقارير فورية دائماً معاك' },
      ],
    },
    'create-clinic': {
      bg: 'from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0]',
      icon: <Building2 className="w-[44px] h-[44px] text-[#16A34A]" strokeWidth={1.5} />,
      iconBg: 'bg-white',
      heading: 'أنشئ عيادتك الرقمية',
      sub: 'أدخل بيانات العيادة وابدأ الاستقبال في دقيقتين',
      bullets: [
        { icon: <Check        className="w-4 h-4 text-[#16A34A]" />, text: 'سجل بياناتك مرة واحدة فقط' },
        { icon: <Users        className="w-4 h-4 text-[#16A34A]" />, text: 'ادعو فريقك بكود الدعوة' },
        { icon: <Sparkles     className="w-4 h-4 text-[#16A34A]" />, text: 'تحكم كامل في العيادة' },
      ],
    },
    'join-clinic': {
      bg: 'from-[#EFF6FF] via-[#DBEAFE] to-[#BFDBFE]',
      icon: <Users className="w-[44px] h-[44px] text-[#2563EB]" strokeWidth={1.5} />,
      iconBg: 'bg-white',
      heading: roleParam === 'frontdesk' ? 'انضم لعيادتك' : 'انضم كطبيب',
      sub: roleParam === 'frontdesk'
        ? 'اطلب كود الدعوة من الطبيب المسؤول عن العيادة'
        : 'استخدم كود الدعوة الذي أرسله لك الطبيب صاحب العيادة',
      bullets: [
        { icon: <MessageCircle className="w-4 h-4 text-[#2563EB]" />, text: 'اطلب الكود من إدارة العيادة' },
        { icon: <Check         className="w-4 h-4 text-[#2563EB]" />, text: 'أدخله وانضم فوراً' },
        { icon: <Sparkles      className="w-4 h-4 text-[#2563EB]" />, text: 'ابدأ العمل على الفور' },
      ],
    },
    'clinic-created': {
      bg: 'from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0]',
      icon: <Check className="w-[44px] h-[44px] text-[#16A34A]" strokeWidth={2.5} />,
      iconBg: 'bg-[#DCFCE7]',
      heading: 'عيادتك جاهزة!',
      sub: 'شارك كود الدعوة مع فريقك حتى ينضموا للعيادة',
      bullets: [
        { icon: <Users    className="w-4 h-4 text-[#16A34A]" />, text: 'الطاقم يدخل بنفس الكود' },
        { icon: <Building2 className="w-4 h-4 text-[#16A34A]" />, text: 'الكود متاح دائماً في الإعدادات' },
        { icon: <Sparkles  className="w-4 h-4 text-[#16A34A]" />, text: 'يمكنك إضافة أطباء أخرين لاحقاً' },
      ],
    },
  }

  const panel = leftPanel[step]
  const isJoinBlue = step === 'join-clinic'

  return (
    <div dir="rtl" className="min-h-screen bg-white flex flex-col lg:flex-row overflow-hidden">

      {/* ─── RIGHT PANEL — form ─────────────────────────────────────────────── */}
      <div className="flex-1 lg:w-[55%] flex flex-col min-h-screen lg:min-h-0">

        {/* Logo */}
        <div className="flex items-center gap-3 px-6 lg:px-12 pt-10 lg:pt-10">
          <div className="w-[36px] h-[36px] bg-[#16A34A] rounded-xl flex items-center justify-center shadow-sm shadow-green-200">
            <Stethoscope className="w-[18px] h-[18px] text-white" strokeWidth={1.5} />
          </div>
          <span className="font-inter text-[18px] font-semibold text-[#030712]">MedAssist</span>
        </div>

        {/* Step content */}
        <div className="flex-1 flex flex-col justify-center px-6 lg:px-16 py-8">
          <AnimatePresence mode="wait">

            {/* ── CHOOSE step ── */}
            {step === 'choose' && (
              <motion.div
                key="choose"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              >
                <h1 className="font-cairo text-[26px] leading-[38px] font-bold text-[#030712]">
                  أهلاً بيك في MedAssist
                </h1>
                <p className="mt-2 font-cairo text-[14px] leading-[22px] text-[#4B5563]">
                  اختر كيف تريد استخدام التطبيق
                </p>

                <div className="flex flex-col gap-4 mt-8">
                  {/* Create clinic — DOCTORS ONLY, hidden for frontdesk */}
                  {roleParam !== 'frontdesk' && (
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setStep('create-clinic'); setError('') }}
                    className="w-full p-5 bg-[#F0FDF4] border-[1.5px] border-[#86EFAC] rounded-2xl flex items-center gap-4 text-right"
                  >
                    <div className="w-12 h-12 bg-[#22C55E] rounded-xl flex items-center justify-center flex-shrink-0 shadow-md shadow-green-200">
                      <Building2 className="w-6 h-6 text-white" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-cairo text-[16px] font-bold text-[#030712]">أنشئ عيادة جديدة</h3>
                        <span className="text-[11px] font-cairo font-semibold bg-[#22C55E] text-white px-2 py-0.5 rounded-full">موصى به</span>
                      </div>
                      <p className="font-cairo text-[13px] text-[#4B5563]">أنشئ عيادتك وابدأ استقبال المرضى</p>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-[#22C55E] flex-shrink-0" />
                  </motion.button>
                  )}

                  {/* Join clinic — secondary */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setStep('join-clinic'); setError('') }}
                    className="w-full p-5 bg-[#F9FAFB] border-[1.5px] border-[#E5E7EB] rounded-2xl flex items-center gap-4 text-right"
                  >
                    <div className="w-12 h-12 bg-[#DBEAFE] rounded-xl flex items-center justify-center flex-shrink-0">
                      <Users className="w-6 h-6 text-[#2563EB]" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-cairo text-[16px] font-bold text-[#030712]">انضم لعيادة موجودة</h3>
                      <p className="font-cairo text-[13px] text-[#4B5563]">
                        {roleParam === 'doctor' ? 'انضم كطبيب بكود الدعوة' : 'انضم بكود الدعوة'}
                      </p>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-[#9CA3AF] flex-shrink-0" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ── CREATE CLINIC step ── */}
            {step === 'create-clinic' && (
              <motion.div
                key="create"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              >
                <button
                  onClick={() => { setStep('choose'); setError('') }}
                  className="font-cairo text-[14px] text-[#16A34A] font-medium mb-6 flex items-center gap-1 hover:underline"
                >
                  <ChevronLeft className="w-4 h-4 rotate-180" /> رجوع
                </button>

                <h2 className="font-cairo text-[22px] leading-[33px] font-bold text-[#030712]">
                  أنشئ عيادتك
                </h2>
                <p className="mt-1 font-cairo text-[14px] text-[#4B5563]">
                  أدخل بيانات العيادة للبدء
                </p>

                <div className="flex flex-col gap-2 mt-7">
                  <label className="font-cairo text-[14px] font-medium text-[#030712]">اسم العيادة</label>
                  <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-xl h-[52px] px-4 focus-within:border-[#16A34A] focus-within:ring-2 focus-within:ring-[#16A34A]/20 transition-all">
                    <input
                      type="text"
                      value={clinicName}
                      onChange={(e) => setClinicName(e.target.value)}
                      placeholder="مثال: عيادة التجمع الخامس"
                      className="flex-1 bg-transparent font-cairo text-[15px] text-[#030712] placeholder:text-[#9CA3AF] outline-none text-right"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-5">
                  <label className="font-cairo text-[14px] font-medium text-[#030712]">
                    عنوان العيادة
                    <span className="text-red-500 mr-1">*</span>
                    <span className="font-normal text-[12px] text-[#6B7280] mr-1">— يظهر على الروشتة</span>
                  </label>
                  <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-xl h-[52px] px-4 focus-within:border-[#16A34A] focus-within:ring-2 focus-within:ring-[#16A34A]/20 transition-all">
                    <input
                      type="text"
                      value={clinicAddress}
                      onChange={(e) => setClinicAddress(e.target.value)}
                      placeholder="مثال: ١٢ شارع التحرير، المعادي، القاهرة"
                      className="flex-1 bg-transparent font-cairo text-[15px] text-[#030712] placeholder:text-[#9CA3AF] outline-none text-right"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-5">
                  <label className="font-cairo text-[14px] font-medium text-[#030712]">التخصص</label>
                  {/* FIX 4: Click-based specialty picker */}
                  <div className="flex flex-wrap gap-2">
                    {specialties.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setSpecialty(s.value)}
                        className={`px-3 py-2 rounded-[10px] font-cairo text-[13px] border transition-colors ${
                          specialty === s.value
                            ? 'border-[#16A34A] bg-[#F0FDF4] text-[#16A34A] font-semibold'
                            : 'border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#16A34A]'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 font-cairo text-[14px] text-red-500 text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <motion.button
                  whileTap={clinicName.trim() && clinicAddress.trim() && specialty ? { scale: 0.97 } : {}}
                  onClick={handleCreateClinic}
                  disabled={loading || !clinicName.trim() || !clinicAddress.trim() || !specialty}
                  className={`w-full h-[52px] rounded-xl font-cairo font-semibold text-[16px] transition-all mt-7 ${
                    clinicName.trim() && clinicAddress.trim() && specialty
                      ? 'bg-[#22C55E] text-white shadow-md shadow-green-200 hover:bg-[#16A34A]'
                      : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      جاري الإنشاء...
                    </span>
                  ) : 'إنشاء العيادة'}
                </motion.button>
              </motion.div>
            )}

            {/* ── CLINIC CREATED step ── */}
            {step === 'clinic-created' && (
              <motion.div
                key="created"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                className="flex flex-col items-center text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 18 }}
                  className="w-[72px] h-[72px] bg-[#DCFCE7] rounded-full flex items-center justify-center"
                >
                  <Check className="w-9 h-9 text-[#16A34A]" strokeWidth={2.5} />
                </motion.div>

                <h2 className="mt-5 font-cairo text-[24px] font-bold text-[#030712]">
                  تم إنشاء العيادة بنجاح 🎉
                </h2>
                <p className="mt-2 font-cairo text-[14px] text-[#4B5563]">
                  "{createdClinicName}" جاهزة للاستخدام
                </p>

                <div className="w-full mt-8 bg-[#F0FDF4] border-[1.5px] border-[#BBF7D0] rounded-2xl p-6">
                  <p className="font-cairo text-[14px] text-[#15803D] font-semibold">
                    كود الدعوة الخاص بعيادتك
                  </p>
                  <p className="font-cairo text-[12px] text-[#4B5563] mt-1">
                    شارك هذا الكود مع فريقك للانضمام
                  </p>
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <span className="font-inter text-[30px] font-bold text-[#030712] tracking-[0.2em]" dir="ltr">
                      {createdClinicCode}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="w-10 h-10 rounded-xl bg-white border-[0.8px] border-[#D1D5DB] flex items-center justify-center hover:bg-[#F9FAFB] transition-colors"
                    >
                      {codeCopied
                        ? <Check className="w-5 h-5 text-[#16A34A]" />
                        : <Copy  className="w-5 h-5 text-[#4B5563]" />
                      }
                    </button>
                  </div>
                  {codeCopied && (
                    <p className="font-cairo text-[12px] text-[#16A34A] mt-2 font-medium">تم النسخ ✓</p>
                  )}
                </div>

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { router.push('/doctor/dashboard'); router.refresh() }}
                  className="w-full h-[52px] rounded-xl font-cairo font-semibold text-[16px] bg-[#22C55E] text-white shadow-md shadow-green-200 hover:bg-[#16A34A] transition-all mt-6"
                >
                  الذهاب للوحة التحكم
                </motion.button>

                <p className="mt-3 font-cairo text-[12px] text-[#9CA3AF]">
                  يمكنك إيجاد الكود دائماً في إعدادات العيادة
                </p>
              </motion.div>
            )}

            {/* ── JOIN CLINIC step ── */}
            {step === 'join-clinic' && (
              <motion.div
                key="join"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              >
                {/* Back button — only if doctor (frontdesk has no "choose" step) */}
                {roleParam !== 'frontdesk' && (
                  <button
                    onClick={() => { setStep('choose'); setError('') }}
                    className="font-cairo text-[14px] text-[#16A34A] font-medium mb-6 flex items-center gap-1 hover:underline"
                  >
                    <ChevronLeft className="w-4 h-4 rotate-180" /> رجوع
                  </button>
                )}

                <h2 className="font-cairo text-[22px] leading-[33px] font-bold text-[#030712]">
                  {roleParam === 'frontdesk' ? 'انضم لعيادتك' : 'انضم لعيادة'}
                </h2>
                <p className="mt-1 font-cairo text-[14px] text-[#4B5563]">
                  {roleParam === 'frontdesk'
                    ? 'اطلب كود الدعوة من الطبيب المسؤول عن العيادة'
                    : 'أدخل كود الدعوة الذي حصلت عليه من الطبيب'
                  }
                </p>

                {/* Frontdesk hint */}
                {roleParam === 'frontdesk' && (
                  <div className="mt-5 p-4 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl">
                    <p className="font-cairo text-[13px] text-[#1D4ED8] font-semibold">كيف تحصل على الكود؟</p>
                    <p className="font-cairo text-[12px] text-[#3B82F6] mt-1">
                      اطلب من الطبيب صاحب العيادة يبعتلك الكود. هيلاقيه في إعدادات العيادة ← كود الدعوة.
                    </p>
                  </div>
                )}

                {/* Specialty picker — doctors only */}
                {roleParam !== 'frontdesk' && (
                  <div className="flex flex-col gap-2 mt-6">
                    <label className="font-cairo text-[14px] font-medium text-[#030712]">
                      تخصصك <span className="text-red-500">*</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {specialties.map(s => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setSpecialty(s.value)}
                          className={`px-3 py-1.5 rounded-lg font-cairo text-[13px] font-medium border transition-all ${
                            specialty === s.value
                              ? 'border-[#16A34A] bg-[#F0FDF4] text-[#16A34A]'
                              : 'border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563] hover:border-[#16A34A]/40'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 mt-6">
                  <label className="font-cairo text-[14px] font-medium text-[#030712]">كود الدعوة</label>
                  <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-xl h-[52px] px-4 focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#2563EB]/20 transition-all">
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => {
                        // Strip non-alphanumeric, uppercase, max 6 chars
                        const raw = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)
                        // Auto-format as XXXX-XX while typing
                        const formatted = raw.length > 4 ? raw.slice(0, 4) + '-' + raw.slice(4) : raw
                        setInviteCode(formatted)
                        setError('')
                      }}
                      placeholder="XXXX-XX"
                      maxLength={7}
                      className="flex-1 bg-transparent font-inter text-[20px] font-bold text-[#030712] placeholder:text-[#9CA3AF] placeholder:font-normal placeholder:text-[16px] outline-none text-center tracking-[0.25em]"
                      dir="ltr"
                    />
                  </div>
                  <p className="font-cairo text-[12px] text-[#9CA3AF] text-center">
                    الكود مكوّن من 6 أحرف وأرقام — مثال: <span dir="ltr" className="font-inter font-semibold tracking-wider">ABCD-EF</span>
                  </p>
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 font-cairo text-[14px] text-red-500 text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <motion.button
                  whileTap={(inviteCode.trim() && (roleParam === 'frontdesk' || specialty)) ? { scale: 0.97 } : {}}
                  onClick={handleJoinClinic}
                  disabled={loading || !inviteCode.trim() || (roleParam !== 'frontdesk' && !specialty)}
                  className={`w-full h-[52px] rounded-xl font-cairo font-semibold text-[16px] transition-all mt-6 ${
                    inviteCode.trim() && (roleParam === 'frontdesk' || specialty)
                      ? 'bg-[#2563EB] text-white shadow-md shadow-blue-200 hover:bg-[#1D4ED8]'
                      : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      جاري الانضمام...
                    </span>
                  ) : 'انضم للعيادة'}
                </motion.button>

                <p className="mt-4 font-cairo text-[12px] text-[#9CA3AF] text-center">
                  {roleParam === 'frontdesk'
                    ? 'لو مش معاك كود، تواصل مع الطبيب المسؤول عن العيادة'
                    : 'لو مش معاك كود، اطلبه من الطبيب المسؤول عن العيادة'
                  }
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ─── LEFT PANEL — contextual visual ────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`hidden lg:flex lg:w-[45%] bg-gradient-to-br ${panel.bg} flex-col items-center justify-center px-14 relative overflow-hidden`}
        >
          {/* Background rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {[240, 340, 440].map((size, i) => (
              <motion.div
                key={i}
                className={`absolute rounded-full border ${isJoinBlue ? 'border-[#2563EB]/15' : 'border-[#22C55E]/15'}`}
                style={{ width: size, height: size }}
                animate={{ scale: [1, 1.04, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
              />
            ))}
          </div>

          {/* Icon */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 18 }}
            className={`w-[88px] h-[88px] ${panel.iconBg} rounded-3xl shadow-xl flex items-center justify-center mb-8 relative z-10`}
          >
            {panel.icon}
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={`font-cairo text-[24px] font-bold text-center mb-2 relative z-10 ${isJoinBlue ? 'text-[#1E3A8A]' : 'text-[#064E3B]'}`}
          >
            {panel.heading}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className={`font-cairo text-[14px] text-center mb-10 relative z-10 max-w-[280px] leading-[22px] ${isJoinBlue ? 'text-[#1D4ED8]' : 'text-[#166534]'}`}
          >
            {panel.sub}
          </motion.p>

          <div className="flex flex-col gap-3 w-full max-w-[300px] relative z-10">
            {panel.bullets.map(({ icon, text }, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.1, type: 'spring', stiffness: 260, damping: 22 }}
                className="flex items-center gap-3 bg-white/70 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-sm"
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isJoinBlue ? 'bg-[#DBEAFE]' : 'bg-[#DCFCE7]'}`}>
                  {icon}
                </div>
                <p className={`font-cairo text-[13px] font-medium ${isJoinBlue ? 'text-[#1E3A8A]' : 'text-[#064E3B]'}`}>{text}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

    </div>
  )
}
