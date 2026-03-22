'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Stethoscope, Eye, EyeOff, ChevronRight, Building2, Users } from 'lucide-react'

type AuthTab = 'login' | 'register'
type RegisterRole = 'doctor' | 'frontdesk'

// ─── Egyptian mobile number validation ───────────────────────────────────────
// Covers: Vodafone 010, Etisalat/E& 011, Orange 012, WE 015
const EG_PHONE_RE = /^01[0125][0-9]{8}$/

function isValidEgPhone(v: string) {
  return EG_PHONE_RE.test(v)
}

// ─── Left panel icons ─────────────────────────────────────────────────────────
function PrescriptionIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <polyline points="9 16 11 18 15 14" />
    </svg>
  )
}
function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

const LEFT_FEATURES = [
  { icon: <PrescriptionIcon />, label: 'روشتة رقمية — بدون ورق' },
  { icon: <CalendarIcon />,    label: 'جدولة المواعيد بسهولة' },
  { icon: <ChartIcon />,       label: 'تقارير ومتابعة فورية' },
]

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AuthPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<AuthTab>('login')

  // Shared fields
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Register-only fields
  const [fullName, setFullName]               = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [registerRole, setRegisterRole]       = useState<RegisterRole>('doctor')

  // Touched states for inline validation
  const [nameTouched, setNameTouched]   = useState(false)
  const [phoneTouched, setPhoneTouched] = useState(false)

  // State
  const [isLoading, setIsLoading]   = useState(false)
  const [error, setError]           = useState('')
  const [phoneExists, setPhoneExists] = useState(false)  // duplicate phone flow

  // ── Inline validation ─────────────────────────────────────────────────────

  const nameParts   = fullName.trim().split(/\s+/)
  const isNameValid = nameParts.length >= 2 && nameParts.every(p => p.length >= 1)
  const nameError   = nameTouched && fullName.length > 0 && !isNameValid
    ? 'يرجى إدخال الاسم الأول واسم العائلة'
    : null

  const phoneError = phoneTouched && phone.length > 0 && !isValidEgPhone(phone)
    ? 'أدخل رقم موبايل مصري صحيح (010 / 011 / 012 / 015)'
    : null

  const isPhoneOk = isValidEgPhone(phone)

  const isLoginValid =
    isPhoneOk &&
    password.length >= 8

  const isRegisterValid =
    isNameValid &&
    isPhoneOk &&
    password.length >= 8 &&
    /\d/.test(password) &&
    confirmPassword.length >= 8 &&
    password === confirmPassword

  const isFormValid = activeTab === 'login' ? isLoginValid : isRegisterValid

  // ── Tab switch ────────────────────────────────────────────────────────────
  function switchTab(tab: AuthTab) {
    setActiveTab(tab)
    setError('')
    setPhoneExists(false)
    setNameTouched(false)
    setPhoneTouched(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isFormValid) return

    setIsLoading(true)
    setError('')
    setPhoneExists(false)

    try {
      if (activeTab === 'register') {
        // Step 1: Check duplicate phone
        const checkRes  = await fetch('/api/auth/check-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: `+20${phone}` }),
        })
        const checkData = await checkRes.json()

        if (checkData.exists) {
          setPhoneExists(true)   // shows actionable banner instead of plain error
          setIsLoading(false)
          return
        }

        // Step 2: Register
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone:    `+20${phone}`,
            password,
            fullName: fullName.trim(),
            role:     registerRole,
          }),
        })

        if (!res.ok) {
          const data = await res.json()
          // Catch duplicate detected at DB level (race condition)
          if (res.status === 409) {
            setPhoneExists(true)
          } else {
            throw new Error(data.error || 'حدث خطأ. حاول مرة أخرى.')
          }
          setIsLoading(false)
          return
        }

        // Step 3: Store pending registration for OTP auto-login
        try {
          sessionStorage.setItem('pendingRegistration', JSON.stringify({
            phone:    `+20${phone}`,
            password,
            role:     registerRole,
          }))
        } catch { /* sessionStorage unavailable */ }

        // Step 4: Send OTP
        await fetch('/api/auth/send-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: `+20${phone}`, purpose: 'registration' }),
        })

        router.push(`/otp?phone=${encodeURIComponent(`+20${phone}`)}&purpose=registration`)

      } else {
        // Login — try doctor then frontdesk
        let loginSuccess = false

        for (const role of ['doctor', 'frontdesk'] as const) {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: `+20${phone}`, password, role }),
          })

          if (res.ok) {
            loginSuccess = true
            router.push('/')
            router.refresh()
            break
          }

          if (res.status !== 401) {
            const data = await res.json()
            throw new Error(data.error || 'حدث خطأ. حاول مرة أخرى.')
          }
        }

        if (!loginSuccess) {
          throw new Error('بيانات الدخول غير صحيحة')
        }
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" className="min-h-screen bg-white flex flex-col lg:flex-row overflow-hidden">

      {/* ══════════════════════════════════════════
          LEFT PANEL — Brand trust panel (desktop only)
      ══════════════════════════════════════════ */}
      <div className="hidden lg:flex lg:w-[48%] bg-gradient-to-br from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0] flex-col items-center justify-center px-14 xl:px-20 relative overflow-hidden">

        {/* Soft background ring */}
        <div className="absolute w-[500px] h-[500px] rounded-full border border-[#16A34A]/10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" />

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center"
        >
          <div className="w-16 h-16 bg-[#16A34A] rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <Stethoscope className="w-8 h-8 text-white" strokeWidth={1.5} />
          </div>
          <span className="font-inter text-[22px] font-semibold text-[#0F172A]">MedAssist</span>
          <p className="mt-2 font-cairo text-[15px] text-[#4B5563] leading-relaxed max-w-[280px]">
            نظام إدارة عيادات متكامل للأطباء وفريق الاستقبال
          </p>
        </motion.div>

        {/* Feature highlights */}
        <div className="mt-10 flex flex-col gap-3 w-full max-w-[320px]">
          {LEFT_FEATURES.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.12, duration: 0.4 }}
              className="flex items-center gap-3 bg-white/60 backdrop-blur-sm rounded-2xl px-4 py-3 border border-[#E5E7EB]/60"
            >
              <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center flex-shrink-0">
                {f.icon}
              </div>
              <span className="font-cairo text-[14px] font-medium text-[#1F2937]">{f.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Bottom label */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="absolute bottom-8 font-cairo text-[13px] text-[#15803D]/70"
        >
          آمن • موثوق • متاح ٢٤/٧
        </motion.p>
      </div>

      {/* ══════════════════════════════════════════
          RIGHT PANEL — Auth form
      ══════════════════════════════════════════ */}
      <div className="flex-1 lg:w-[52%] flex flex-col min-h-screen lg:min-h-0 lg:overflow-y-auto">

        {/* Back button */}
        <div className="px-4 pt-10 lg:pt-8 lg:px-10 pb-2 flex-shrink-0">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full border-[1.2px] border-[#E2EEE6] flex items-center justify-center hover:bg-[#F0FDF4] transition-colors"
          >
            <ChevronRight className="w-[18px] h-[18px] text-[#888888]" />
          </button>
        </div>

        {/* Mobile logo (hidden on desktop — left panel handles it) */}
        <div className="flex flex-col items-center mt-2 lg:hidden">
          <div className="w-8 h-8 bg-[#16A34A] rounded-lg flex items-center justify-center">
            <Stethoscope className="w-[17px] h-[17px] text-white" strokeWidth={1.5} />
          </div>
          <span className="mt-2 font-inter text-[18px] font-semibold text-[#030712]">MedAssist</span>
        </div>

        {/* Desktop title */}
        <div className="hidden lg:block px-10 mt-4 mb-1">
          <h1 className="font-cairo text-[24px] font-bold text-[#0F172A]">
            {activeTab === 'login' ? 'أهلاً بعودتك 👋' : 'إنشاء حساب جديد'}
          </h1>
          <p className="font-cairo text-[14px] text-[#6B7280] mt-1">
            {activeTab === 'login'
              ? 'سجّل دخولك للوصول إلى لوحة التحكم'
              : 'أنشئ حسابك وابدأ في إدارة عيادتك'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="mx-4 lg:mx-10 mt-4 flex bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg overflow-hidden flex-shrink-0">
          <button
            onClick={() => switchTab('register')}
            className={`flex-1 h-[44px] font-cairo text-[14px] transition-all ${
              activeTab === 'register'
                ? 'font-semibold text-[#16A34A] border-b-2 border-[#16A34A] bg-white'
                : 'font-normal text-[#4B5563]'
            }`}
          >
            إنشاء حساب
          </button>
          <button
            onClick={() => switchTab('login')}
            className={`flex-1 h-[44px] font-cairo text-[14px] transition-all ${
              activeTab === 'login'
                ? 'font-semibold text-[#16A34A] border-b-2 border-[#16A34A] bg-white'
                : 'font-normal text-[#4B5563]'
            }`}
          >
            تسجيل الدخول
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex flex-col px-4 lg:px-10 mt-4 gap-4 flex-1"
        >
          {/* ── Role selector (register only) ── */}
          {activeTab === 'register' && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setRegisterRole('doctor')}
                className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-[1.5px] transition-all ${
                  registerRole === 'doctor'
                    ? 'border-[#16A34A] bg-[#F0FDF4]'
                    : 'border-[#E5E7EB] bg-[#F9FAFB]'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  registerRole === 'doctor' ? 'bg-[#DCFCE7]' : 'bg-[#F3F4F6]'
                }`}>
                  <Building2 className={`w-[18px] h-[18px] ${registerRole === 'doctor' ? 'text-[#16A34A]' : 'text-[#9CA3AF]'}`} />
                </div>
                <div className="text-right">
                  <p className={`font-cairo text-[13px] font-semibold ${registerRole === 'doctor' ? 'text-[#030712]' : 'text-[#4B5563]'}`}>طبيب</p>
                  <p className={`font-cairo text-[10px] mt-0.5 ${registerRole === 'doctor' ? 'text-[#4B5563]' : 'text-[#9CA3AF]'}`}>كتابة الروشتة والتشخيص</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRegisterRole('frontdesk')}
                className={`flex-1 flex items-center gap-3 p-3 rounded-xl border-[1.5px] transition-all ${
                  registerRole === 'frontdesk'
                    ? 'border-[#2563EB] bg-[#EFF6FF]'
                    : 'border-[#E5E7EB] bg-[#F9FAFB]'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  registerRole === 'frontdesk' ? 'bg-[#DBEAFE]' : 'bg-[#F3F4F6]'
                }`}>
                  <Users className={`w-[18px] h-[18px] ${registerRole === 'frontdesk' ? 'text-[#2563EB]' : 'text-[#9CA3AF]'}`} />
                </div>
                <div className="text-right">
                  <p className={`font-cairo text-[13px] font-semibold ${registerRole === 'frontdesk' ? 'text-[#030712]' : 'text-[#4B5563]'}`}>استقبال</p>
                  <p className={`font-cairo text-[10px] mt-0.5 ${registerRole === 'frontdesk' ? 'text-[#4B5563]' : 'text-[#9CA3AF]'}`}>تسجيل المرضى والمواعيد</p>
                </div>
              </button>
            </div>
          )}

          {/* ── Full Name (register only) ── */}
          {activeTab === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-cairo text-[14px] text-[#030712]">الاسم الكامل</label>
              <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  placeholder="الاسم الأول واسم العائلة"
                  className="flex-1 bg-transparent font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] outline-none text-right"
                />
              </div>
              {nameError && (
                <span className="font-cairo text-[12px] text-red-500">{nameError}</span>
              )}
            </div>
          )}

          {/* ── Phone number ── */}
          <div className="flex flex-col gap-1.5">
            <label className="font-cairo text-[14px] text-[#030712] text-right block">رقم الموبايل</label>
            {/* dir="ltr" on the container so +20 is always on the LEFT */}
            <div className="flex items-center gap-2 bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3" dir="ltr">
              <span className="font-inter text-[14px] font-medium text-[#374151] flex-shrink-0">+20</span>
              <div className="w-px h-5 bg-[#E5E7EB] flex-shrink-0" />
              <input
                type="tel"
                value={phone}
                onChange={e => {
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))
                  setPhoneExists(false)
                  setError('')
                }}
                onBlur={() => setPhoneTouched(true)}
                placeholder="01XXXXXXXXX"
                className="flex-1 bg-transparent font-cairo text-[14px] text-[#030712] placeholder:text-[#9CA3AF] outline-none"
                dir="ltr"
                inputMode="numeric"
              />
            </div>
            {phoneError && (
              <span className="font-cairo text-[12px] text-red-500">{phoneError}</span>
            )}
          </div>

          {/* ── Password ── */}
          <div className="flex flex-col gap-1.5">
            <label className="font-cairo text-[14px] text-[#030712] text-right block">كلمة المرور</label>
            <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="p-1 flex-shrink-0">
                {showPassword
                  ? <EyeOff className="w-[18px] h-[18px] text-[#4B5563]" />
                  : <Eye className="w-[18px] h-[18px] text-[#4B5563]" />}
              </button>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent font-cairo text-[14px] text-[#030712] placeholder:text-[#4B5563] outline-none text-right"
              />
            </div>
            {activeTab === 'register' && (
              <span className="font-cairo text-[12px] text-[#4B5563]">على الأقل ٨ أحرف وتحتوي على رقم</span>
            )}
          </div>

          {/* ── Confirm Password (register only) ── */}
          {activeTab === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="font-cairo text-[14px] text-[#030712] text-right block">تأكيد كلمة المرور</label>
              <div className="flex items-center bg-[#F3F4F6] border-[0.8px] border-[#E5E7EB] rounded-lg h-[48px] px-3">
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="p-1 flex-shrink-0">
                  {showConfirmPassword
                    ? <EyeOff className="w-[18px] h-[18px] text-[#4B5563]" />
                    : <Eye className="w-[18px] h-[18px] text-[#4B5563]" />}
                </button>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent font-cairo text-[14px] text-[#030712] placeholder:text-[#4B5563] outline-none text-right"
                />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <span className="font-cairo text-[12px] text-red-500">كلمات المرور غير متطابقة</span>
              )}
            </div>
          )}

          {/* ── Forgot password (login only) ── */}
          {activeTab === 'login' && (
            <div className="flex justify-start">
              <button
                type="button"
                onClick={() => router.push('/reset-password')}
                className="font-cairo text-[14px] text-[#16A34A] font-medium hover:underline"
              >
                نسيت كلمة المرور؟
              </button>
            </div>
          )}

          {/* ── Duplicate phone banner ── */}
          <AnimatePresence>
            {phoneExists && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-4 flex flex-col gap-3"
              >
                <p className="font-cairo text-[13px] font-semibold text-[#92400E] text-right">
                  هذا الرقم مرتبط بحساب موجود بالفعل
                </p>
                <p className="font-cairo text-[12px] text-[#78350F] text-right leading-5">
                  يمكنك تسجيل الدخول مباشرة أو إعادة تعيين كلمة المرور إذا نسيتها.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className="flex-1 h-9 rounded-lg bg-[#16A34A] text-white font-cairo text-[13px] font-semibold hover:bg-[#15803D] transition-colors"
                  >
                    تسجيل الدخول
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/reset-password')}
                    className="flex-1 h-9 rounded-lg border border-[#D97706] text-[#92400E] font-cairo text-[13px] font-semibold hover:bg-[#FEF3C7] transition-colors"
                  >
                    نسيت كلمة المرور؟
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Generic error ── */}
          {error && !phoneExists && (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="font-cairo text-[13px] text-red-500 text-center"
            >
              {error}
            </motion.p>
          )}

          {/* ── Submit ── */}
          {!phoneExists && (
            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className={`w-full h-[48px] rounded-lg font-cairo font-semibold text-[16px] transition-all mt-1 ${
                isFormValid && !isLoading
                  ? 'bg-[#22C55E] text-white active:scale-[0.98] hover:bg-[#16A34A]'
                  : isLoading
                    ? 'bg-[#22C55E]/70 text-white cursor-wait'
                    : 'bg-[#E5E7EB] text-[#9CA3AF] cursor-not-allowed'
              }`}
            >
              {isLoading
                ? (activeTab === 'login' ? 'جاري الدخول...' : 'جاري التسجيل...')
                : activeTab === 'login'
                  ? 'تسجيل الدخول'
                  : 'إنشاء حساب'
              }
            </button>
          )}

          {/* Incomplete hint */}
          {!isFormValid && !isLoading && !phoneExists && (
            <p className="font-cairo text-[12px] text-[#9CA3AF] text-center">
              أكمل جميع الحقول للمتابعة
            </p>
          )}

          {/* Terms (register only) */}
          {activeTab === 'register' && (
            <p className="font-cairo text-[12px] text-[#4B5563] text-center pb-2">
              بإنشاء حساب، أنت توافق على{' '}
              <Link href="/terms" className="underline text-[#15803D] font-medium">الشروط</Link>
              {' '}و{' '}
              <Link href="/privacy" className="underline text-[#15803D] font-medium">سياسة الخصوصية</Link>
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1 py-6 px-4 flex-shrink-0">
          <span className="font-cairo text-[12px] text-[#4B5563]">
            {activeTab === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}
          </span>
          <button
            onClick={() => switchTab(activeTab === 'login' ? 'register' : 'login')}
            className="font-cairo text-[12px] font-semibold text-[#16A34A] hover:underline"
          >
            {activeTab === 'login' ? 'أنشئ واحد' : 'سجل دخولك'}
          </button>
        </div>
      </div>
    </div>
  )
}
